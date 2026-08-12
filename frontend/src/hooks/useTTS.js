import { useState, useEffect, useCallback, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { sanitizeForSpeech, splitSpeakable } from '../lib/text.js'

/**
 * Speech synthesis, fed a sentence at a time.
 *
 * The latency trick is that speech starts before the model has finished
 * writing: `feedStreamingTTS` is handed the response so far on every token and
 * queues each sentence the moment it is complete, so the first words are
 * audible while the rest is still streaming.
 *
 * This used to also route to a Piper server over `/api/tts/*`. There is no
 * server any more, so that path was dead — it only showed up in the UI as a
 * "Piper — not running" button that could never do anything.
 */

/** Slightly quicker than default; conversational rather than newsreader. */
const SPEECH_RATE = 1.1

/**
 * Shortest fragment worth speaking on its own mid-stream. Below this a chunk
 * is merged into the next, so short sentences don't stutter.
 */
const MIN_CHUNK_CHARS = 12

/** Chrome stops synthesising after ~15s unless nudged. */
const KEEPALIVE_MS = 10000

export function useTTS() {
  const [availableVoices, setAvailableVoices] = useState([])
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const synthRef = useRef(null)
  const preferredVoiceRef = useRef(null)
  const unlockedRef = useRef(false)

  // How much of the response has already been handed to the synthesiser,
  // tracked as a character offset rather than a set of spoken strings: a set
  // silently swallows a sentence the second time it appears, and "Yes." twice
  // in one answer is not unusual.
  const currentStreamContentRef = useRef('')
  const spokenLengthRef = useRef(0)

  const {
    ttsEnabled,
    ttsMuted,
    preferredVoice,
    toggleTtsEnabled,
    toggleTtsMuted,
    setPreferredVoiceDb,
  } = useChatStore()

  const stop = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel()
    setIsSpeaking(false)
  }, [])

  // Voice lists arrive asynchronously in Chrome, so this runs again on
  // `voiceschanged` as well as immediately.
  const loadVoices = useCallback(() => {
    const synth = synthRef.current
    if (!synth) return

    const apply = () => {
      const voices = synth.getVoices()
      if (voices.length === 0) return

      setAvailableVoices(
        voices.map((v) => ({
          id: v.voiceURI || v.name,
          name: v.name,
          lang: v.lang,
          default: v.default,
          localService: v.localService,
        })),
      )
      setIsLoadingVoices(false)

      const saved = useChatStore.getState().preferredVoice
      if (saved) {
        const match = voices.find((v) => v.voiceURI === saved || v.name === saved)
        if (match) preferredVoiceRef.current = match
      }
    }

    apply()
    synth.onvoiceschanged = apply
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const synth = window.speechSynthesis || window.webkitSpeechSynthesis
    if (!synth) {
      setIsLoadingVoices(false)
      return undefined
    }

    synthRef.current = synth
    loadVoices()

    return () => {
      synth.cancel()
      synth.onvoiceschanged = null
    }
  }, [loadVoices])

  // Some browsers refuse to synthesise until speak() has been reached from a
  // user gesture. Spend the first click on a silent utterance so the real one
  // — which arrives from a network callback — is allowed through. The previous
  // approach queued an *empty* utterance and chained the real speech off its
  // `end` event, which never fires for empty text.
  useEffect(() => {
    const unlock = () => {
      const synth = synthRef.current
      if (!synth || unlockedRef.current) return
      unlockedRef.current = true
      const primer = new SpeechSynthesisUtterance(' ')
      primer.volume = 0
      synth.speak(primer)
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Keep long responses alive through Chrome's ~15s synthesis timeout.
  // resume() on a synthesiser that isn't paused is a no-op.
  useEffect(() => {
    if (!isSpeaking) return undefined
    const id = setInterval(() => {
      const synth = synthRef.current
      if (synth?.speaking) synth.resume()
    }, KEEPALIVE_MS)
    return () => clearInterval(id)
  }, [isSpeaking])

  const setPreferredVoice = useCallback((voiceId) => {
    const synth = synthRef.current
    if (!synth) return
    const match = synth.getVoices().find((v) => v.voiceURI === voiceId || v.name === voiceId)
    if (!match) return
    preferredVoiceRef.current = match
    setPreferredVoiceDb(voiceId)
  }, [setPreferredVoiceDb])

  // Queue one utterance. The browser keeps its own FIFO, so streaming chunks
  // simply append and play back-to-back without gaps.
  const enqueueUtterance = useCallback((text) => {
    const synth = synthRef.current
    if (!synth) return false

    const clean = sanitizeForSpeech(text)
    if (!clean) return false

    const utterance = new SpeechSynthesisUtterance(clean)
    if (preferredVoiceRef.current) utterance.voice = preferredVoiceRef.current
    utterance.rate = SPEECH_RATE
    utterance.pitch = 1.0

    const settle = () => {
      // Only drop the flag once the whole queue has drained, or the indicator
      // flickers between sentences of a single response.
      if (!synth.speaking && !synth.pending) setIsSpeaking(false)
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = settle
    utterance.onerror = (event) => {
      // Cancelling on barge-in raises an error; that one isn't worth logging.
      const reason = event?.error
      if (reason && reason !== 'interrupted' && reason !== 'canceled') {
        console.warn('[TTS] utterance failed:', reason)
      }
      settle()
    }

    // Chrome can leave the synthesiser paused after a cancel.
    synth.resume()
    synth.speak(utterance)
    return true
  }, [])

  /** Speak text as a fresh response, replacing anything already queued. */
  const speak = useCallback((text) => {
    if (ttsMuted) return false
    stop()
    return enqueueUtterance(text)
  }, [enqueueUtterance, stop, ttsMuted])

  /** Append a chunk without interrupting what is already playing. */
  const speakStreamingChunk = useCallback((text) => {
    if (ttsMuted) return
    enqueueUtterance(text)
  }, [enqueueUtterance, ttsMuted])

  const startStreamingTTS = useCallback(() => {
    stop()
    currentStreamContentRef.current = ''
    spokenLengthRef.current = 0
  }, [stop])

  /** Feed the response accumulated so far; speak whatever is now complete. */
  const feedStreamingTTS = useCallback((content) => {
    currentStreamContentRef.current = content

    const fresh = content.slice(spokenLengthRef.current)
    if (!fresh) return

    const { chunks, rest } = splitSpeakable(fresh, { minChars: MIN_CHUNK_CHARS })
    if (chunks.length === 0) return

    // `rest` is a literal suffix of `fresh`, so this offset stays exact.
    spokenLengthRef.current = content.length - rest.length
    for (const chunk of chunks) speakStreamingChunk(chunk)
  }, [speakStreamingChunk])

  /** Speak whatever is left once the response has finished arriving. */
  const completeStreamingTTS = useCallback(() => {
    const fresh = currentStreamContentRef.current.slice(spokenLengthRef.current)

    currentStreamContentRef.current = ''
    spokenLengthRef.current = 0

    if (!fresh.trim()) return

    // minChars 0: nothing more is coming, so a trailing "Yes." still gets said.
    const { chunks, rest } = splitSpeakable(fresh, { minChars: 0 })
    for (const chunk of chunks) speakStreamingChunk(chunk)
    if (rest.trim()) speakStreamingChunk(rest.trim())
  }, [speakStreamingChunk])

  const test = useCallback(() => {
    stop()
    enqueueUtterance('This is a test of the selected voice. If you can hear this, speech output is working.')
  }, [enqueueUtterance, stop])

  return {
    // State
    availableVoices,
    isLoadingVoices,
    isSpeaking,
    isSupported: Boolean(synthRef.current),
    ttsEnabled,
    ttsMuted,
    preferredVoice,

    // Actions
    setPreferredVoice,
    speak,
    startStreamingTTS,
    feedStreamingTTS,
    completeStreamingTTS,
    stop,
    interrupt: stop,
    test,
    toggleTtsEnabled,
    toggleTtsMuted,
  }
}

export default useTTS
