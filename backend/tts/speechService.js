/**
 * Natural Streaming TTS Service
 * Speaks sentences as they arrive, with interrupt support
 */

/** Speech queue and control */
class SpeechService {
  constructor() {
    this.speechQueue = []
    this.isSpeaking = false
    this.interruptRequested = false
    this.currentUtterance = null
    this.audioContext = null
    this.silentUtteranceQueue = []
    
    // Initialize audio context (required for Web Audio connection in some browsers)
    this.initAudioContext()
    
    // Event handlers
    this.onBoundary = null
    this.onStarted = null
    this.onFinished = null
    
    // Bind methods
    this.speakSentence = this.speakSentence.bind(this)
    this.stop = this.stop.bind(this)
    this.speakFromSocket = this.speakFromSocket.bind(this)
    this.speakFromSSE = this.speakFromSSE.bind(this)
  }

  initAudioContext() {
    try {
      if (typeof window !== 'undefined' && window.AudioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }
    } catch (error) {
      console.warn('Could not initialize AudioContext:', error)
    }
  }

  /** Interrupt any ongoing speech immediately */
  stop() {
    this.interruptRequested = true
    
    // Stop current utterance
    if (this.currentUtterance) {
      window.speechSynthesis.cancel()
      this.currentUtterance = null
    }
    
    // Clear queue
    this.speechQueue = []
    
    // Fire finished callback
    if (this.onFinished) {
      this.onFinished({
        interrupted: true,
        timestamp: Date.now()
      })
    }
    
    console.log('[TTS] Speech interrupted')
  }

  /** Check if speech synthesis is supported */
  isSupported() {
    return typeof window !== 'undefined' && 
           ('speechSynthesis' in window || 'webkitSpeechSynthesis' in window)
  }

  /** Get available voices */
  getVoices() {
    if (!this.isSupported()) return []
    
    try {
      const synth = window.speechSynthesis
      // Trigger voice loading if needed
      if (synth.getVoices().length === 0) {
        // Note: In some browsers, voices load asynchronously
        setTimeout(() => synth.getVoices(), 100)
      }
      
      return synth.getVoices()
        .map(voice => ({
          id: voice.voiceURI || voice.name,
          name: `${voice.name} (${voice.lang})`,
          lang: voice.lang,
          default: voice.default
        }))
        .sort((a, b) => a.default === b.default ? 0 : a.default ? -1 : 1)
    } catch (error) {
      console.error('Error getting voices:', error)
      return []
    }
  }

  /** Set preferred voice by voiceURI */
  setVoice(preferredVoiceURI) {
    this.preferredVoiceURI = preferredVoiceURI
  }

  /** Split text into sentences for natural streaming */
  splitIntoSentences(text) {
    // Use a simple but effective sentence tokenizer
    // Matches: ". sentence end", "! sentence end", "? sentence end"
    // Handles abbreviations and edge cases moderately well
    
    // Split on sentence boundaries
    const sentenceRegex = /[.!?]+(\s|$)+/g
    let sentences = []
    let lastIndex = 0
    let match
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      // Get sentence up to the boundary
      const sentence = text.substring(lastIndex, match.index + match[0].length).trim()
      if (sentence) {
        sentences.push(sentence)
      }
      lastIndex = match.index + match[0].length
    }
    
    // Add remaining text as final sentence
    const remaining = text.substring(lastIndex).trim()
    if (remaining) {
      sentences.push(remaining)
    }
    
    // Split very long sentences (>100 chars) into smaller chunks
    const finalSentences = []
    sentences.forEach(sentence => {
      if (sentence.length > 100) {
        // Split long sentences by commas, then by words
        const parts = sentence.split(/,|\s+\b/).filter(p => p.trim().length > 0)
        let currentPart = ''
        parts.forEach(part => {
          if (currentPart.length + part.length > 60) {
            finalSentences.push(currentPart.trim() + (sentence.endsWith('.') ? '.' : ''))
            currentPart = part
          } else {
            currentPart += ' ' + part
          }
        })
        if (currentPart.trim()) {
          finalSentences.push(currentPart.trim() + (sentence.endsWith('.') ? '.' : ''))
        }
      } else {
        finalSentences.push(sentence)
      }
    })
    
