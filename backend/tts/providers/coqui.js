// backend/tts/providers/coqui.js
import TTSProvider from './base.js'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { VoiceSample } from '../models/voice-sample.js'

const VOICE_SAMPLES_DIR = path.join(process.cwd(), 'voice-samples')

class CoquiXTTSProvider extends TTSProvider {
  constructor() {
    super()
    this.name = 'Coqui XTTS'
    VoiceSample.ensureDirectory()
  }

  async getInfo() {
    const samples = this.getVoiceSamples()
    return {
      name: 'Coqui XTTS',
      description: 'High-quality neural TTS with voice cloning',
      status: 'ready',
      supportsCloning: true,
      clonedVoices: samples.length
    }
  }

  async getVoices() {
    const samples = this.getVoiceSamples()
    return samples.map(s => ({
      id: s.id,
      name: s.name
    }))
  }

  getVoiceSamples() {
    return VoiceSample.loadAll()
  }

  async addVoiceSample(name, audioPath, durationSeconds) {
    const sample = new VoiceSample({ name, filePath: audioPath, durationSeconds })
    return sample.save()
  }

  async deleteVoiceSample(id) {
    VoiceSample.delete(id)
  }

  async speak(text, options = {}) {
    const voiceId = options.voice
    const samples = this.getVoiceSamples()
    const sample = voiceId ? samples.find(s => s.id === voiceId) : samples[0]

    if (!sample) {
      throw new Error('No voice sample available. Upload a voice sample first.')
    }

    const tempOutput = path.join(os.tmpdir(), `coqui-${Date.now()}.wav`)

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        '-c',
        `
import sys
sys.path.insert(0, '${process.cwd()}')
from TTS.api import TTS
tts = TTS(model_path="xtts_v2", gpu=True)
tts.tts(
  text="${text.replace(/"/g, '\\"')}",
  speaker_wav="${sample.filePath}",
  language="en",
  file_path="${tempOutput}"
)
`
      ])

      let errorOutput = ''

      pythonProcess.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempOutput)) {
          const audioBuffer = fs.readFileSync(tempOutput)
          fs.unlinkSync(tempOutput)
          resolve(audioBuffer)
        } else {
          reject(new Error(`Coqui XTTS synthesis failed: ${errorOutput || 'unknown error'}`))
        }
      })

      pythonProcess.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Python3 or Coqui TTS not installed. Install: pip install TTS'))
        } else {
          reject(err)
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })
    })
  }
}

export default CoquiXTTSProvider