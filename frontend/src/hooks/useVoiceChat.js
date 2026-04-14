import { useState, useRef, useCallback, useEffect } from 'react'

// Enhanced voice chat hook with hybrid VAD + STT approach
export function useVoiceChat() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [latency, setLatency] = useState(0)

  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const lastSpeechTimeRef = useRef(0)
  const silenceTimeoutRef = useRef(null)

  // WebRTC-based Voice Activity Detection
  const setupVAD = useCallback(async () => {
    try {
      // Check if we're in a secure context (HTTPS required for getUserMedia)
      if (!window.isSecureContext) {
        console.warn('getUserMedia requires HTTPS or localhost context')
        return false
      }

      // Check if mediaDevices is available
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

      // Check if AudioContext is available
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

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const threshold = 30 // Adjustable threshold

    const isSpeech = average > threshold
    const now = Date.now()

    if (isSpeech) {
      lastSpeechTimeRef.current = now
    }

    return isSpeech
  }, [])

  // Browser SpeechRecognition API setup
  const setupSpeechRecognition = useCallback(() => {
    // Check for SpeechRecognition support
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

      // Update transcript with both final and interim results
      setTranscript(finalTranscript + interimTranscript)

      // If we have final results, reset interim
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
        // Restart recognition if we're still listening
        recognition.start()
      }
    }

    return recognition
  }, [isListening])

  // Start listening with hybrid VAD + STT
  const startListening = useCallback(async () => {
    try {
      // Setup WebRTC VAD
      const vadReady = await setupVAD()
      if (!vadReady) {
        throw new Error('Failed to setup voice activity detection')
      }

      // Setup SpeechRecognition
      const recognition = setupSpeechRecognition()
      if (!recognition) {
        throw new Error('SpeechRecognition not supported')
      }

      recognitionRef.current = recognition
      recognition.start()

      setIsListening(true)
      setTranscript('')

      // Start VAD monitoring
      const vadInterval = setInterval(() => {
        if (!isListening) {
          clearInterval(vadInterval)
          return
        }

        const isSpeech = checkAudioLevel()
        const now = Date.now()

        if (isSpeech) {
          // Speech detected - clear any existing silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
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

const speak = useCallback(async (text, options = {}) => {
  try {
    const response = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: options.voice })
    })
    if (!response.ok) {
      const error = await response.json()
      console.error('TTS error:', error.error)
      return false
    }
    const audioBuffer = await response.arrayBuffer()
    // Play audio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const audioData = await audioContext.decodeAudioData(audioBuffer)
    const source = audioContext.createBufferSource()
    source.buffer = audioData
    source.connect(audioContext.destination)
    setIsSpeaking(true)
    return new Promise((resolve) => {
      source.onended = () => {
        audioContext.close()
        setIsSpeaking(false)
        resolve(true)
      }
      source.start()
    })
  } catch (error) {
    console.error('Speech synthesis error:', error)
    setIsSpeaking(false)
    return false
  }
}, [])

  // Interrupt current speech
  const interrupt = useCallback(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
      setIsSpeaking(false)
    }
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
  // Fallback to browser voices if ('speechSynthesis' in window) {
    return speechSynthesis.getVoices()
  }
  return []
}, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      interrupt()
    }
  }, [stopListening, interrupt])

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
    getVoices
  }
}