    return finalSentences.filter(s => s.length > 0)
  }

  /** Speak a single sentence immediately or queue it */
  speakSentence(text, immediate = false, queueName = 'main') {
    if (!this.isSupported() || !text || text.trim().length === 0) {
      return false
    }
    
    const sentence = text.trim()
    
    // If we're interrupting, just speak immediately
    if (this.interruptRequested) {
      this.stop()
      this.interruptRequested = false
    }
    
    // Clear silent queue if we're speaking
    if (queueName === 'silent' && this.isSpeaking) {
      this.silentUtteranceQueue = []
    }
    
    // Determine priority: immediate > queueName 'main'
    if (immediate || this.speechQueue.length === 0) {
      // Speak immediately (cancel any current)
      return this.speakNow(sentence)
    } else {
      // Queue for smooth playback
      this.speechQueue.push({
        text: sentence,
        priority: queueName === 'main' ? 'high' : 'low'
      })
      
      // Start speaking next in queue if not already
      if (!this.isSpeaking) {
        this.processQueue()
      }
      
      return true
    }
  }

  /** Speak immediately, interrupting current speech */
  speakNow(text) {
    if (!this.isSupported() || !text) return Promise.reject(new Error('TTS not supported'))
    
    // Return promise that resolves when speech completes
    return new Promise((resolve, reject) => {
      // Handle interrupt flag
      this.interruptRequested = false
      
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text)
      this.currentUtterance = utterance
      
      // Configure voice
      if (this.preferredVoiceURI) {
        const voices = this.getVoices()
        const matchingVoice = voices.find(v => v.id === this.preferredVoiceURI)
        if (matchingVoice) {
          utterance.voice = matchingVoice
        }
      }
      
      // Set params for natural speech
      utterance.rate = 1.0  // Natural speed
      utterance.pitch = 1.0  // Natural pitch
      utterance.volume = 1.0  // Full volume
      
      // Event handlers
      utterance.onstart = (event) => {
        this.isSpeaking = true
        console.log('[TTS] Started speaking:', text.substring(0, 30))
        if (this.onStarted) {
          this.onStarted({ text, timestamp: Date.now() })
        }
      }
      
      utterance.onend = (event) => {
        this.isSpeaking = false
        this.currentUtterance = null
        console.log('[TTS] Finished speaking')
        if (this.onFinished) {
          this.onFinished({ text, interrupted: this.interruptRequested, timestamp: Date.now() })
        }
        resolve({ success: true, text })
        
        // Process next in queue
        this.processQueue()
      }
      
      utterance.onerror = (event) => {
        this.isSpeaking = false
        this.currentUtterance = null
        console.error('[TTS] Error:', event.error)
        if (this.onFinished) {
          this.onFinished({ text, error: event.error, timestamp: Date.now() })
        }
        reject(event.error || new Error('Speech synthesis failed'))
        this.processQueue()
      }
      
      // Sentence boundary events (sentence detected in some TTS engines)
      if (typeof utterance.onbound ary === 'function') {
        utterance.onboundary = (event) => {
          if (event.name === 'sentence' && this.onBoundary) {
            this.onBoundary({ text, timestamp: Date.now(), charIndex: event.charIndex })
          }
        }
      }
      
      // Start speaking
      window.speechSynthesis.speak(utterance)
    })
  }

  /** Process speech queue */
  processQueue() {
    if (this.speechQueue.length === 0 || this.isSpeaking || this.interruptRequested) {
      return
    }
    
    const next = this.speechQueue.shift()
    if (next) {
      this.speakNow(next.text).catch(error => {
        console.error('Error in speech queue:', error)
      })
    }
  }

  /** Buffer speech to play multiple sentences together for more natural flow */
  bufferSentences(sentencesArray) {
    if (!sentencesArray || sentencesArray.length === 0) return
    
    // Clear current silent queue
    this.silentUtteranceQueue = []
    
    sentencesArray.forEach(sentence => {
      this.silentUtteranceQueue.push({
        text: sentence,
        delay: 0
      })
    })
    
    // Start buffered speech if not currently speaking
    if (!this.isSpeaking && this.silentUtteranceQueue.length > 0) {
      this.processSilentQueue()
    }
  }

  /** Process silent utterance queue (background buffering) */
  processSilentQueue() {
    if (this.silentUtteranceQueue.length === 0 || this.isSpeaking || this.interruptRequested) {
      return
    }
    
    const setupUtterance = (text) => {
      const utterance = new SpeechSynthesisUtterance(text)
      if (this.preferredVoiceURI) {
        const voices = this.getVoices()
        const matchingVoice = voices.find(v => v.id === this.preferredVoiceURI)
        if (matchingVoice) {
          utterance.voice = matchingVoice
        }
      }
      utterance.rate = 1.0
      utterance.pitch = 1.0
      return utterance
    }
    
    // For buffer queue, we want to speak in order but don't need to track like main queue
    const { text, delay } = this.silentUtteranceQueue.shift()
    
    if (this.isSpeaking) {
      // Already speaking, chain it
      setTimeout(() => {
        const utr = setupUtterance(text)
        window.speechSynthesis.speak(utr)
      }, delay)
    } else {
      const utr = setupUtterance(text)
      window.speechSynthesis.speak(utr)
    }
  }

  /** Create an interrupt-safe speech handler for socket.io streaming */
  speakFromSocket(socket, threadId, userMessage) {
    let accumulatedText = ''
    let sentenceBuffer = ''
    let isAiTurn = false
    
    // Mark that the AI is responding
    const anyUtterance = new SpeechSynthesisUtterance('')
    anyUtterance.rate = 0.001  // Almost silent, just to keep speech queue active
    anyUtterance.volume = 0
    window.speechSynthesis.speak(anyUtterance)
    setTimeout(() => window.speechSynthesis.cancel(), 10)
    
    socket.on('token', (data) => {
      accumulatedText += (data.content || '')
      sentenceBuffer += (data.content || '')
      
      // If we have sentence-ending punctuation, speak immediately
      if (/[.!?]+/.test(sentenceBuffer)) {
        const sentences = this.splitIntoSentences(sentenceBuffer)
        sentences.forEach(sentence => {
          this.speakSentence(sentence, true, 'main')
        })
        sentenceBuffer = ''
      }
    })
    
    socket.on('complete', (data) => {
      // Speak any remaining text
      if (sentenceBuffer.trim()) {
        this.speakSentence(sentenceBuffer, true, 'main')
        sentenceBuffer = ''
      }
    })
    
    socket.on('aborted', () => {
      this.stop()
    })
    
    return () => {
      socket.off('token')
      socket.off('complete') 
      socket.off('aborted')
    }
  }

  /** Check if currently speaking */
  isCurrentlySpeaking() {
    return this.isSpeaking
  }
}

// Export singleton instance
export const speechService = new SpeechService()

// Auto-detect voices when loaded
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    // Trigger voice detection after a delay
    setTimeout(() => {
      speechService.getVoices()
    }, 1000)
  })
}
