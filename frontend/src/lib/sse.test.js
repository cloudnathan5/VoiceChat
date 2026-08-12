import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSSEDecoder, readSSE } from './sse.js'

/** Feed chunks through a decoder and collect everything it emits. */
function decodeAll(chunks) {
  const decoder = createSSEDecoder()
  const events = []
  for (const chunk of chunks) events.push(...decoder.push(chunk))
  events.push(...decoder.flush())
  return events
}

/** A ReadableStream of UTF-8 bytes, split at the given byte offsets. */
function streamOf(text, splits = []) {
  const bytes = new TextEncoder().encode(text)
  const bounds = [0, ...splits, bytes.length]
  const parts = []
  for (let i = 0; i < bounds.length - 1; i++) {
    parts.push(bytes.slice(bounds[i], bounds[i + 1]))
  }
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
}

test('parses a simple event', () => {
  const events = decodeAll(['data: hello\n\n'])
  assert.deepEqual(events, [{ event: 'message', data: 'hello', id: '' }])
})

test('reassembles an event split mid-line across chunks', () => {
  // The bug this guards: splitting each network read on '\n' independently
  // drops whichever line straddles the boundary.
  const events = decodeAll(['data: {"a":', '1}\n\n'])
  assert.deepEqual(events.map((e) => e.data), ['{"a":1}'])
})

test('loses nothing when a payload is split at every character', () => {
  const payload = 'data: one\n\ndata: two\n\ndata: three\n\n'
  const events = decodeAll([...payload])
  assert.deepEqual(events.map((e) => e.data), ['one', 'two', 'three'])
})

test('handles CRLF split across a chunk boundary', () => {
  const events = decodeAll(['data: hi\r', '\n\r\n'])
  assert.deepEqual(events.map((e) => e.data), ['hi'])
})

test('joins multi-line data fields with a newline', () => {
  const events = decodeAll(['data: first\ndata: second\n\n'])
  assert.deepEqual(events.map((e) => e.data), ['first\nsecond'])
})

test('reads the event name and ignores comments', () => {
  const events = decodeAll([': keep-alive\nevent: token\ndata: x\n\n'])
  assert.deepEqual(events, [{ event: 'token', data: 'x', id: '' }])
})

test('strips only one leading space after the colon', () => {
  const events = decodeAll(['data:  padded\n\n'])
  assert.deepEqual(events.map((e) => e.data), [' padded'])
})

test('flush dispatches a trailing event with no blank line', () => {
  // Several OpenAI-compatible servers end the stream this way; dropping it
  // loses the final sentence of the reply.
  const events = decodeAll(['data: last'])
  assert.deepEqual(events.map((e) => e.data), ['last'])
})

test('emits nothing for a stream of only comments', () => {
  assert.deepEqual(decodeAll([': ping\n\n: ping\n\n']), [])
})

test('readSSE survives a multi-byte character split across reads', async () => {
  // "é" is two bytes; splitting between them yields U+FFFD unless the decoder
  // is told the stream is continuing.
  const text = 'data: café\n\n'
  const bytes = new TextEncoder().encode(text)
  const splitInsideAccent = bytes.length - 3

  const seen = []
  for await (const event of readSSE(streamOf(text, [splitInsideAccent]))) {
    seen.push(event.data)
  }
  assert.deepEqual(seen, ['café'])
})

test('readSSE yields events in order across arbitrary boundaries', async () => {
  const text = 'data: a\n\ndata: b\n\ndata: [DONE]\n\n'
  const seen = []
  for await (const event of readSSE(streamOf(text, [3, 9, 14]))) {
    seen.push(event.data)
  }
  assert.deepEqual(seen, ['a', 'b', '[DONE]'])
})

test('readSSE cancels the stream when the consumer stops early', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: a\n\ndata: b\n\n'))
    },
    cancel() {
      cancelled = true
    },
  })

  for await (const event of readSSE(stream)) {
    assert.equal(event.data, 'a')
    break // what barge-in does
  }

  assert.equal(cancelled, true)
})
