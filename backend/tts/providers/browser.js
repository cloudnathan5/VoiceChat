// backend/tts/providers/browser.js
import TTSProvider from './base.js'

class BrowserTTSProvider extends TTSProvider {
  constructor() {
    super()
    this.name = 'Browser TTS'
  }

  async getInfo() {
    return {
      name: 'Browser TTS',
      description: 'Uses browser built-in speech synthesis',
      status: 'ready',
      supportsCloning: false
    }
  }

  async getVoices() {
    // Return empty - voices are fetched client-side from browser API
    return []
  }

  async speak(text, options = {}) {
    // This provider doesn't synthesize on server
    // Frontend uses browser SpeechSynthesis directly
    // This is a no-op for server-side synthesis
    throw new Error('Browser TTS synthesizes on client-side')
  }
}

export default BrowserTTSProvider