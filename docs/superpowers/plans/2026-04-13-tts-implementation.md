# Multi-Provider TTS Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-provider TTS engine supporting Browser (existing), Piper (local neural), and Coqui XTTS (voice cloning) with settings UI

**Architecture:** TTSManager routes requests to active provider. Each provider is a separate class implementing a common interface. Frontend calls backend TTS API instead of using browser SpeechSynthesis directly. Settings stored in database.

**Tech Stack:** Node.js backend, Express, Python for Coqui XTTS subprocess, React frontend, Zustand store

---

## File Structure

```
backend/
  tts/
    manager.js           # TTSManager - routes to active provider
    providers/
      base.js            # Base provider interface
      browser.js         # BrowserTTSProvider - speaks via /api/tts/speak
      piper.js           # PiperTTSProvider - local Piper HTTP server
      coqui.js           # CoquiXTTSProvider - Python subprocess
    models/
      voice-sample.js    # Voice sample metadata
  voice-samples/         # Stored Coqui voice audio files
  tts-models/
    piper/               # Piper ONNX voice models
server.js                # Add TTS routes
database.js              # Add TTS settings

frontend/src/
  components/
    Sidebar.jsx          # Add TTS settings panel
    TTSSettings.jsx      # New: TTS configuration panel
  stores/
    chatStore.ts         # Add TTS state
  hooks/
    useVoiceChat.js      # Use /api/tts/speak instead of browser TTS
```

---

## Backend Setup

### Task 1: Create TTS directory structure and base provider interface

**Files:**
- Create: `backend/tts/providers/base.js`
- Create: `backend/tts/models/voice-sample.js`

- [ ] **Step 1: Create base provider interface**

```javascript
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
```

- [ ] **Step 2: Create voice sample model**

```javascript
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
    const data = { id: this.id, name: this.name, filePath: this.filePath, durationSeconds: this.durationSeconds, createdAt: this.createdAt }
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/tts/providers/base.js backend/tts/models/voice-sample.js
git commit -m "feat(tts): add TTS base provider interface and voice sample model

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 2: Create TTSManager

**Files:**
- Create: `backend/tts/manager.js`
- Modify: `backend/database.js` (add TTS settings methods)

- [ ] **Step 1: Add TTS settings methods to database**

```javascript
// Add after existing settings methods in database.js

getSetting(key) {
  const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key)
  return row ? row.value : null
}

setSetting(key, value) {
  const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  stmt.run(key, String(value))
}
```

- [ ] **Step 2: Create TTSManager**

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/tts/manager.js backend/database.js
git commit -m "feat(tts): add TTSManager for provider routing

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 3: Create Browser TTS Provider

**Files:**
- Create: `backend/tts/providers/browser.js`

- [ ] **Step 1: Create BrowserTTSProvider that returns audio via server**

The browser TTS provider speaks via the frontend using browser SpeechSynthesis directly (since browser TTS doesn't need server processing). However, for consistent API, we can route through backend for voice list. Actually, for browser TTS - the frontend already uses browser SpeechSynthesis directly. The provider here is mainly for getting voice list and as a fallback.

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/tts/providers/browser.js
git commit -m "feat(tts): add browser TTS provider

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 4: Create Piper TTS Provider

**Files:**
- Create: `backend/tts/providers/piper.js`
- Create: `backend/tts/models/voice-sample.js` directory check

- [ ] **Step 1: Create PiperTTSProvider**

```javascript
// backend/tts/providers/piper.js

import TTSProvider from './base.js'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const PIPER_MODELS_DIR = path.join(process.cwd(), 'tts-models', 'piper')

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
    return this.voices.map(v => ({ id: v.id, name: v.name, language: v.language }))
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
      const piperProcess = spawn('piper', [
        '--model', modelPath,
        '--config', configPath,
        '--output-file', tempWav
      ], { cwd: PIPER_MODELS_DIR })

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
```

- [ ] **Step 2: Create voice download script**

```javascript
// backend/tts/download-voice.js

import fs from 'fs'
import path from 'path'
import https from 'https'
import { createWriteStream } from 'fs'
import { spawn } from 'child_process'

const PIPER_MODELS_DIR = path.join(process.cwd(), 'tts-models', 'piper')

