import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mergeThreadMessages } from './messages.js'

const ids = (list) => list.map((m) => m.id)

test('stored order is kept when nothing is in flight', () => {
  const stored = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(ids(mergeThreadMessages(stored, [])), ['a', 'b', 'c'])
})

test('an in-flight reply is overlaid in place, not moved to the end', () => {
  // The reported bug: an interrupted answer sits mid-thread, the user keeps
  // talking, and reopening the thread used to drag that answer to the bottom.
  const stored = [
    { id: 'q1', role: 'user', content: 'first' },
    { id: 'a1', role: 'assistant', content: 'interrupted', isStreaming: true },
    { id: 'q2', role: 'user', content: 'carry on' },
    { id: 'a2', role: 'assistant', content: 'sure' },
  ]
  const inFlight = [{ id: 'a1', role: 'assistant', content: 'interrupted', isStreaming: true }]

  assert.deepEqual(ids(mergeThreadMessages(stored, inFlight)), ['q1', 'a1', 'q2', 'a2'])
})

test('the overlay wins on content', () => {
  const stored = [{ id: 'a1', content: 'stale' }]
  const merged = mergeThreadMessages(stored, [{ id: 'a1', content: 'fresher' }])
  assert.equal(merged[0].content, 'fresher')
})

test('a reply with no stored counterpart is appended', () => {
  const stored = [{ id: 'q1' }]
  assert.deepEqual(ids(mergeThreadMessages(stored, [{ id: 'a1', isStreaming: true }])), ['q1', 'a1'])
})

test('drops a stored streaming placeholder that nothing is filling', () => {
  // Left behind by a reload mid-reply; renders as a bubble that thinks forever.
  const stored = [{ id: 'q1' }, { id: 'orphan', isStreaming: true }]
  assert.deepEqual(ids(mergeThreadMessages(stored, [])), ['q1'])
})

test('keeps a completed message that is no longer streaming', () => {
  const stored = [{ id: 'a1', isStreaming: false }, { id: 'a2' }]
  assert.deepEqual(ids(mergeThreadMessages(stored, [])), ['a1', 'a2'])
})

test('does not duplicate a message present in both lists', () => {
  const stored = [{ id: 'a1', content: 'x', isStreaming: true }]
  assert.equal(mergeThreadMessages(stored, [{ id: 'a1', content: 'y' }]).length, 1)
})

test('tolerates missing and malformed input', () => {
  assert.deepEqual(mergeThreadMessages(null), [])
  assert.deepEqual(mergeThreadMessages(undefined, undefined), [])
  assert.deepEqual(ids(mergeThreadMessages([{ id: 'a' }, null, {}], [null])), ['a'])
})
