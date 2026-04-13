// backend/tts/models/voice-sample.js
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'

const VOICE_SAMPLES_DIR = path.join(process.cwd(), 'voice-samples')

export class VoiceSample {
  constructor({ id = uuidv4(), name, filePath, durationSeconds = 0, createdAt = new Date().toISOString() }) {
    this.id = id
    this.name = name
    this.filePath = filePath
    this.durationSeconds = durationSeconds
    this.createdAt = createdAt
  }

  static ensureDirectory() {
    if (!fs.existsSync(VOICE_SAMPLES_DIR)) {
      fs.mkdirSync(VOICE_SAMPLES_DIR, { recursive: true })
    }
  }

  save() {
    VoiceSample.ensureDirectory()
    const data = {
      id: this.id,
      name: this.name,
      filePath: this.filePath,
      durationSeconds: this.durationSeconds,
      createdAt: this.createdAt
    }
    fs.writeFileSync(path.join(VOICE_SAMPLES_DIR, `${this.id}.json`), JSON.stringify(data, null, 2))
    return this
  }

  static load(id) {
    const filePath = path.join(VOICE_SAMPLES_DIR, `${id}.json`)
    if (!fs.existsSync(filePath)) return null
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return new VoiceSample(data)
  }

  static loadAll() {
    VoiceSample.ensureDirectory()
    const files = fs.readdirSync(VOICE_SAMPLES_DIR).filter(f => f.endsWith('.json'))
    return files.map(f => VoiceSample.load(f.replace('.json', ''))).filter(Boolean)
  }

  static delete(id) {
    const sample = VoiceSample.load(id)
    if (sample && fs.existsSync(sample.filePath)) {
      fs.unlinkSync(sample.filePath)
    }
    const filePath = path.join(VOICE_SAMPLES_DIR, `${id}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}