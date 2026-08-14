import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BOTTOM_THRESHOLD_PX, isAtBottom } from './scroll.js'

test('a scroller pinned to the bottom counts as at the bottom', () => {
  assert.equal(isAtBottom({ scrollTop: 400, scrollHeight: 800, clientHeight: 400 }), true)
})

test('scrolled to the top does not', () => {
  assert.equal(isAtBottom({ scrollTop: 0, scrollHeight: 800, clientHeight: 400 }), false)
})

test('content that does not overflow is always at the bottom', () => {
  // Otherwise reasoning would never be followed until it first overflowed.
  assert.equal(isAtBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 400 }), true)
  assert.equal(isAtBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 }), true)
})

test('a few pixels short still counts — subpixel scroll positions are normal', () => {
  assert.equal(isAtBottom({ scrollTop: 399.6, scrollHeight: 800, clientHeight: 400 }), true)
  assert.equal(isAtBottom({ scrollTop: 400 - BOTTOM_THRESHOLD_PX, scrollHeight: 800, clientHeight: 400 }), true)
})

test('past the threshold it stops counting, so a deliberate scroll up sticks', () => {
  assert.equal(isAtBottom({ scrollTop: 400 - BOTTOM_THRESHOLD_PX - 1, scrollHeight: 800, clientHeight: 400 }), false)
})

test('the threshold is adjustable', () => {
  const el = { scrollTop: 350, scrollHeight: 800, clientHeight: 400 }
  assert.equal(isAtBottom(el, 10), false)
  assert.equal(isAtBottom(el, 100), true)
})

test('tolerates a missing element', () => {
  assert.equal(isAtBottom(null), false)
  assert.equal(isAtBottom(undefined), false)
})
