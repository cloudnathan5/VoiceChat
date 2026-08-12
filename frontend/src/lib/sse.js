/**
 * Server-Sent Events decoding.
 *
 * The obvious implementation — `chunk.split('\n')` on every network read —
 * loses tokens, because a read boundary lands mid-line roughly as often as
 * not. It also mangles multi-byte characters that straddle two reads. Both
 * failures are silent: you get a reply that is quietly missing words. So the
 * decoder below buffers across reads and only ever hands back lines it has
 * seen terminated.
 *
 * Deliberate deviation from the spec: `flush()` dispatches a trailing event
 * that never got its blank line. Several OpenAI-compatible servers end the
 * stream that way, and dropping the last sentence is worse than being lenient.
 */

/** A decoder that turns arbitrary string chunks into whole SSE events. */
export function createSSEDecoder() {
  let buffer = ''
  let dataLines = []
  let eventType = ''
  let lastId = ''

  function dispatch(out) {
    if (dataLines.length > 0) {
      out.push({
        event: eventType || 'message',
        data: dataLines.join('\n'),
        id: lastId,
      })
    }
    dataLines = []
    eventType = ''
  }

  function handleLine(line, out) {
    if (line === '') {
      dispatch(out)
      return
    }
    // Comment / keep-alive ping.
    if (line.startsWith(':')) return

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') dataLines.push(value)
    else if (field === 'event') eventType = value
    else if (field === 'id' && !value.includes('\0')) lastId = value
    // `retry` and unknown fields are not useful here.
  }

  return {
    /** Feed a chunk of decoded text. Returns whole events, if any. */
    push(chunk) {
      const out = []
      if (!chunk) return out

      buffer += chunk

      // A chunk ending in CR may be the first half of a CRLF pair, so hold it
      // back until the next chunk proves otherwise.
      let held = ''
      let searchable = buffer
      if (searchable.endsWith('\r')) {
        held = '\r'
        searchable = searchable.slice(0, -1)
      }

      const lines = searchable.replace(/\r\n?/g, '\n').split('\n')
      buffer = lines.pop() + held

      for (const line of lines) handleLine(line, out)
      return out
    },

    /** Close the stream, dispatching any unterminated trailing event. */
    flush() {
      const out = []
      if (buffer) {
        const rest = buffer.replace(/\r/g, '')
        buffer = ''
        if (rest) handleLine(rest, out)
      }
      dispatch(out)
      return out
    },
  }
}

/**
 * Read a `fetch` response body as a stream of SSE events.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @returns {AsyncGenerator<{event: string, data: string, id: string}>}
 */
export async function* readSSE(body) {
  const reader = body.getReader()
  const textDecoder = new TextDecoder('utf-8')
  const sse = createSSEDecoder()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // `stream: true` keeps partial multi-byte sequences buffered instead of
      // emitting replacement characters.
      yield* sse.push(textDecoder.decode(value, { stream: true }))
    }
    yield* sse.push(textDecoder.decode())
    yield* sse.flush()
  } finally {
    // Propagates cancellation upstream when the consumer breaks early — which
    // is what happens on barge-in. Also releases the reader lock.
    try {
      await reader.cancel()
    } catch {
      // Already closed or errored; nothing to unwind.
    }
  }
}
