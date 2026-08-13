import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TTS_PROMPT, composeSystemPrompt } from './prompt.js'

test('nothing configured produces no system prompt', () => {
  assert.equal(composeSystemPrompt(), '')
  assert.equal(composeSystemPrompt({ systemPrompt: '', ttsPrompt: '', ttsEnabled: false }), '')
})

test('sends the system prompt alone when speech is off', () => {
  assert.equal(
    composeSystemPrompt({ systemPrompt: 'Be terse.', ttsPrompt: 'Speak plainly.', ttsEnabled: false }),
    'Be terse.',
  )
})

test('appends the TTS prompt only while speech is on', () => {
  assert.equal(
    composeSystemPrompt({ systemPrompt: 'Be terse.', ttsPrompt: 'Speak plainly.', ttsEnabled: true }),
    'Be terse.\n\nSpeak plainly.',
  )
})

test('the TTS prompt can stand on its own', () => {
  assert.equal(
    composeSystemPrompt({ systemPrompt: '', ttsPrompt: 'Speak plainly.', ttsEnabled: true }),
    'Speak plainly.',
  )
})

test('an emptied TTS prompt adds nothing even with speech on', () => {
  assert.equal(
    composeSystemPrompt({ systemPrompt: 'Be terse.', ttsPrompt: '   ', ttsEnabled: true }),
    'Be terse.',
  )
})

test('trims stray whitespace rather than sending it', () => {
  assert.equal(
    composeSystemPrompt({ systemPrompt: '  Be terse.\n', ttsPrompt: ' Speak plainly. ', ttsEnabled: true }),
    'Be terse.\n\nSpeak plainly.',
  )
})

test('tolerates non-string values', () => {
  assert.equal(composeSystemPrompt({ systemPrompt: null, ttsPrompt: undefined, ttsEnabled: true }), '')
})

test('the default TTS prompt tells the model the reply is spoken', () => {
  assert.match(DEFAULT_TTS_PROMPT, /spoken aloud/i)
  assert.match(DEFAULT_TTS_PROMPT, /no markdown/i)
  assert.match(DEFAULT_TTS_PROMPT, /emoji/i)
})
