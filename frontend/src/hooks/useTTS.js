import { useState, useEffect, useCallback, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'

/**
 * Text-to-Speech hook supporting both Browser Web Speech API and Piper TTS
 */
export function useTTS() {
  const [availableVoices, setAvailableVoices] = useState([])
  const [availablePiperModels, setAvailablePiperModels] = useState([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPiperAvailable, setIsPiperAvailable] = useState(false)
  const [voiceProvider, setVoiceProviderState] = useState('browser')
  const [ttsSettings, setTtsSettingsState] = useState(null)

  const synthRef = useRef(null)
  const preferredVoiceRef = useRef(null)
  const audioRef = useRef(null)
  const piperConfigRef = useRef({ host: 'localhost', port: 5001, enabled: false, model: 'en_US-lessac-medium' })

  // Streaming TTS state
  const currentStreamContentRef = useRef('')
  const spokenChunksRef = useRef(new Set())  // track ALL chunks that have been spoken
  const lastStableContentRef = useRef('')    // content that was stable before the last token

  const {
    ttsEnabled,
    ttsMuted,
    preferredVoice,
    toggleTtsEnabled,
    toggleTtsMuted,
    setPreferredVoiceDb
  } = useChatStore()

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && ('speechSynthesis' in window || 'webkitSpeechSynthesis' in window)) {
      synthRef.current = window.speechSynthesis || window.webkitSpeechSynthesis
      loadVoices()
    }

    // Load TTS settings from backend
    loadTtsSettings()

    return () => {
      stop()
    }
  }, [])

  // Load TTS settings from backend
  const loadTtsSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/tts/settings')
      if (res.ok) {
        const settings = await res.json()
        setTtsSettingsState(settings)
        setVoiceProviderState(settings.voice_provider || 'browser')

        if (settings.piper) {
          piperConfigRef.current = {
            host: settings.piper.host,
            port: settings.piper.port,
            enabled: settings.piper.enabled,
            model: settings.piper.model
          }
          // Check real health instead of relying on stored flag
          checkPiperStatus()
        }
      }

      // Also fetch piper models
      loadPiperModels()
    } catch (error) {
      console.log('Failed to load TTS settings:', error)
    }
  }, [])

  // Load available Piper models from server
  const loadPiperModels = useCallback(async () => {
    try {
      const res = await fetch('/api/tts/piper/models')
      if (res.ok) {
        const data = await res.json()
        if (data.models && Array.isArray(data.models)) {
          setAvailablePiperModels(data.models)
        }
      }
    } catch (error) {
      console.log('Failed to load Piper models:', error)
    }
  }, [])

  // Check Piper server availability
  const checkPiperStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tts/piper/health')
      if (res.ok) {
        const data = await res.json()
        setIsPiperAvailable(data.available)
        return data.available
      }
    } catch {
      setIsPiperAvailable(false)
    }
    setIsPiperAvailable(false)
    return false
  }, [])

  // Save TTS settings to backend
  const saveTtsSettings = useCallback(async (settings) => {
    try {
      await fetch('/api/tts/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      loadTtsSettings()
    } catch (error) {
      console.error('Failed to save TTS settings:', error)
    }
  }, [loadTtsSettings])

  // Load available voices
  const loadVoices = useCallback(() => {
    if (!synthRef.current) return

    const load = () => {
      const voices = synthRef.current.getVoices()
      if (voices.length > 0) {
        setAvailableVoices(voices.map(v => ({
          id: v.voiceURI || v.name,
          name: v.name,
          lang: v.lang,
          default: v.default,
          localService: v.localService
        })))
        setIsLoadingVoices(false)

        // Try to restore preferred voice
        if (preferredVoice) {
          const match = voices.find(v => v.voiceURI === preferredVoice || v.name === preferredVoice)
          if (match) {
            preferredVoiceRef.current = match
          }
        }
      }
    }

    load()

    // Chrome loads voices asynchronously
    synthRef.current.onvoiceschanged = load
  }, [preferredVoice])

  // Set voice provider (browser or piper)
  const setVoiceProvider = useCallback((provider) => {
    setVoiceProviderState(provider)
    saveTtsSettings({ voice_provider: provider })
  }, [saveTtsSettings])

  // Set preferred voice
  const setPreferredVoice = useCallback((voiceId) => {
    if (voiceProvider === 'browser' && synthRef.current) {
      const voices = synthRef.current.getVoices()
      const match = voices.find(v => v.voiceURI === voiceId || v.name === voiceId)

      if (match) {
        preferredVoiceRef.current = match
        setPreferredVoiceDb(voiceId)
        saveTtsSettings({ preferred_voice: voiceId })
      }
    } else {
      // For Piper, just save the voice ID (which is the model name)
      setPreferredVoiceDb(voiceId)
      saveTtsSettings({ preferred_voice: voiceId })
      piperConfigRef.current.model = voiceId
      saveTtsSettings({ piper: { model: voiceId } })
    }
  }, [voiceProvider, setPreferredVoiceDb, saveTtsSettings])

  // Helper to strip markdown symbols and emojis
  const sanitizeText = (t) => {
    // Remove common markdown characters (*, _, `, ~)
    let cleaned = t.replace(/[\*_`~]/g, '')
    // Remove emojis (Unicode Emoji Presentation characters)
    try {
      cleaned = cleaned.replace(/\p{Emoji_Presentation}/gu, '')
    } catch (e) {
      // Fallback: strip known emoji ranges (Supplementary Multilingual Plane)
      cleaned = cleaned.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    }
    return cleaned
  }

  // Stop any ongoing speech
  const stop = useCallback(() => {
    // Stop browser TTS
    if (synthRef.current) {
      synthRef.current.cancel()
    }

    // Stop Piper audio playback
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    setIsSpeaking(false)
  }, [])

  // Split text into sentences for natural streaming
  const splitIntoSentences = useCallback((text) => {
    const sentenceRegex = /[.!?]+(\s|$)+/g
    let sentences = []
    let lastIndex = 0
    let match

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = text.substring(lastIndex, match.index + match[0].length).trim()
      if (sentence) {
        sentences.push(sentence)
      }
      lastIndex = match.index + match[0].length
    }

    const remaining = text.substring(lastIndex).trim()
    if (remaining) {
      sentences.push(remaining)
    }

    return sentences.filter(s => s.length > 0)
  }, [])

  // Split text into natural speaking chunks (clauses, sentences, etc.)
  const splitIntoChunks = useCallback((text) => {
    // Prioritize sentence-ending punctuation
    const sentenceRegex = /([.!?]+)(\s|$)/g
    let chunks = []
    let lastIndex = 0
    let match

    while ((match = sentenceRegex.exec(text)) !== null) {
      const chunk = text.substring(lastIndex, match.index + match[0].length).trim()
      if (chunk) {
        chunks.push(chunk)
      }
      lastIndex = match.index + match[0].length
    }

    const remaining = text.substring(lastIndex).trim()
    if (remaining) {
      chunks.push(remaining)
    }

    return chunks.filter(c => c.length > 0)
  }, [])

  // Check if text is "complete enough" to speak (has a sentence boundary or is long enough)
  const isSpeakableChunk = useCallback((text) => {
    if (!text || text.length < 10) return false
    // Check for sentence-ending punctuation
    if (/[.!?]+$/.test(text.trim())) return true
    // Check for natural break points (commas, semicolons) with enough content
    const trimmed = text.trim()
    if (trimmed.length > 30 && (/[,.;:]/.test(trimmed[trimmed.length - 1]) || trimmed.length > 60)) return true
    return false
  }, [])

  // Start streaming TTS for a new response
  const startStreamingTTS = useCallback(() => {
    stop()
    currentStreamContentRef.current = ''
    lastStableContentRef.current = ''
    spokenChunksRef.current = new Set()
  }, [stop])

  // Feed streaming content — speak any new complete chunks
  const feedStreamingTTS = useCallback((content) => {
    currentStreamContentRef.current = content
    const chunks = splitIntoChunks(content)

    // Only speak the last chunk — it's the one most likely to be complete
    // Ignore earlier chunks since they're already spoken (tracked in spokenChunksRef)
    const lastChunk = chunks[chunks.length - 1]
    if (lastChunk && !spokenChunksRef.current.has(lastChunk)) {
      // Only speak if the last chunk ends with sentence-ending punctuation
      // This ensures the sentence is truly complete
      if (/[.!?]+$/.test(lastChunk.trim())) {
        speakStreamingChunk(lastChunk)
        spokenChunksRef.current.add(lastChunk)
      }
    }
  }, [splitIntoChunks])

  // Complete streaming TTS — speak any remaining partial content
  const completeStreamingTTS = useCallback(() => {
    const content = currentStreamContentRef.current
    if (!content.trim()) {
      currentStreamContentRef.current = ''
      lastStableContentRef.current = ''
      spokenChunksRef.current = new Set()
      return
    }

    const chunks = splitIntoChunks(content)
    let hadNewChunk = false

    // Speak any chunks we missed
    for (const chunk of chunks) {
      if (!spokenChunksRef.current.has(chunk)) {
        speakStreamingChunk(chunk)
        spokenChunksRef.current.add(chunk)
        hadNewChunk = true
      }
    }

    currentStreamContentRef.current = ''
    lastStableContentRef.current = ''
    spokenChunksRef.current = new Set()
  }, [splitIntoChunks])

  // Speak using browser TTS (with stop)
  const speakBrowser = useCallback((text) => {
    if (!synthRef.current || !text || text.trim().length === 0) return false

    stop()

    const sentences = splitIntoSentences(sanitizeText(text))
    if (sentences.length === 0) return false

    // Chrome blocks speechSynthesis.speak() from async callbacks without a user gesture.
    // Workaround: queue a silent utterance first to unlock the API, then speak the real text.
    const unlock = new SpeechSynthesisUtterance('')
    unlock.onend = () => {
      const speakNext = (index) => {
        if (index >= sentences.length || ttsMuted) {
          setIsSpeaking(false)
          return
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index])

        if (preferredVoiceRef.current) {
          utterance.voice = preferredVoiceRef.current
        }

        utterance.rate = 1.1
        utterance.pitch = 1.0

        utterance.onend = () => {
          if (!ttsMuted) {
            setTimeout(() => speakNext(index + 1), 50)
          }
        }

        utterance.onerror = () => {
          setIsSpeaking(false)
        }

        synthRef.current.speak(utterance)
      }

      setIsSpeaking(true)
      speakNext(0)
    }
    synthRef.current.speak(unlock)
    return true
  }, [ttsMuted, splitIntoSentences, stop])

  // Speak a streaming chunk without stopping current speech
  const speakStreamingChunk = useCallback((text) => {
    if (!synthRef.current || !text || text.trim().length === 0) return

    const sentences = splitIntoSentences(sanitizeText(text))
    if (sentences.length === 0) return

    setIsSpeaking(true)
    const utterance = new SpeechSynthesisUtterance(sentences.join(' '))

    if (preferredVoiceRef.current) {
      utterance.voice = preferredVoiceRef.current
    }

    utterance.rate = 1.1
    utterance.pitch = 1.0

    utterance.onerror = () => {
      setIsSpeaking(false)
    }

    synthRef.current.speak(utterance)
  }, [splitIntoSentences])

  // Speak using Piper TTS (fetches audio from backend)
  const speakPiper = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return false

    try {
      const model = piperConfigRef.current.model || 'en_US-lessac-medium'

      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sanitizeText(text), model })
      })

      if (!response.ok) {
        throw new Error('Piper synthesis failed')
      }

      const result = await response.json()

      if (result.audio) {
        stop()

        // Convert hex to blob and play
        const audioData = new Uint8Array(
          result.audio.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
        )
        const blob = new Blob([audioData], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)

        const audio = new Audio(url)
        audioRef.current = audio

        audio.onplay = () => setIsSpeaking(true)
        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(url)
        }
        audio.onerror = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(url)
        }

        await audio.play()
        return true
      }
    } catch (error) {
      console.error('Piper TTS error:', error)
      // Fall back to browser TTS
      return speakBrowser(text)
    }

    return false
  }, [stop, speakBrowser])

  // Speak text (routes to appropriate provider)
  const speak = useCallback(async (text) => {
    console.log('[TTS] speak called — text:', text.substring(0, 50), 'voiceProvider:', voiceProvider, 'isPiperAvailable:', isPiperAvailable, 'ttsMuted:', ttsMuted)
    if (!text || text.trim().length === 0) {
      console.log('[TTS] speak: empty text, returning')
      return
    }
    if (ttsMuted) {
      console.log('[TTS] speak: muted, returning')
      return
    }

    if (voiceProvider === 'piper' && isPiperAvailable) {
      console.log('[TTS] Using Piper TTS')
      await speakPiper(text)
    } else {
      console.log('[TTS] Using Browser TTS')
      speakBrowser(text)
    }
  }, [voiceProvider, isPiperAvailable, ttsMuted, speakPiper, speakBrowser])

  // Speak a single sentence
  const speakSentence = useCallback((text, immediate = false) => {
    if (immediate && ttsMuted) return
    speak(text)
  }, [speak, ttsMuted])

  // Interrupt speech
  const interrupt = useCallback(() => {
    stop()
  }, [stop])

  // Test TTS
  const test = useCallback(async () => {
    if (voiceProvider === 'piper') {
      const response = await fetch('/api/tts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_provider: 'piper',
          text: "Hello! This is a test of the Piper text-to-speech system. Your neural voices are working correctly!"
        })
      })
      const result = await response.json()
      if (result.audio) {
        stop()
        const audioData = new Uint8Array(
          result.audio.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
        )
        const blob = new Blob([audioData], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onplay = () => setIsSpeaking(true)
        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(url)
        }
        await audio.play()
      }
    } else {
      speakBrowser("Hello! This is a test of the text-to-speech settings. Your browser voices are working correctly!")
    }
  }, [voiceProvider, speakBrowser, stop])

  // Configure Piper settings
  const setPiperConfig = useCallback((config) => {
    if (config.host) piperConfigRef.current.host = config.host
    if (config.port) piperConfigRef.current.port = config.port
    if (config.enabled !== undefined) piperConfigRef.current.enabled = config.enabled
    if (config.model) piperConfigRef.current.model = config.model

    saveTtsSettings({ piper: config })
  }, [saveTtsSettings])

  // Toggle Piper enabled
  const togglePiper = useCallback((enabled) => {
    setPiperConfig({ enabled })
    setIsPiperAvailable(enabled)
  }, [setPiperConfig])

  return {
    // State
    availableVoices,
    availablePiperModels,
    isLoadingVoices,
    isSpeaking,
    isPiperAvailable,
    voiceProvider,
    ttsEnabled,
    ttsMuted,
    preferredVoice,
    piperConfig: piperConfigRef.current,

    // Actions
    setPreferredVoice,
    setVoiceProvider,
    speak,
    speakSentence,
    startStreamingTTS,
    feedStreamingTTS,
    completeStreamingTTS,
    stop,
    interrupt,
    test,
    toggleTtsEnabled,
    toggleTtsMuted,
    checkPiperStatus,
    setPiperConfig,
    togglePiper,
    loadPiperModels
  }
}

export default useTTS