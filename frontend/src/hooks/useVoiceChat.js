import { useState, useRef, useCallback, useEffect } from 'react'
import io from 'socket.io-client'

// Voice chat hook with VAD + live transcription + auto-send
export function useVoiceChat() {
  const [isListening, setIsListening] = useState(false)
  const [isRecording, setIsRecording] = useState(false) // Push-to-talk state
  const [transcript, setTranscript] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [voiceMode, setVoiceModeState] = useState('continuous') // 'continuous' | 'push-to-talk'
  const [isInterrupting, setIsInterrupting] = useState(false)

  // Refs for voice chat state
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const animFrameRef = useRef(null)
  const lastSpeechTimeRef = useRef(0)
  const silenceTimeoutRef = useRef(null)
  const socketRef = useRef(null)
  const interruptRef = useRef(null)
  const isInterruptingRef = useRef(false)
  // Shared ref for interrupt — set on the hook instance so ChatArea can read it
  const userStartedSpeakingRef = useRef(false)
  const isPushingToTalkRef = useRef(false)
  const isListeningRef = useRef(false)
  const pendingTranscriptRef = useRef('')
  const hasSpeechSinceStartRef = useRef(false)
  const hasTranscribedInCurrentMessageRef = useRef(false)

  // WebRTC-based Voice Activity Detection + audio level monitoring
  const setupVAD = useCallback(async () => {
    try {
      // getUserMedia requires HTTPS or localhost — but the browser enforces this.
      // We skip the check here so it works on LAN HTTP access too.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('MediaDevices API not supported')
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })
      mediaStreamRef.current = stream

      if (!window.AudioContext && !window.webkitAudioContext) {
        console.warn('AudioContext not supported')
        return false
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioContextClass()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()

      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      analyserRef.current = analyser

      // Start continuous audio level monitoring via animation frame
      const monitorLevel = () => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate weighted average (emphasize lower frequencies where speech lives)
        let sum = 0
        const weightSum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const weight = 1 + (1 - i / dataArray.length) * 2 // Boost lower freqs
          sum += dataArray[i] * weight
        }
        const level = sum / dataArray.length

        setAudioLevel(level)
        animFrameRef.current = requestAnimationFrame(monitorLevel)
      }
      monitorLevel()

      return true
    } catch (error) {
      console.error('Failed to setup VAD:', error)
      return false
    }
  }, [])

  // Stop audio level monitoring
  const stopAudioMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    setAudioLevel(0)
  }, [])

  // Browser SpeechRecognition API setup
  const setupSpeechRecognition = useCallback((onFinalTranscript, onInterim) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not supported')
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      console.log('Speech recognition started')
    }

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
          // Call the callback with final transcript
          if (onFinalTranscript) {
            onFinalTranscript(finalTranscript.trim())
          }
        } else {
          interimTranscript += transcript
          // Mark that user has started speaking — triggers interrupt
          if (transcript.trim()) {
            if (onInterim) onInterim(transcript.trim())
          }
        }
      }

      // Update live transcript (final + interim)
      const liveTranscript = finalTranscript + interimTranscript
      // Use requestAnimationFrame to avoid blocking the recognition thread
      requestAnimationFrame(() => {
        setTranscript(liveTranscript.trim())
        pendingTranscriptRef.current = liveTranscript.trim()
      })
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      const active = isPushingToTalkRef.current || isListening
      if (event.error === 'no-speech') {
        // Silently restart for no-speech errors
        if (active) {
          try { recognition.start() } catch (e) {}
        }
      } else if (event.error === 'not-allowed') {
        console.warn('Microphone permission denied')
        setIsListening(false)
        setIsRecording(false)
      }
    }

    recognition.onend = () => {
      console.log('Speech recognition ended')
      // Auto-restart if we should still be listening
      // Use refs (not state) to avoid stale closures
      const isPushing = isPushingToTalkRef.current
      const isContListening = isListeningRef.current
      if (isPushing || isContListening) {
        console.log('Auto-restarting speech recognition...')
        // Chrome sometimes auto-stops continuous recognition.
        // Restart immediately with retries.
        let retries = 0
        const attemptRestart = () => {
          try {
            recognition.start()
            console.log('Speech recognition restarted')
          } catch (e) {
            retries++
            if (retries < 5 && (isPushingToTalkRef.current || isListeningRef.current)) {
              console.log('Restart failed, retrying...', e.error)
              setTimeout(attemptRestart, 200)
            }
          }
        }
        attemptRestart()
      }
    }

    return recognition
  }, [])

  // Start listening in continuous mode (auto-detect speech, auto-send on silence)
  const startContinuousListening = useCallback(async (onTranscript) => {
    try {
      const vadReady = await setupVAD()
      if (!vadReady) {
        throw new Error('Failed to setup voice activity detection')
      }

      let finalTranscript = ''

      const recognition = setupSpeechRecognition(
        (finalText) => {
          finalTranscript = finalText
          hasSpeechSinceStartRef.current = true
          hasTranscribedInCurrentMessageRef.current = true
          lastSpeechTimeRef.current = Date.now()

          // Notify caller when a word/phrase is transcribed (for interrupt)
          if (onTranscript) {
            onTranscript(finalText)
          }

          // Clear any existing silence timeout when speech is detected
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }
        },
        (interimText) => {
          // Mark that user has started speaking on first interim result
          // — triggers interrupt immediately, before user finishes talking
          if (interimText.trim()) {
            hasTranscribedInCurrentMessageRef.current = true
            userStartedSpeakingRef.current = true
          }
        }
      )

      if (!recognition) {
        throw new Error('SpeechRecognition not supported')
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
      isListeningRef.current = true
      setTranscript('')
      hasSpeechSinceStartRef.current = false
      hasTranscribedInCurrentMessageRef.current = false

      // Monitor audio levels for VAD feedback
      const vadInterval = setInterval(() => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        setAudioLevel(average)
      }, 100)

      return vadInterval
    } catch (error) {
      console.error('Failed to start continuous listening:', error)
      setIsListening(false)
      return null
    }
  }, [setupVAD, setupSpeechRecognition])

  // Start push-to-talk mode (reuses existing AudioContext if available)
  const startPushToTalk = useCallback(async () => {
    if (isPushingToTalkRef.current) return
    isPushingToTalkRef.current = true
    setIsRecording(true)
    setTranscript('')
    hasSpeechSinceStartRef.current = false
    pendingTranscriptRef.current = ''

    try {
      // Reuse existing AudioContext if available (from continuous mode)
      if (!audioContextRef.current) {
        const vadReady = await setupVAD()
        if (!vadReady) {
          isPushingToTalkRef.current = false
          setIsRecording(false)
          throw new Error('Failed to setup microphone')
        }
      }

      const recognition = setupSpeechRecognition(() => {
        hasSpeechSinceStartRef.current = true
      })

      if (!recognition) {
        isPushingToTalkRef.current = false
        setIsRecording(false)
        throw new Error('SpeechRecognition not supported')
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      console.error('Failed to start push-to-talk:', error)
      isPushingToTalkRef.current = false
      setIsRecording(false)
    }
  }, [setupVAD, setupSpeechRecognition])

  // Stop push-to-talk and send transcript
  const stopPushToTalk = useCallback((onSend) => {
    isPushingToTalkRef.current = false
    setIsRecording(false)

    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    // Small delay to let final transcripts come through
    setTimeout(() => {
      const finalText = pendingTranscriptRef.current || transcript
      if (finalText.trim() && onSend) {
        onSend(finalText.trim())
      }
      pendingTranscriptRef.current = ''
      setTranscript('')
    }, 300)
  }, [transcript])

  // Stop all listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (analyserRef.current) {
      analyserRef.current = null
    }

    stopAudioMonitoring()

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    setIsListening(false)
    isListeningRef.current = false
    setIsRecording(false)
    setTranscript('')
    setAudioLevel(0)
    hasSpeechSinceStartRef.current = false
    hasTranscribedInCurrentMessageRef.current = false
    pendingTranscriptRef.current = ''
  }, [stopAudioMonitoring])

  // Interrupt current operation
  const interrupt = useCallback(() => {
    isInterruptingRef.current = true
    setIsInterrupting(true)

    // Stop speechSynthesis if playing
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    // Reset interrupt flag after a brief delay
    setTimeout(() => {
      isInterruptingRef.current = false
      setIsInterrupting(false)
    }, 500)
  }, [])

  // Store interrupt function in ref
  interruptRef.current = interrupt

  // Socket.io connection for WebSocket streaming with abort support
  const connectSocket = useCallback((threadId, callbacks = {}) => {
    if (socketRef.current) {
      socketRef.current.disconnect()
    }

    // Use same-origin (proxied through Vite) to avoid mixed-content issues
    const socket = io(undefined, {
      transports: ['websocket']
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Socket connected')
      socket.emit('join_thread', { threadId })
    })

    socket.on('token', (data) => {
      if (callbacks.onToken) callbacks.onToken(data)
    })

    socket.on('quick_token', (data) => {
      if (callbacks.onQuickToken) callbacks.onQuickToken(data)
    })

    socket.on('thinking', (data) => {
      if (callbacks.onThinking) callbacks.onThinking(data)
    })

    socket.on('complete', (data) => {
      if (callbacks.onComplete) callbacks.onComplete(data)
    })

    socket.on('stream_complete', (data) => {
      if (callbacks.onComplete) callbacks.onComplete(data)
    })

    socket.on('stream_error', (data) => {
      if (callbacks.onError) callbacks.onError(data)
    })

    socket.on('stream_aborted', (data) => {
      console.log('Stream aborted by server')
      if (callbacks.onComplete) callbacks.onComplete({})
      if (interruptRef.current) {
        interruptRef.current()
      }
    })

    socket.on('error', (data) => {
      if (callbacks.onError) callbacks.onError(data)
    })

    socket.on('abort_ack', () => {
      console.log('Server acknowledged abort')
    })

    return socket
  }, [])

  // Send abort signal to server
  const abortGeneration = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('abort')
    }
    if (interruptRef.current) {
      interruptRef.current()
    }
  }, [])

  // Get socket instance
  const getSocket = useCallback(() => {
    return socketRef.current
  }, [])

  // Set voice mode
  const setVoiceMode = useCallback((mode) => {
    setVoiceModeState(mode)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [stopListening])

  return {
    // State
    isListening,
    isRecording,
    transcript,
    audioLevel,
    voiceMode,
    isInterrupting,
    userStartedSpeaking: userStartedSpeakingRef.current,
    userStartedSpeakingRef,
    resetInterruptFlag: () => {
      userStartedSpeakingRef.current = false
      hasTranscribedInCurrentMessageRef.current = false
    },

    // Actions
    startListening: startContinuousListening,
    startPushToTalk,
    stopPushToTalk,
    stopListening,
    interrupt,
    abortGeneration,
    connectSocket,
    getSocket,
    setVoiceMode
  }
}
