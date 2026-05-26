/**
 * Piper TTS Server Integration
 * 
 * This module provides integration with Piper TTS for high-quality neural TTS.
 * Piper can run as a local server or connect to a remote instance.
 */

// Default Piper server configuration
const DEFAULT_PIPER_CONFIG = {
  host: 'localhost',
  port: 5000,
  endpoint: '/v1/audio/internal',
  enabled: false
};

class PiperService {
  constructor() {
    this.config = { ...DEFAULT_PIPER_CONFIG };
    this.isSpeaking = false;
    this.process = null;
  }

  /**
   * Configure Piper server connection
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    console.log('[Piper] Config updated:', this.config);
  }

  /**
   * Check if Piper server is available
   */
  async isServerAvailable() {
    if (!this.config.enabled) return false;
    
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Convert text to speech using Piper
   * Returns base64 encoded audio
   */
  async speak(text) {
    if (!this.config.enabled) {
      throw new Error('Piper TTS is not enabled');
    }

    this.isSpeaking = true;

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/v1/audio/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          speaker_id: 0,
          speaking_rate: 1.0,
          pitch: 1.0
        }),
        signal: AbortSignal.timeout(30000) // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`Piper returned ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(audioBuffer).toString('base64');
      
      return {
        success: true,
        audio: `data:audio/wav;base64,${base64}`,
        format: 'wav'
      };
    } finally {
      this.isSpeaking = false;
    }
  }

  /**
   * Stream text to speech - returns chunks for streaming playback
   */
  async *speakStream(text, model = 'en_US-lessac-medium') {
    if (!this.config.enabled) {
      throw new Error('Piper TTS is not enabled');
    }

    this.isSpeaking = true;

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/v1/audio/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          speaker_id: 0,
          speaking_rate: 1.0,
          pitch: 1.0
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(`Piper returned ${response.status}`);
      }

      // For streaming, we'd need chunked transfer from Piper
      // For now, return full audio
      const audioBuffer = await response.arrayBuffer();
      yield {
        done: true,
        audio: audioBuffer
      };
    } finally {
      this.isSpeaking = false;
    }
  }

  /**
   * Check if currently speaking
   */
  isCurrentlySpeaking() {
    return this.isSpeaking;
  }

  /**
   * Stop current speech (Piper doesn't have native stop, but we track state)
   */
  stop() {
    this.isSpeaking = false;
  }

  /**
   * Get available Piper models (from server)
   */
  async getModels() {
    if (!this.config.enabled) return [];

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Server not available
    }
    
    return [];
  }
}

// Export singleton instance
export const piperService = new PiperService();

export default piperService;