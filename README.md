# VoiceChat

**[Try it → cloudnathan5.github.io/VoiceChat](https://cloudnathan5.github.io/VoiceChat/)**

A thin wrapper that turns any OpenAI-compatible *text* model into a voice
assistant you can hold a conversation with. Speech in, speech out, low enough
latency that it doesn't feel like a walkie-talkie.

There is no server. The page runs entirely in your browser and talks to your
chosen endpoint directly, so the whole thing is a static site.

---

## How it works

The browser already ships both halves of the speech pipeline. VoiceChat is the
sandwich filling between them and a text model:

```
  microphone
      │
      ▼
  SpeechRecognition ──► transcript ──► silence detected? ──► send turn
  (Web Speech API)                                              │
                                                                ▼
                                          POST /chat/completions (stream: true)
                                                                │
                                                                ▼
                                             tokens ──► sentence splitter
                                                                │
                                                                ▼
                                              speechSynthesis queue ──► speaker
```

The part that matters for latency is the **sentence splitter**. Rather than
waiting for the model to finish, each sentence is handed to the synthesiser the
moment it is complete, so you hear the first words while the rest is still
being generated. Speaking over the assistant cancels both the audio and the
in-flight HTTP request, so you can interrupt it mid-sentence.

Everything — threads, messages, provider settings — lives in `localStorage`.

## Using it

1. Open the demo and click the gear icon.
2. Add a provider: a **base URL** (e.g. `https://api.openai.com/v1`) and your
   **API key**.
3. Pick a model, then start typing or press the microphone button.

Any OpenAI-compatible `/chat/completions` endpoint works. Anthropic's API is
supported too, detected from the provider name or URL. Models that stream their
reasoning separately (DeepSeek-R1, QwQ and similar) are handled — the thinking
is shown but not read aloud.

### Two things worth knowing

**Your API key is in the browser.** It is stored in `localStorage` and sent
directly from the page to the provider. That is what makes a serverless demo
possible, but it also means the key is reachable by anything else running on
the page, including browser extensions. Use a key with a spending cap rather
than your main one, and avoid shared machines.

**The endpoint must allow browser requests.** Because the call goes straight
from the page, the provider has to return permissive CORS headers. If a request
fails with a message about not reaching the host, that is what happened.

Checked 2026-08-12 against a GitHub Pages origin — these permit browser calls:

| Provider | Base URL |
| --- | --- |
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together | `https://api.together.xyz/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| Google (OpenAI-compatible) | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Cerebras | `https://api.cerebras.ai/v1` |
| xAI | `https://api.x.ai/v1` |

Anthropic additionally requires the `anthropic-dangerous-direct-browser-access`
header, which `frontend/src/lib/provider.js` sends; without it the preflight is
rejected.

**NVIDIA does not work.** `https://integrate.api.nvidia.com/v1` returns
`Access-Control-Allow-Origin` only for `*.nvidia.com` origins, so the browser
blocks it before the request is sent. This is not fixable from the client — no
header or code change helps. `api.nvcf.nvidia.com` does allow browser origins
but is not OpenAI-compatible (it invokes via `/v2/nvcf/pexec/functions/{id}`),
so it is not a substitute. Reaching NVIDIA would require a proxy, which means
running a server again.

### Browser support

Speech **input** relies on the Web Speech API's `SpeechRecognition`, which today
means Chrome, Edge and Safari. Firefox does not implement it, so voice input is
unavailable there — text chat and speech output still work. Microphone access
also needs a secure context, which the hosted demo provides.

## Development

```bash
npm install
npm run dev          # vite dev server on localhost:3001
npm test             # unit tests for the stream and text logic
npm run build:demo   # produce demo/ exactly as it is published
npm run test:e2e     # drive the built page in a real browser
```

`demo/` is a build output and is not committed. The Pages workflow rebuilds it
from source on every push to `main`, so what is published always
matches the code.

`localhost` counts as a secure context, so the microphone works in `npm run dev`
without any extra setup. To test voice from another device on your network you
need TLS: drop a certificate at `frontend/.vite-certs/{server.key,server.crt}`
and the dev server will pick it up.

### Layout

```
frontend/src/
├── lib/
│   ├── sse.js          # streaming response decoding
│   ├── text.js         # sentence splitting, markdown stripping
│   ├── provider.js     # endpoint URLs, request bodies, error messages
│   └── demo-api.js     # the /api/* surface, served from localStorage
├── hooks/
│   ├── useVoiceChat.js # microphone, recognition, turn detection
│   ├── useTTS.js       # speech synthesis queue
│   └── socket-mock.js  # streams from the provider
└── components/
```

The `lib/` modules are pure and carry the unit tests. That is where the fiddly
parts live: reassembling responses split across network reads, and deciding
that "Dr. Smith" and "3.14" are not the ends of sentences.

## Tests

`npm test` covers the streaming decoder, the sentence splitter and request
shaping. `npm run test:e2e` builds the demo, serves it alongside a fake
OpenAI-compatible endpoint, drives it in headless Chromium, and asserts on the
request body the model actually received — which is where conversation-history
bugs hide, since they are invisible from the UI.

## License

MIT
