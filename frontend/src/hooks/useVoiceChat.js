import { useState, useRef, useCallback, useEffect } from 'react'
import { io } from 'socket.io-client'

// Enhanced voice chat hook with hybrid VAD + STT approach
// Supports interruptible TTS and WebSocket streaming with abort
export function useVoiceChat() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [latency, setLatency] = useState(0)

  // Refs for voice chat state
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const lastSpeechTimeRef = useRef(0)
  const silenceTimeoutRef = useRef(null)
  const isSpeakingRef = useRef(false) // Sync ref for VAD callback to avoid stale state

  // Refs for interruptible TTS
  const currentSourceRef = useRef(null)
  const currentAudioContextRef = useRef(null)
  const speechSynthesisRef = useRef(null)
  const socketRef = useRef(null)
  const interruptRef = useRef(null) // Ref to store interrupt function for VAD callback
const isInterruptingRef = useRef(false) // Flag to skip error handling during intentional interrupt

  // WebRTC-based Voice Activity Detection
  const setupVAD = useCallback(async () => {
    try {
      if (!window.isSecureContext) {
        console.warn('getUserMedia requires HTTPS or localhost context')
        return false
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('MediaDevices API not supported')
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      mediaStreamRef.current = stream

      if (!window.AudioContext && !window.webkitAudioContext) {
        console.warn('AudioContext not supported')
        return false
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      audioContextRef.current = new AudioContextClass()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()

      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8

      source.connect(analyserRef.current)

      return true
    } catch (error) {
      console.error('Failed to setup VAD:', error)
      return false
    }
  }, [])

  // Check audio level for voice activity
  const checkAudioLevel = useCallback(() => {
    if (!analyserRef.current) return false

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const threshold = 30

    const isSpeech = average > threshold
    const now = Date.now()

    if (isSpeech) {
      lastSpeechTimeRef.current = now
    }

    return isSpeech
  }, [])

  // Browser SpeechRecognition API setup
  const setupSpeechRecognition = useCallback(() => {
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
        } else {
          interimTranscript += transcript
        }
      }

      setTranscript(finalTranscript + interimTranscript)

      if (finalTranscript) {
        setTranscript(finalTranscript.trim())
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
    }

    recognition.onend = () => {
      console.log('Speech recognition ended')
      if (isListening) {
        recognition.start()
      }
    }

    return recognition
  }, [isListening])

  // Start listening with hybrid VAD + STT
  const startListening = useCallback(async () => {
    try {
      // If currently speaking, interrupt first
      if (isSpeaking) {
        interrupt()
      }

      const vadReady = await setupVAD()
      if (!vadReady) {
        throw new Error('Failed to setup voice activity detection')
      }

      const recognition = setupSpeechRecognition()
      if (!recognition) {
        throw new Error('SpeechRecognition not supported')
      }

      recognitionRef.current = recognition
      recognition.start()

      setIsListening(true)
      setTranscript('')

      // Abort any ongoing socket connection when user starts speaking
      if (socketRef.current) {
        socketRef.current.emit('abort')
        socketRef.current.disconnect()
        socketRef.current = null
      }

      // Start VAD monitoring
      const vadInterval = setInterval(() => {
        if (!isListening) {
          clearInterval(vadInterval)
          return
        }

        const isSpeech = checkAudioLevel()
        const now = Date.now()

        if (isSpeech) {
          // Speech detected - clear any existing silence timeout and abort TTS if playing
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }
          // If TTS is playing, interrupt it when user starts speaking
          if (isSpeakingRef.current && interruptRef.current) {
            interruptRef.current()
          }
        } else {
          // Silence detected - set timeout to stop listening after 2 seconds of silence
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              if (isListening) {
                stopListening()
              }
            }, 2000)
          }
        }
      }, 100)

      return () => clearInterval(vadInterval)
    } catch (error) {
      console.error('Failed to start listening:', error)
      setIsListening(false)
    }
  }, [setupVAD, setupSpeechRecognition, checkAudioLevel, isListening])

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    setIsListening(false)

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
  }, [])

  // Speak with interruptible playback
  const speak = useCallback(async (text, options = {}) => {
    // Interrupt any ongoing speech first
    interrupt()

    try {
      // Browser TTS uses client-side speechSynthesis
      if (options.provider === 'browser' || !options.provider) {
        return new Promise((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 1.0
          utterance.pitch = 1.0
          if (options.voice) {
            const voices = speechSynthesis.getVoices()
            const selectedVoice = voices.find(v => v.name === options.voice || v.voiceURI === options.voice)
            if (selectedVoice) utterance.voice = selectedVoice
          }
          utterance.onend = () => {
            setIsSpeaking(false); isSpeakingRef.current = false
            speechSynthesisRef.current = null
            resolve(true)
          }
 utterance.onerror = (e) => {
      if (isInterruptingRef.current) {
        // Intentional interrupt - not a real error
        speechSynthesisRef.current = null
        resolve(false)
        return
      }
      console.error('Browser TTS error:', e)
      setIsSpeaking(false); isSpeakingRef.current = false
      speechSynthesisRef.current = null
      resolve(false)
    }
          setIsSpeaking(true); isSpeakingRef.current = true
          speechSynthesisRef.current = utterance
          speechSynthesis.speak(utterance)
        })
      }

      // Server-side TTS (Piper, Coqui) - fallback to browser TTS on failure
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: options.voice })
      })

      if (!response.ok) {
        const error = await response.json()
        console.warn('Server TTS failed, falling back to browser TTS:', error.error)
        return new Promise((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 1.0
          utterance.pitch = 1.0
          utterance.onend = () => {
            setIsSpeaking(false); isSpeakingRef.current = false
            speechSynthesisRef.current = null
            resolve(true)
          }
 utterance.onerror = (e) => {
      if (isInterruptingRef.current) {
        // Intentional interrupt - not a real error
        speechSynthesisRef.current = null
        resolve(false)
        return
      }
      console.error('Browser TTS error:', e)
      setIsSpeaking(false); isSpeakingRef.current = false
      speechSynthesisRef.current = null
      resolve(false)
    }
          setIsSpeaking(true); isSpeakingRef.current = true
          speechSynthesisRef.current = utterance
          speechSynthesis.speak(utterance)
        })
      }

      const audioBuffer = await response.arrayBuffer()

      // Play audio with interruptible source
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioData = await audioContext.decodeAudioData(audioBuffer)
      const source = audioContext.createBufferSource()
      source.buffer = audioData
      source.connect(audioContext.destination)

      // Store refs for interruption
      currentSourceRef.current = source
      currentAudioContextRef.current = audioContext

      setIsSpeaking(true); isSpeakingRef.current = true

      return new Promise((resolve) => {
        source.onended = () => {
          currentSourceRef.current = null
          currentAudioContextRef.current = null
          audioContext.close()
          setIsSpeaking(false); isSpeakingRef.current = false
          resolve(true)
        }
        source.start()
      })
    } catch (error) {
      console.error('Speech synthesis error:', error)
      setIsSpeaking(false); isSpeakingRef.current = false
      currentSourceRef.current = null
      currentAudioContextRef.current = null
      return false
    }
  }, [])

  // Interrupt current speech - can be called from anywhere
  const interrupt = useCallback(() => {
    // Stop speechSynthesis if playing
    isInterruptingRef.current = true
  if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
    }
    speechSynthesisRef.current = null

    // Stop AudioBufferSourceNode if playing
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop()
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null
    }

    // Close AudioContext if open
    if (currentAudioContextRef.current) {
      try {
        currentAudioContextRef.current.close()
      } catch (e) {
        // Ignore if already closed
      }
      currentAudioContextRef.current = null
    }

    setIsSpeaking(false); isSpeakingRef.current = false
  }, [])

  // Store interrupt function in ref for use by VAD callback
  interruptRef.current = interrupt

  // Socket.io connection for WebSocket streaming with abort support
  const connectSocket = useCallback((threadId, callbacks = {}) => {
    // Disconnect existing socket
    if (socketRef.current) {
      socketRef.current.disconnect()
    }

    const socket = io('http://localhost:4001', {
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
      // Quick answer token for immediate TTS playback
      if (callbacks.onQuickToken) callbacks.onQuickToken(data)
    })

    socket.on('thinking', (data) => {
      if (callbacks.onThinking) callbacks.onThinking(data)
    })

    socket.on('complete', (data) => {
      if (callbacks.onComplete) callbacks.onComplete(data)
      setIsSpeaking(false); isSpeakingRef.current = false
    })

    // Also handle stream_* events from Socket.io streaming
    socket.on('stream_complete', (data) => {
      if (callbacks.onComplete) callbacks.onComplete(data)
      setIsSpeaking(false); isSpeakingRef.current = false
    })

    socket.on('stream_error', (data) => {
      if (callbacks.onError) callbacks.onError(data)
      setIsSpeaking(false); isSpeakingRef.current = false
    })

    socket.on('stream_aborted', (data) => {
 console.log('Stream aborted by server')
 if (interruptRef.current) {
   interruptRef.current()
 }
 setIsSpeaking(false); isSpeakingRef.current = false
 })

    socket.on('error', (data) => {
      if (callbacks.onError) callbacks.onError(data)
      setIsSpeaking(false); isSpeakingRef.current = false
    })

    socket.on('abort_ack', () => {
      console.log('Server acknowledged abort')
      setIsSpeaking(false); isSpeakingRef.current = false
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

  const getVoices = useCallback(async () => {
    try {
      const response = await fetch('/api/tts/voices')
      if (response.ok) {
        const data = await response.json()
        return data.voices
      }
    } catch (error) {
      console.error('Failed to get voices:', error)
    }
    if ('speechSynthesis' in window) {
      return speechSynthesis.getVoices()
    }
    return []
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      if (interruptRef.current) {
        interruptRef.current()
      }
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [stopListening])

  return {
    // State
    isListening,
    isSpeaking,
    transcript,
    latency,

    // Actions
    startListening,
    stopListening,
    speak,
    interrupt,
    abortGeneration,
    connectSocket,
    getSocket,
    getVoices
  }
}