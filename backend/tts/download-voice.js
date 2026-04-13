// backend/tts/download-voice.js
import fs from 'fs'
import path from 'path'
import https from 'https'
import { createWriteStream } from 'fs'

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
      file.on('finish', () => {
        file.close()
        resolve()
      })
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