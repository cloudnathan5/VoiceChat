// backend/tts/providers/base.js
class TTSProvider {
  constructor() {
    this.name = 'base'
  }

  // Returns { id, name, status }
  async getInfo() {
    throw new Error('Not implemented')
  }

  // Returns [{ id, name }]
  async getVoices() {
    throw new Error('Not implemented')
  }

  // Synthesizes speech, returns audio buffer
  async speak(text, options = {}) {
    throw new Error('Not implemented')
  }

  // Cleanup resources
  async cleanup() {
    // Optional override
  }
}

export default TTSProvider