# VoiceChat Demo (Static)

A self-contained, browser-only demo of VoiceChat that runs without any server.

## Features

- **Browser TTS only** — uses the Web Speech API for text-to-speech (no Piper server needed)
- **Web Speech API** — uses `SpeechRecognition` for voice input (Chrome/Edge only)
- **Server-Sent Events** — uses SSE for streaming AI responses instead of WebSocket
- **No backend required** — everything runs in the browser
- **Demo provider pre-configured** — includes a demo OpenAI-compatible provider

## How to use

Simply open `index.html` in a browser. No build step, no server, no dependencies.

### For voice features

- **Speech recognition** requires Chrome or Edge (Web Speech API)
- **TTS** works in all modern browsers via `SpeechSynthesis`
- Microphone permissions will be requested for voice input

## Differences from the full app

- Only one provider (browser TTS) — no Piper server
- No WebSocket — uses SSE for streaming responses
- No database — conversations stored in memory only
- No provider management — demo provider pre-configured
- No thread persistence — threads are lost on page refresh
