// backend/tts/providers/piper.js
import TTSProvider from './base.js'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const PIPER_MODELS_DIR = path.join(process.cwd(), 'tts-models', 'piper')
const PIPER_BIN = path.join(process.cwd(), 'tts-bin', 'piper', 'piper')

// Default Piper voices available for download
const AVAILABLE_VOICES = [
  { id: 'en_US-lessac-medium', name: 'English (US) - Lessac Medium', language: 'en' },
  { id: 'en_US-lessac-medium.onnx', name: 'English (US) - Lessac Medium', language: 'en' },
  { id: 'en_US-amy-medium', name: 'English (US) - Amy Medium', language: 'en' },
  { id: 'en_US-amy-medium.onnx', name: 'English (US) - Amy Medium', language: 'en' },
  { id: 'en_US-kathleen-medium', name: 'English (US) - Kathleen Medium', language: 'en' },
  { id: 'en_US-kristin-medium', name: 'English (US) - Kristin Medium', language: 'en' },
  { id: 'en_US-ryan-medium', name: 'English (US) - Ryan Medium', language: 'en' },
  { id: 'en_US-ryan-low', name: 'English (US) - Ryan Low', language: 'en' },
  { id: 'en_GB-danny-medium', name: 'English (UK) - Danny Medium', language: 'en' },
  { id: 'en_GB-southern-english-medium', name: 'English (UK) - Southern English Medium', language: 'en' },
  { id: 'en_GB-semaine-medium', name: 'English (UK) - Semaine Medium', language: 'en' },
]

class PiperTTSProvider extends TTSProvider {
  constructor() {
    super()
    this.name = 'Piper TTS'
    this.voices = AVAILABLE_VOICES
  }

  async getInfo() {
    const installedVoices = this.getInstalledVoices()
    return {
      name: 'Piper TTS',
      description: 'Local neural TTS - fast and natural sounding',
      status: 'ready',
      supportsCloning: false,
      installedVoices: installedVoices.length,
      totalVoices: this.voices.length
    }
  }

  getInstalledVoices() {
    if (!fs.existsSync(PIPER_MODELS_DIR)) return []
    return fs.readdirSync(PIPER_MODELS_DIR)
      .filter(f => f.endsWith('.onnx') || f.endsWith('.onnx.json'))
      .map(f => {
        const voiceId = f.replace('.onnx.json', '').replace('.onnx', '')
        return this.voices.find(v => v.id === voiceId || v.id === `${voiceId}.onnx`) || { id: voiceId, name: voiceId, language: 'en' }
      })
  }

  async getVoices() {
    return this.voices.map(v => ({
      id: v.id,
      name: v.name,
      language: v.language
    }))
  }

  async speak(text, options = {}) {
    const voiceId = options.voice || 'en_US-lessac-medium'
    const modelPath = path.join(PIPER_MODELS_DIR, `${voiceId}.onnx`)
    const configPath = path.join(PIPER_MODELS_DIR, `${voiceId}.onnx.json`)

    // Check if model exists
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Piper voice model not found: ${voiceId}. Download with: node backend/tts/download-voice.js ${voiceId}`)
    }

    // Create temp file for output
    const tempWav = path.join(os.tmpdir(), `piper-${Date.now()}.wav`)

    return new Promise((resolve, reject) => {
      const piperProcess = spawn(PIPER_BIN, [
        '--model', modelPath,
        '--config', configPath,
        '--output-file', tempWav
      ], {
        cwd: PIPER_MODELS_DIR,
 env: { ...process.env, LD_LIBRARY_PATH: path.join(process.cwd(), 'tts-bin') }
      })

      let errorOutput = ''

      piperProcess.stdin.write(text)
      piperProcess.stdin.end()

      piperProcess.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempWav)) {
          const audioBuffer = fs.readFileSync(tempWav)
          fs.unlinkSync(tempWav) // cleanup
          resolve(audioBuffer)
        } else {
          reject(new Error(`Piper synthesis failed: ${errorOutput || 'unknown error'}`))
        }
      })

      piperProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Piper not installed. Install from: https://github.com/rhasspy/piper'))
        } else {
          reject(err)
        }
      })

      piperProcess.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })
    })
  }
}

export default PiperTTSProvider