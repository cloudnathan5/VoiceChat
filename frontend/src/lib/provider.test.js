import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatRequest,
  buildMessages,
  chatCompletionsUrl,
  describeHttpError,
  detectProviderKind,
  extractDelta,
  modelsUrl,
  parseModelList,
} from './provider.js'

test('appends the chat path to a plain base URL', () => {
  assert.equal(chatCompletionsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions')
})

test('tolerates a trailing slash', () => {
  // `base + '/models'` on a base ending in "/" produced a double slash, which
  // some gateways 404 on.
  assert.equal(chatCompletionsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions')
  assert.equal(modelsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/models')
})

test('leaves a base URL that already names the endpoint alone', () => {
  const full = 'https://api.example.com/v1/chat/completions'
  assert.equal(chatCompletionsUrl(full), full)
})

test('builds Anthropic URLs without duplicating the version segment', () => {
  assert.equal(chatCompletionsUrl('https://api.anthropic.com', 'anthropic'), 'https://api.anthropic.com/v1/messages')
  assert.equal(chatCompletionsUrl('https://api.anthropic.com/v1', 'anthropic'), 'https://api.anthropic.com/v1/messages')
})

test('detects the provider kind from name or URL', () => {
  assert.equal(detectProviderKind({ name: 'Anthropic', baseUrl: '' }), 'anthropic')
  assert.equal(detectProviderKind({ name: 'Work key', baseUrl: 'https://api.anthropic.com' }), 'anthropic')
  assert.equal(detectProviderKind({ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' }), 'openai')
})

test('does not send the current turn twice', () => {
  // The store writes each message to localStorage as it is added, so the turn
  // being sent is already in `stored`. Appending it again sent every user
  // message to the model twice.
  const stored = [
    { role: 'user', content: 'first question', isStreaming: false },
    { role: 'assistant', content: 'first answer', isStreaming: false },
    { role: 'user', content: 'second question', isStreaming: false },
  ]
  assert.deepEqual(buildMessages(stored, 'second question'), [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'second question' },
  ])
})

test('appends the current turn when it has not been persisted', () => {
  const stored = [{ role: 'user', content: 'earlier', isStreaming: false }]
  assert.deepEqual(buildMessages(stored, 'brand new'), [
    { role: 'user', content: 'earlier' },
    { role: 'user', content: 'brand new' },
  ])
})

test('drops the empty assistant placeholder the UI adds for streaming', () => {
  const stored = [
    { role: 'user', content: 'hello', isStreaming: false },
    { role: 'assistant', content: '', isStreaming: true },
  ]
  assert.deepEqual(buildMessages(stored, 'hello'), [{ role: 'user', content: 'hello' }])
})

test('drops blank and unknown-role entries', () => {
  const stored = [
    { role: 'system', content: 'ignored here' },
    { role: 'assistant', content: '   ' },
    null,
    { role: 'user', content: 'kept' },
  ]
  assert.deepEqual(buildMessages(stored, ''), [{ role: 'user', content: 'kept' }])
})

test('prepends a system prompt when given one', () => {
  assert.deepEqual(buildMessages([], 'hi', { systemPrompt: 'Be brief.' }), [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'hi' },
  ])
})

test('moves the system prompt into Anthropic top-level field', () => {
  const request = buildChatRequest({
    provider: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k' },
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'hi' },
    ],
  })

  assert.equal(request.body.system, 'Be brief.')
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'hi' }])
  // Without this header the browser request is refused outright.
  assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true')
})

test('extracts an OpenAI content delta', () => {
  const delta = extractDelta({ choices: [{ delta: { content: 'Hel' } }] })
  assert.equal(delta.content, 'Hel')
  assert.equal(delta.reasoning, '')
})

test('keeps reasoning separate from the answer', () => {
  // DeepSeek-R1 and similar stream their chain of thought in its own field.
  // Folding it into the answer makes the synthesiser read the thinking aloud.
  const delta = extractDelta({ choices: [{ delta: { reasoning_content: 'let me think' } }] })
  assert.equal(delta.content, '')
  assert.equal(delta.reasoning, 'let me think')
})

test('reads a whole message from a server that ignored stream:true', () => {
  const delta = extractDelta({ choices: [{ message: { content: 'entire answer' }, finish_reason: 'stop' }] })
  assert.equal(delta.content, 'entire answer')
  assert.equal(delta.finished, true)
})

test('flattens array-shaped content parts', () => {
  const delta = extractDelta({ choices: [{ delta: { content: [{ text: 'a' }, { text: 'b' }] } }] })
  assert.equal(delta.content, 'ab')
})

test('extracts Anthropic text and thinking deltas separately', () => {
  // The previous implementation filed text_delta under "thinking", so an
  // Anthropic provider streamed no visible answer at all.
  const text = extractDelta(
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
    'anthropic',
  )
  assert.equal(text.content, 'Hello')
  assert.equal(text.reasoning, '')

  const thinking = extractDelta(
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } },
    'anthropic',
  )
  assert.equal(thinking.content, '')
  assert.equal(thinking.reasoning, 'hmm')

  assert.equal(extractDelta({ type: 'message_stop' }, 'anthropic').finished, true)
})

test('ignores payloads with no delta at all', () => {
  assert.deepEqual(extractDelta({ choices: [{}] }), { content: '', reasoning: '', finished: false })
  assert.deepEqual(extractDelta(null), { content: '', reasoning: '', finished: false })
})

test('parses the common model list shapes', () => {
  const expected = [{ id: 'a', name: 'a', capabilities: [] }]
  assert.deepEqual(parseModelList({ data: [{ id: 'a' }] }), expected)
  assert.deepEqual(parseModelList([{ id: 'a' }]), expected)
  assert.deepEqual(parseModelList({ models: [{ id: 'a' }] }), expected)
  assert.deepEqual(parseModelList(['a']), expected)
  assert.deepEqual(parseModelList(null), [])
})

test('turns a JSON error body into one readable line', () => {
  const message = describeHttpError(401, JSON.stringify({ error: { message: 'Invalid API key' } }))
  assert.match(message, /401/)
  assert.match(message, /Invalid API key/)
})

test('does not quote an HTML error page back at the user', () => {
  const message = describeHttpError(502, '<!DOCTYPE html><html><body>Bad Gateway</body></html>')
  assert.ok(!message.includes('<'), message)
})

test('suggests the version path on a 404', () => {
  assert.match(describeHttpError(404, ''), /\/v1/)
})