const VOICE_URLS = {
  'en_US-lessac-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json'
  },
  'en_US-amy-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json'
  },
  'en_US-ryan-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json'
  },
  'en_GB-danny-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/danny/medium/en_GB-danny-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/danny/medium/en_GB-danny-medium.onnx.json'
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
      file.close()
      downloadFile(response.headers.location, dest).then(resolve).catch(reject)
      return
      }
      response.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function downloadVoice(voiceId) {
  const urls = VOICE_URLS[voiceId]
  if (!urls) {
    console.error(`Unknown voice: ${voiceId}`)
    console.error(`Available voices: ${Object.keys(VOICE_URLS).join(', ')}`)
    process.exit(1)
  }

  console.log(`Downloading ${voiceId}...`)
  console.log(`Model: ${urls.model}`)
  console.log(`Config: ${urls.config}`)

  if (!fs.existsSync(PIPER_MODELS_DIR)) {
    fs.mkdirSync(PIPER_MODELS_DIR, { recursive: true })
  }

  const modelDest = path.join(PIPER_MODELS_DIR, `${voiceId}.onnx`)
  const configDest = path.join(PIPER_MODELS_DIR, `${voiceId}.onnx.json`)

  await downloadFile(urls.model, modelDest)
  console.log('Model downloaded')

  await downloadFile(urls.config, configDest)
  console.log('Config downloaded')

  console.log(`Voice ${voiceId} installed successfully!`)
}

const voiceId = process.argv[2]
if (!voiceId) {
  console.error('Usage: node download-voice.js <voice_id>')
  console.error(`Available voices: ${Object.keys(VOICE_URLS).join(', ')}`)
  process.exit(1)
}

downloadVoice(voiceId).catch(console.error)
```

- [ ] **Step 3: Commit**

```bash
git add backend/tts/providers/piper.js backend/tts/download-voice.js
git commit -m "feat(tts): add Piper TTS provider with voice download script

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 5: Create Coqui XTTS Provider

**Files:**
- Create: `backend/tts/providers/coqui.js`
- Create: `backend/voice-samples/` directory structure

- [ ] **Step 1: Create CoquiXTTSProvider**

```javascript
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
    return samples.map(s => ({ id: s.id, name: s.name }))
  }

  getVoiceSamples() {
    return VoiceSample.loadAll()
  }

  async addVoiceSample(name, audioPath, durationSeconds) {
    const sample = new VoiceSample({
      name,
      filePath: audioPath,
      durationSeconds
    })
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
```

- [ ] **Step 2: Ensure voice-samples directory exists**

```bash
mkdir -p /home/ubuntu/Projects/VoiceChat/backend/voice-samples
echo "# Voice samples for Coqui XTTS - upload audio files here" > /home/ubuntu/Projects/VoiceChat/backend/voice-samples/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add backend/tts/providers/coqui.js
mkdir -p backend/voice-samples && echo "# Voice samples for Coqui XTTS" > backend/voice-samples/.gitkeep
git add backend/voice-samples/.gitkeep
git commit -m "feat(tts): add Coqui XTTS provider with voice cloning support

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 6: Add TTS API Routes to Server

**Files:**
- Modify: `backend/server.js`
- Create directories: `backend/voice-samples`, `backend/tts-models/piper`

- [ ] **Step 1: Add TTS routes to server.js**

Add after existing routes (around line 60, after provider routes):

```javascript
// TTS routes
import TTSManager from './tts/manager.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

const db = new DatabaseManager()
const ttsManager = new TTSManager(db)

// Configure multer for voice sample uploads
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'voice-samples')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  }
})
const voiceUpload = multer({ storage: voiceStorage, limits: { fileSize: 10 * 1024 * 1024 } })

// Get available TTS providers
app.get('/api/tts/providers', (req, res) => {
  const providers = ttsManager.providers
  const infos = Object.entries(providers).map(([id, provider]) => ({
    id,
    name: provider.name,
    status: 'ready'
  }))
  res.json({ providers: infos })
})

