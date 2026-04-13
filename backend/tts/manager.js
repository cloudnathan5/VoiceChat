// backend/tts/manager.js
import BrowserTTSProvider from './providers/browser.js'
import PiperTTSProvider from './providers/piper.js'
import CoquiXTTSProvider from './providers/coqui.js'

class TTSManager {
  constructor(db) {
    this.db = db
    this.providers = {
      browser: new BrowserTTSProvider(),
      piper: new PiperTTSProvider(),
      coqui: new CoquiXTTSProvider()
    }
  }

  getActiveProvider() {
    const providerName = this.db.getSetting('tts_provider') || 'browser'
    return this.providers[providerName] || this.providers.browser
  }

  async getProvidersInfo() {
    const infos = []
    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        const info = await provider.getInfo()
        infos.push({ id: name, ...info })
      } catch (error) {
        infos.push({ id: name, name: provider.name, status: 'error', error: error.message })
      }
    }
    return infos
  }

  async getVoices() {
    const provider = this.getActiveProvider()
    return provider.getVoices()
  }

  async speak(text, options = {}) {
    const provider = this.getActiveProvider()
    return provider.speak(text, options)
  }

  async synthesize(text, voiceId = null) {
    const provider = this.getActiveProvider()
    const voiceOptions = voiceId ? { voice: voiceId } : {}
    return provider.speak(text, voiceOptions)
  }

  // Coqui-specific: manage voice samples
  async getVoiceSamples() {
    const coquiProvider = this.providers.coqui
    return coquiProvider.getVoiceSamples()
  }

  async addVoiceSample(name, audioPath, durationSeconds) {
    const coquiProvider = this.providers.coqui
    return coquiProvider.addVoiceSample(name, audioPath, durationSeconds)
  }

  async deleteVoiceSample(id) {
    const coquiProvider = this.providers.coqui
    return coquiProvider.deleteVoiceSample(id)
  }
}

export default TTSManager