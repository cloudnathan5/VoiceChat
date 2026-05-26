# TTS Setup Guide

## Overview

VoiceChat supports two TTS (Text-to-Speech) providers:

1. **Browser TTS** - Uses your OS/browser built-in voices (default, no setup needed)
2. **Piper TTS** - Neural TTS running locally for higher quality voices

## Browser TTS

This is enabled by default and works out of the box. It uses the voices available on your operating system.

To use: Just enable TTS in the settings menu and select "Browser" as the provider.

## Piper TTS (Neural)

Piper provides higher quality neural TTS voices but requires running a local server.

### Installation

**Option 1: Install Piper**

```bash
# Using pip (Python required)
pip install piper-tts

# Download a voice model
# Example: English (US) - lessac medium quality
wget https://github.com/rhasspy/piper/raw/master/src/python_api/voice_samples/en_US-lessac-medium.onnx
wget https://github.com/rhasspy/piper/raw/master/src/python_api/voice_samples/en_US-lessac-medium.onnx.json
```

**Option 2: Docker (Recommended)**

```bash
# Pull the Docker image
docker pull rhasspy/piper:latest

# Run with a model
docker run -p 5000:5000 rhasspy/piper \
  --model /models/en_US-lessac-medium.onnx \
  --port 5000
```

### Running the Server

```bash
# Start the Piper TTS server
piper-tts-server --model en_US-lessac-medium.onnx --port 5000

# Or with Docker
docker run -p 5000:5000 -v /path/to/models:/models rhasspy/piper \
  --model /models/en_US-lessac-medium.onnx
```

### Download More Voices

Available models: https://github.com/rhasspy/piper/blob/master/src/python_api/voice_samples/models.md

Popular voices:
- `en_US-lessac-medium` - American English, medium quality
- `en_US-lessac-high` - American English, high quality
- `en_GB-alba-medium` - Scottish English
- `de_DE-thorsten-medium` - German
- `es_ES-carluxx-medium` - Spanish

## Using Piper in VoiceChat

1. Start the Piper TTS server
2. In VoiceChat, click the speaker icon
3. Select "Piper" as the TTS provider
4. The status will show "Local TTS" when connected

## Troubleshooting

**Piper not showing as available:**
- Make sure the Piper server is running on port 5000
- Check the server logs for any errors
- Try: `curl http://localhost:5000/health`

**Audio quality issues:**
- Try a higher quality model (e.g., `en_US-lessac-high`)
- Adjust the speaking rate in settings

**Model download failing:**
- Models are available from: https://huggingface.co/rhasspy/piper-voices