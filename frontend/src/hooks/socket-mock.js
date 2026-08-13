/**
 * Stand-in for socket.io-client used by the browser-only demo.
 *
 * It keeps the event surface the app already speaks (`start-stream`, `token`,
 * `stream_complete`, …) but instead of relaying to a Socket.IO server it
 * streams straight from the provider over SSE. The parsing and request-shaping
 * live in ../lib so they can be unit tested; what's left here is the event
 * plumbing.
 */

import { readSSE } from '../lib/sse.js'
import {
  buildChatRequest,
  buildMessages,
  describeHttpError,
  describeNetworkError,
  extractDelta,
} from '../lib/provider.js'
import { splitSpeakable } from '../lib/text.js'
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TTS_PROMPT,
  STORAGE_KEYS,
  composeSystemPrompt,
} from '../lib/prompt.js'

const MAX_TOKENS = 2048

/** Shortest fragment worth emitting as a speakable chunk. */
const MIN_SPEAKABLE_CHARS = 12

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

function createSocket() {
  const callbacks = {}
  let abortController = null
  let currentThread = null

  const emit = (event, payload) => {
    const cb = callbacks[event]
    if (cb) cb(payload)
  }

  function abort() {
    if (!abortController) return false
    abortController.abort()
    abortController = null
    return true
  }

  async function startStream(data) {
    abort()
    const controller = new AbortController()
    abortController = controller
    const release = () => {
      if (abortController === controller) abortController = null
    }

    const { threadId, content, providerId, modelId } = data || {}

    const provider = readStore('vc_providers', []).find((p) => p.id === providerId)
    if (!provider) {
      emit('stream_error', { error: 'No provider configured. Add one under Settings.' })
      release()
      return
    }
    if (!provider.baseUrl) {
      emit('stream_error', { error: `Provider "${provider.name}" has no base URL set.` })
      release()
      return
    }

    // Read at send time, not at mount: the prompts and the speech toggle can
    // both change between turns, and the next message should use what is set
    // now. An absent key falls back to the default; one the user has emptied
    // is stored as "" and is honoured as a deliberate choice.
    const systemPrompt = composeSystemPrompt({
      systemPrompt: readStore(STORAGE_KEYS.systemPrompt, DEFAULT_SYSTEM_PROMPT),
      ttsPrompt: readStore(STORAGE_KEYS.ttsPrompt, DEFAULT_TTS_PROMPT),
      ttsEnabled: readStore('tts_enabled_v2', false),
    })

    const stored = readStore('vc_messages', {})[threadId] || []
    const messages = buildMessages(stored, content, { systemPrompt })
    if (messages.length === 0) {
      emit('stream_error', { error: 'Nothing to send.' })
      release()
      return
    }

    const { url, headers, body, kind } = buildChatRequest({
      provider,
      model: modelId,
      messages,
      maxTokens: MAX_TOKENS,
    })

    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      release()
      if (controller.signal.aborted) emit('stream_aborted', {})
      else emit('stream_error', { error: describeNetworkError(error, url) })
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      release()
      // Only the error — the previous version also emitted `complete`, whose
      // handler immediately overwrote the message with an empty bubble.
      emit('stream_error', { error: describeHttpError(response.status, text) })
      return
    }

    let answer = ''
    let reasoning = ''
    let pending = ''

    try {
      for await (const event of readSSE(response.body)) {
        if (event.data === '[DONE]') break

        let json
        try {
          json = JSON.parse(event.data)
        } catch {
          continue // keep-alives and other non-JSON payloads
        }

        if (json.error) {
          throw new Error(json.error.message || String(json.error))
        }

        const delta = extractDelta(json, kind)

        if (delta.reasoning) {
          reasoning += delta.reasoning
          emit('thinking', { content: delta.reasoning })
        }

        if (delta.content) {
          answer += delta.content
          pending += delta.content
          emit('token', { content: delta.content, accumulated: answer })

          // Hand whole sentences to anything that wants to start speaking
          // before the response has finished arriving.
          const { chunks, rest } = splitSpeakable(pending, { minChars: MIN_SPEAKABLE_CHARS })
          pending = rest
          for (const chunk of chunks) {
            emit('quick_token', { content: chunk, accumulated: answer })
          }
        }

        if (delta.finished) break
      }
    } catch (error) {
      release()
      if (controller.signal.aborted || error?.name === 'AbortError') emit('stream_aborted', {})
      else emit('stream_error', { error: error?.message || String(error) })
      return
    }

    if (pending.trim()) {
      emit('quick_token', { content: pending.trim(), accumulated: answer })
    }
    release()

    if (!answer && !reasoning) {
      emit('stream_error', {
        error:
          'The provider accepted the request but returned no content. ' +
          'This usually means the model name is wrong for this endpoint.',
      })
      return
    }

    emit('stream_complete', { content: answer, thinking: reasoning })
  }

  const socket = {
    connected: false,

    on(event, cb) {
      callbacks[event] = cb
      return this
    },

    emit(event, data) {
      // The app has used both spellings over time; accept either.
      if (event === 'join_thread' || event === 'join-thread') {
        currentThread = data?.threadId ?? data
      } else if (event === 'start-stream') {
        // Fire and forget: rejections are reported through `stream_error`.
        startStream(data)
      } else if (event === 'abort') {
        // Always acknowledge, so a barge-in that lands between turns doesn't
        // leave the UI waiting for a reply that will never come.
        abort()
        emit('abort_ack', {})
      }
      return this
    },

    disconnect() {
      abort()
      this.connected = false
      return this
    },

    get currentThread() {
      return currentThread
    },
  }

  // Mirror socket.io's asynchronous connect callback.
  setTimeout(() => {
    socket.connected = true
    emit('connect', {})
  }, 0)

  return socket
}

function io() {
  return createSocket()
}

io.io = io
io.connect = io

export default io
