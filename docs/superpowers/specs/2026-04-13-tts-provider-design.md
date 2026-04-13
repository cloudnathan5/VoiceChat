# Multi-Provider TTS Engine Design

## Context

VoiceChat currently uses browser SpeechSynthesis for TTS output. While functional, it sounds robotic. Users want higher quality, more natural-sounding TTS with the following requirements:
- Free and runs locally
- Support for multiple TTS backends (provider model)
- For Coqui XTTS: ability to clone custom voices from audio samples
- Settings UI for provider selection and configuration

## Architecture

### Components

1. **TTSManager** (backend) - Routes requests to active TTS provider
2. **TTS Providers** (backend) - Provider-specific implementations:
   - `BrowserTTSProvider` - existing SpeechSynthesis wrapper
   - `PiperTTSProvider` - runs Piper TTS server
   - `CoquiXTTSProvider` - handles voice cloning + speech synthesis
3. **TTS Settings** (frontend) - UI for provider selection and configuration
4. **Voice Storage** (backend) - Stores cloned voice samples and metadata

### Data Model

**Voice Sample (for Coqui XTTS)**
```
{
  id: string,
  name: string,
  provider: "coqui",
  file_path: string,
  duration_seconds: number,
  created_at: datetime
}
```

### Settings Storage

Store in existing `settings` table:
```
key: "tts_provider", value: "browser" | "piper" | "coqui"
key: "tts_piper_voice", value: "en_US-lessac-medium"
key: "tts_coqui_voices", value: JSON([{id, name, file_path}])
```

## API Design

### Endpoints

`GET /api/tts/providers`
- Returns available TTS providers and their status
- Response: `{ providers: [{ id, name, status, voices? }] }`

`GET /api/tts/voices`
- Returns available voices for current provider
- Response: `{ voices: [{ id, name, provider }] }`

`POST /api/tts/speak`
- Request: `{ text: string, voice_id?: string }`
- Response: Audio stream (audio/wav) or JSON error

**Coqui-specific:**
`POST /api/tts/coqui/voices`
- Upload a voice sample for cloning
- Request: multipart form with audio file + name
- Response: `{ id, name, status: "processing" | "ready" }`

`GET /api/tts/coqui/voices`
- List cloned voices
- Response: `{ voices: [{ id, name, created_at }] }`

`DELETE /api/tts/coqui/voices/:id`
- Delete a cloned voice
- Response: `{ success: true }`

## Provider Configuration

### Browser TTS
- No configuration needed (uses system voices)
- Voice selection from available system voices

### Piper TTS
- Select from downloaded voice models
- Voices stored in `/backend/tts-models/piper/`
- Voice format: `{ voice_id, name, language }`

### Coqui XTTS
- Voice sample upload (10-30 seconds, WAV/MP3)
- Store samples in `/backend/voice-samples/`
- List of cloned voices with names

## Frontend Changes

### Settings Panel Location
In existing Settings area of Sidebar, add TTS section with:
1. Provider dropdown (Browser, Piper, Coqui)
2. Conditional config panel based on selected provider

### Browser Config
- Voice dropdown (from getVoices())

### Piper Config
- Voice model dropdown
- Model download button (if not installed)

### Coqui Config
- List of cloned voices
- Upload button + name input
- Delete voice button

## TTS Flow

1. User configures TTS provider in settings
2. AI response comes in as streaming text
3. Frontend sends complete sentences to `/api/tts/speak`
4. Backend routes to active provider
5. Provider returns audio, frontend plays it

## Implementation Priority

1. **Phase 1**: Piper TTS support (simpler, no voice cloning)
2. **Phase 2**: Coqui XTTS support (voice cloning)
3. **Phase 3**: Settings UI for switching providers

## Dependencies

### Piper
- Piper TTS binary or python piper-tts package
- ONNX voice models downloaded on-demand

### Coqui XTTS
- Python environment with PyTorch
- Coqui TTS library (`TTS`)
- GPU recommended but CPU fallback works

## File Structure

```
backend/
  tts/
    manager.js         # TTSManager - routes to active provider
    providers/
      browser.js       # BrowserTTSProvider
      piper.js         # PiperTTSProvider
      coqui.js         # CoquiXTTSProvider
    models/
      voice-sample.js  # Voice sample model
  voice-samples/       # Stored cloned voice audio
  tts-models/          # Piper voice models
    piper/
```

## Open Questions

- Should we support GPU-only Coqui XTTS with graceful fallback?
- How to handle long texts - chunk and stream, or queue?
- Should we cache TTS outputs for repeated responses?