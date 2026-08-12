import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeForSpeech, splitSpeakable } from './text.js'

const chunksOf = (text, options) => splitSpeakable(text, options).chunks

test('splits on sentence boundaries', () => {
  assert.deepEqual(
    chunksOf('One thing happened. Another thing happened. '),
    ['One thing happened.', 'Another thing happened.'],
  )
})

test('keeps the trailing fragment buffered until it is finished', () => {
  const { chunks, rest } = splitSpeakable('Done here. Still typ')
  assert.deepEqual(chunks, ['Done here.'])
  assert.equal(rest, 'Still typ')
})

test('does not split inside a decimal', () => {
  const { chunks, rest } = splitSpeakable('Pi is roughly 3.14 and that is that')
  assert.deepEqual(chunks, [])
  assert.equal(rest, 'Pi is roughly 3.14 and that is that')
})

test('does not split after a title', () => {
  assert.deepEqual(
    chunksOf('Ask Dr. Smith about it. He knows. '),
    ['Ask Dr. Smith about it.', 'He knows.'],
  )
})

test('does not split after an initial', () => {
  assert.deepEqual(chunksOf('It was J. R. R. Tolkien who wrote it. '), ['It was J. R. R. Tolkien who wrote it.'])
})

test('does not split a numbered list marker', () => {
  assert.deepEqual(
    chunksOf('Steps:\n1. Preheat the oven.\n2. Add flour. ', { minChars: 0 }),
    ['Steps:\n1. Preheat the oven.', '2. Add flour.'],
  )
})

test('treats a lowercase continuation as mid-sentence', () => {
  // Covers "etc.", "e.g." and friends without enumerating every abbreviation.
  const { chunks, rest } = splitSpeakable('Bring apples, pears, etc. and also bread')
  assert.deepEqual(chunks, [])
  assert.equal(rest, 'Bring apples, pears, etc. and also bread')
})

test('splits after an abbreviation when a new sentence really starts', () => {
  assert.deepEqual(
    chunksOf('Bring apples, etc. Then head home. '),
    ['Bring apples, etc.', 'Then head home.'],
  )
})

test('splits on question and exclamation marks', () => {
  assert.deepEqual(chunksOf('Ready? Then go! '), ['Ready?', 'Then go!'])
})

test('keeps a closing quote with its sentence', () => {
  assert.deepEqual(chunksOf('She said "hello." Then she left. '), ['She said "hello."', 'Then she left.'])
})

test('merges sentences shorter than minChars', () => {
  // Speaking "Yes." on its own makes the voice stutter between utterances.
  assert.deepEqual(chunksOf('Yes. Here is the longer explanation. ', { minChars: 20 }), [
    'Yes. Here is the longer explanation.',
  ])
})

test('minChars 0 emits even a very short sentence', () => {
  assert.deepEqual(chunksOf('Yes. ', { minChars: 0 }), ['Yes.'])
})

test('breaks run-on text at a clause instead of buffering forever', () => {
  const runOn = `${'word '.repeat(30)}, and then more words that never end`
  const { chunks } = splitSpeakable(runOn, { maxChars: 80 })
  assert.ok(chunks.length > 0, 'expected a clause-level break')
  assert.ok(chunks[0].length <= 80)
})

test('never returns an empty chunk or loops on whitespace', () => {
  const { chunks, rest } = splitSpeakable('   ')
  assert.deepEqual(chunks, [])
  assert.equal(rest, '   ')
})

test('rest is always a literal suffix of the input', () => {
  // useTTS advances its "already spoken" offset by (input.length - rest.length),
  // which is only exact while this holds.
  for (const input of ['One. Two. Thr', 'No boundary here', 'Ends exactly. ']) {
    const { rest } = splitSpeakable(input)
    assert.ok(input.endsWith(rest), `${JSON.stringify(rest)} should end ${JSON.stringify(input)}`)
  }
})

test('streaming token-by-token yields the same words as one pass', () => {
  const answer =
    'Sure, I can help with that. The capital of France is Paris. ' +
    'It has about 2.1 million residents. Anything else?'

  const streamed = []
  let buffer = ''
  for (const character of answer) {
    buffer += character
    const { chunks, rest } = splitSpeakable(buffer, { minChars: 12 })
    streamed.push(...chunks)
    buffer = rest
  }
  const { chunks: tail, rest } = splitSpeakable(buffer, { minChars: 0 })
  streamed.push(...tail)
  if (rest.trim()) streamed.push(rest.trim())

  const normalize = (s) => s.replace(/\s+/g, ' ').trim()
  assert.equal(normalize(streamed.join(' ')), normalize(answer))
  assert.ok(streamed.length >= 3, 'expected the answer to be spoken in several pieces')
})

test('sanitizeForSpeech strips markdown emphasis', () => {
  assert.equal(sanitizeForSpeech('This is **bold** and *italic*.'), 'This is bold and italic.')
})

test('sanitizeForSpeech keeps snake_case identifiers intact', () => {
  // Blanket-removing "_" turned user_name into username.
  assert.equal(sanitizeForSpeech('Call get_user_name now.'), 'Call get_user_name now.')
})

test('sanitizeForSpeech announces code blocks rather than reading them', () => {
  const spoken = sanitizeForSpeech('Try this:\n```js\nconst x = 1;\n```\nThat works.')
  assert.ok(!spoken.includes('const x'), 'code contents should not be spoken')
  assert.ok(spoken.includes('code block'))
})

test('sanitizeForSpeech handles a code fence that is still streaming', () => {
  const spoken = sanitizeForSpeech('Here you go:\n```python\nimport os')
  assert.ok(!spoken.includes('import os'))
})

test('sanitizeForSpeech keeps link text and drops the URL', () => {
  assert.equal(sanitizeForSpeech('See [the docs](https://example.com/x) here.'), 'See the docs here.')
})

test('sanitizeForSpeech removes emoji', () => {
  assert.equal(sanitizeForSpeech('Nice work 🎉👍🏽 today.'), 'Nice work today.')
})

test('sanitizeForSpeech drops heading and bullet markers', () => {
  assert.equal(sanitizeForSpeech('## Title\n- first\n- second'), 'Title\nfirst\nsecond')
})
