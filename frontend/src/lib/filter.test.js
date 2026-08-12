import { test } from 'node:test'
import assert from 'node:assert/strict'

import { filterOptions, scoreOption } from './filter.js'

const MODELS = [
  { value: 'openai/gpt-5.5', label: 'OpenAI: GPT-5.5' },
  { value: 'openai/gpt-5.5-pro', label: 'OpenAI: GPT-5.5 Pro' },
  { value: 'google/gemma-4-26b-a4b', label: 'Google: Gemma 4 26B A4B' },
  { value: 'anthropic/claude-opus-4.7', label: 'Anthropic: Claude Opus 4.7' },
  { value: 'deepseek/deepseek-v4-pro', label: 'DeepSeek: DeepSeek V4 Pro' },
]

const labelsFor = (query) => filterOptions(MODELS, query).map((option) => option.label)

test('an empty query returns the list unchanged', () => {
  assert.deepEqual(filterOptions(MODELS, ''), MODELS)
  assert.deepEqual(filterOptions(MODELS, '   '), MODELS)
})

test('matches terms typed out of order and out of sequence', () => {
  assert.deepEqual(labelsFor('gemma 26b'), ['Google: Gemma 4 26B A4B'])
  assert.deepEqual(labelsFor('26b gemma'), ['Google: Gemma 4 26B A4B'])
})

test('is case insensitive', () => {
  assert.deepEqual(labelsFor('OPUS'), ['Anthropic: Claude Opus 4.7'])
})

test('matches on the model id, not just the label', () => {
  assert.deepEqual(labelsFor('deepseek-v4'), ['DeepSeek: DeepSeek V4 Pro'])
})

test('matches on the hint line', () => {
  const options = [{ value: 'p1', label: 'My Provider', hint: 'https://openrouter.ai/api/v1' }]
  assert.deepEqual(filterOptions(options, 'openrouter').length, 1)
})

test('ranks an exact label above a longer one that also matches', () => {
  assert.deepEqual(labelsFor('openai: gpt-5.5'), ['OpenAI: GPT-5.5', 'OpenAI: GPT-5.5 Pro'])
})

test('ranks a word-start match above a mid-word one', () => {
  const options = [
    { value: 'a', label: 'Nemotron-gpt Ultra' },
    { value: 'b', label: 'GPT-5.5' },
  ]
  assert.deepEqual(filterOptions(options, 'gpt').map((o) => o.label), ['GPT-5.5', 'Nemotron-gpt Ultra'])
})

test('keeps the original order for equally good matches', () => {
  assert.deepEqual(labelsFor('openai'), ['OpenAI: GPT-5.5', 'OpenAI: GPT-5.5 Pro'])
})

test('returns nothing when a term matches nothing', () => {
  assert.deepEqual(labelsFor('gemma llama'), [])
  assert.deepEqual(labelsFor('nonexistent'), [])
})

test('scoreOption reports no match as -1', () => {
  assert.equal(scoreOption({ value: 'x', label: 'Claude' }, 'gemma'), -1)
  assert.ok(scoreOption({ value: 'x', label: 'Claude' }, 'claude') >= 0)
})

test('tolerates missing fields and non-array input', () => {
  assert.deepEqual(filterOptions(null, 'x'), [])
  assert.deepEqual(filterOptions(undefined, ''), [])
  assert.deepEqual(filterOptions([{ value: 'a' }], 'a').length, 1)
  assert.equal(scoreOption(null, 'a'), -1)
})
