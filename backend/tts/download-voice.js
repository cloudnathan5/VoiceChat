// backend/tts/download-voice.js
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
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
  'en_US-ryan-low': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/low/en_US-ryan-low.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/low/en_US-ryan-low.onnx.json'
  },
  'en_US-kathleen-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kathleen/medium/en_US-kathleen-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kathleen/medium/en_US-kathleen-medium.onnx.json'
  },
  'en_US-kristin-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx.json'
  },
  'en_GB-danny-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/danny/medium/en_GB-danny-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/danny/medium/en_GB-danny-medium.onnx.json'
  },
  'en_GB-southern-english-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english/medium/en_GB-southern-english-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english/medium/en_GB-southern-english-medium.onnx.json'
  },
  'en_GB-semaine-medium': {
    model: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/semaine/medium/en_GB-semaine-medium.onnx',
    config: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/semaine/medium/en_GB-semaine-medium.onnx.json'
  }
}

// Properly resolve redirect URLs (handles relative URLs)
function resolveUrl(baseUrl, location) {
  try {
    return new URL(location, baseUrl).toString()
  } catch {
    return location
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http

    protocol.get(url, { headers: { 'Accept': '*/*' } }, (response) => {
      // Handle redirect - check for Location header and follow
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location
        if (!location) {
          response.destroy()
          reject(new Error(`Redirect status ${response.statusCode} but no Location header`))
          return
        }
        const redirectUrl = resolveUrl(url, location)
        console.log(`  Following redirect to: ${redirectUrl.substring(0, 80)}...`)
        response.destroy()
        // Recursively follow the redirect
        downloadFile(redirectUrl, dest).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        response.destroy()
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      const file = createWriteStream(dest)
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', (err) => {
        response.destroy()
        reject(err)
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