// Get available TTS voices for active provider
app.get('/api/tts/voices', (req, res) => {
  try {
    const voices = ttsManager.getVoices()
    res.json({ voices })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Synthesize speech
app.post('/api/tts/speak', async (req, res) => {
  const { text, voice_id } = req.body
  if (!text) {
    return res.status(400).json({ error: 'text is required' })
  }

  try {
    const audio = await ttsManager.speak(text, { voice: voice_id })
    res.set('Content-Type', 'audio/wav')
    res.set('Content-Length', audio.length)
    res.send(audio)
  } catch (error) {
    console.error('TTS speak error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Coqui voice sample management
app.get('/api/tts/coqui/voices', (req, res) => {
  try {
    const voices = ttsManager.getVoiceSamples()
    res.json({ voices })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/tts/coqui/voices', voiceUpload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file required' })
  }

  const { name } = req.body
  if (!name) {
    fs.unlinkSync(req.file.path)
    return res.status(400).json({ error: 'name is required' })
  }

  try {
    // Get audio duration (basic - just use file size as proxy)
    const durationSeconds = Math.round(req.file.size / 16000) // rough estimate

    const sample = await ttsManager.addVoiceSample(name, req.file.path, durationSeconds)
    res.json({ id: sample.id, name: sample.name, status: 'ready' })
  } catch (error) {
    fs.unlinkSync(req.file.path)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/tts/coqui/voices/:id', async (req, res) => {
  const { id } = req.params
  try {
    await ttsManager.deleteVoiceSample(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// TTS settings
app.get('/api/tts/settings', (req, res) => {
  const provider = db.getSetting('tts_provider') || 'browser'
  const piperVoice = db.getSetting('tts_piper_voice') || 'en_US-lessac-medium'
  res.json({ provider, piperVoice })
})

app.put('/api/tts/settings', (req, res) => {
  const { provider, piperVoice } = req.body
  if (provider) db.setSetting('tts_provider', provider)
  if (piperVoice) db.setSetting('tts_piper_voice', piperVoice)
  res.json({ success: true })
})
```

- [ ] **Step 2: Install multer dependency**

```bash
cd /home/ubuntu/Projects/VoiceChat/backend && npm install multer
```

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(tts): add TTS API routes to server

Routes:
- GET /api/tts/providers - list providers
- GET /api/tts/voices - list voices
- POST /api/tts/speak - synthesize speech
- GET/POST/DELETE /api/tts/coqui/voices - voice sample management
- GET/PUT /api/tts/settings - TTS configuration

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 7: Add TTS State to Frontend Store

**Files:**
- Modify: `frontend/src/stores/chatStore.ts`

- [ ] **Step 1: Add TTS-related state and actions**

Add to ChatState interface:
```typescript
// TTS state
ttsProvider: 'browser' | 'piper' | 'coqui'
ttsVoice: string | null
ttsVoices: { id: string, name: string }[]
```

Add to store initial state:
```typescript
ttsProvider: 'browser',
ttsVoice: null,
ttsVoices: [],
```

Add actions:
```typescript
setTTSProvider: (provider: 'browser' | 'piper' | 'coqui') => void
setTTSVoice: (voice: string | null) => void
setTTSVoices: (voices: { id: string, name: string }[]) => void
loadTTTSettings: () => Promise<void>
loadTTSVoices: () => Promise<void>
```

Add to store implementation:
```typescript
setTTSProvider: (provider) => set({ ttsProvider: provider }),
setTTSVoice: (voice) => set({ ttsVoice: voice }),
setTTSVoices: (voices) => set({ ttsVoices: voices }),
loadTTTSettings: async () => {
  const res = await fetch('/api/tts/settings')
  if (res.ok) {
    const settings = await res.json()
    set({ ttsProvider: settings.provider, ttsVoice: settings.piperVoice })
  }
},
loadTTSVoices: async () => {
  const res = await fetch('/api/tts/voices')
  if (res.ok) {
    const data = await res.json()
    set({ ttsVoices: data.voices })
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/chatStore.ts
git commit -m "feat(tts): add TTS state to chat store

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 8: Create TTS Settings Component

**Files:**
- Create: `frontend/src/components/TTSSettings.jsx`

- [ ] **Step 1: Create TTSSettings component**

```jsx
// frontend/src/components/TTSSettings.jsx

import React, { useState, useEffect } from 'react'
import { Upload, Trash2, Download, RefreshCw } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

function TTSSettings() {
  const { ttsProvider, ttsVoice, ttsVoices, setTTSProvider, setTTSVoice, setTTSVoices, loadTTTSettings, loadTTSVoices } = useChatStore()
  const [coquiVoices, setCoquiVoices] = useState([])
  const [uploadName, setUploadName] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadTTTSettings()
    loadTTSVoices()
    if (ttsProvider === 'coqui') {
      loadCoquiVoices()
    }
  }, [ttsProvider])

  const loadCoquiVoices = async () => {
    const res = await fetch('/api/tts/coqui/voices')
    if (res.ok) {
      const data = await res.json()
      setCoquiVoices(data.voices)
    }
  }

  const handleProviderChange = async (provider) => {
    setTTSProvider(provider)
    await fetch('/api/tts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    })
    loadTTSVoices()
    if (provider === 'coqui') {
      loadCoquiVoices()
    }
  }

  const handleVoiceChange = async (voice) => {
    setTTSVoice(voice)
    await fetch('/api/tts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piperVoice: voice })
    })
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !uploadName) return

    setUploading(true)
    const formData = new FormData()
    formData.append('audio', file)
    formData.append('name', uploadName)

    try {
      const res = await fetch('/api/tts/coqui/voices', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        setUploadName('')
        loadCoquiVoices()
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteVoice = async (id) => {
    if (!confirm('Delete this voice sample?')) return
    await fetch(`/api/tts/coqui/voices/${id}`, { method: 'DELETE' })
    loadCoquiVoices()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Text-to-Speech</h3>

      {/* Provider Selection */}
      <div>
        <label className="text-sm text-gray-500">Provider</label>
        <select
          value={ttsProvider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full mt-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="browser">Browser (Built-in)</option>
          <option value="piper">Piper TTS (Local Neural)</option>
          <option value="coqui">Coqui XTTS (Voice Cloning)</option>
        </select>
      </div>

      {/* Piper Voice Selection */}
      {ttsProvider === 'piper' && (
        <div>
          <label className="text-sm text-gray-500">Voice</label>
          <select
            value={ttsVoice || 'en_US-lessac-medium'}
            onChange={(e) => handleVoiceChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          >
            {ttsVoices.map(voice => (
              <option key={voice.id} value={voice.id}>{voice.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Need a voice? Download Piper from GitHub and run: node backend/tts/download-voice.js en_US-lessac-medium
          </p>
        </div>
      )}

      {/* Coqui Voice Management */}
      {ttsProvider === 'coqui' && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500">Cloned Voices</label>
            {coquiVoices.length === 0 ? (
              <p className="text-sm text-gray-400 mt-1">No voice samples. Upload one below.</p>
            ) : (
              <div className="mt-1 space-y-1">
                {coquiVoices.map(voice => (
                  <div key={voice.id} className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                    <span className="text-sm">{voice.name}</span>
                    <button
                      onClick={() => handleDeleteVoice(voice.id)}
                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-500">Upload Voice Sample</label>
            <p className="text-xs text-gray-400">10-30 seconds of clear speech</p>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="Voice name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
              <label className="px-4 py-2 bg-blue-500 text-white rounded-md cursor-pointer hover:bg-blue-600 flex items-center gap-2">
                <Upload size={16} />
                {uploading ? 'Uploading...' : 'Choose'}
                <input type="file" accept="audio/*" onChange={handleUpload} className="hidden" disabled={uploading || !uploadName} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TTSSettings
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TTSSettings.jsx
git commit -m "feat(tts): add TTS settings component

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 9: Integrate TTS Settings into Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Import and add TTSSettings to Sidebar**

Add to imports:
```jsx
import TTSSettings from './TTSSettings.jsx'
```

Find the settings section in the Sidebar and add TTSSettings below it:
```jsx
{/* Existing Settings Section */}
<div className="p-4 border-t border-gray-200 dark:border-gray-700">
  <button
    onClick={() => setShowSettings(!showSettings)}
    className="flex items-center gap-2 text-sm hover:text-blue-500"
  >
    <Settings size={16} />
    Settings
  </button>
</div>

{/* TTS Settings */}
<div className="p-4 border-t border-gray-200 dark:border-gray-700">
  <TTSSettings />
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(tts): integrate TTS settings into sidebar

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

### Task 10: Update useVoiceChat to use backend TTS

**Files:**
- Modify: `frontend/src/hooks/useVoiceChat.js`

- [ ] **Step 1: Update speak function to use backend TTS API**

Replace the existing `speak` function (around line 220-258) with:

```javascript
const speak = useCallback(async (text, options = {}) => {
  try {
    const response = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: options.voice })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('TTS error:', error.error)
      return false
    }

    const audioBuffer = await response.arrayBuffer()

    // Play audio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const audioData = await audioContext.decodeAudioData(audioBuffer)
    const source = audioContext.createBufferSource()
    source.buffer = audioData
    source.connect(audioContext.destination)

    return new Promise((resolve) => {
      source.onended = () => {
        audioContext.close()
        resolve(true)
      }
      source.start()
    })
  } catch (error) {
    console.error('Speech synthesis error:', error)
    return false
  }
}, [])
```

Also update `getVoices` to use backend API:

```javascript
const getVoices = useCallback(async () => {
  try {
    const response = await fetch('/api/tts/voices')
    if (response.ok) {
      const data = await response.json()
      return data.voices
    }
  } catch (error) {
    console.error('Failed to get voices:', error)
  }
  // Fallback to browser voices
  if ('speechSynthesis' in window) {
    return speechSynthesis.getVoices()
  }
  return []
}, [])
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useVoiceChat.js
git commit -m "feat(tts): use backend TTS API for speech synthesis

Co-Authored-By: Claude Opus 4.6 <noreply@openclaude.dev>"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create TTS base provider interface and voice sample model |
| 2 | Create TTSManager for provider routing |
| 3 | Create Browser TTS provider |
| 4 | Create Piper TTS provider with voice download script |
| 5 | Create Coqui XTTS provider with voice cloning |
| 6 | Add TTS API routes to server |
| 7 | Add TTS state to frontend store |
| 8 | Create TTS Settings component |
| 9 | Integrate TTS Settings into Sidebar |
| 10 | Update useVoiceChat to use backend TTS API |