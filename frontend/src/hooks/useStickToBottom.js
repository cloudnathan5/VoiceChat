import { useCallback, useLayoutEffect, useRef } from 'react'
import { isAtBottom } from '../lib/scroll.js'

/**
 * Keep a scroller pinned to the bottom as content arrives — but only while the
 * reader is already there.
 *
 * Following unconditionally and not following at all are both wrong: the first
 * yanks the view back down the moment someone scrolls up to re-read, and the
 * second leaves a growing block of streamed text sitting at its first line.
 * So the reader's own scrolling decides. Scroll up and it stops following;
 * scroll back to the bottom and it resumes.
 *
 * Attach `ref` to the scrolling element and `onScroll` to its scroll event.
 * Pass the changing content as `signal` — the effect that follows runs when
 * that value changes.
 */
export function useStickToBottom(signal, { enabled = true } = {}) {
  const ref = useRef(null)
  const stuckRef = useRef(true)

  // The reader's intent, re-read on every scroll. A programmatic jump to the
  // bottom also lands here and simply confirms it.
  const onScroll = useCallback(() => {
    stuckRef.current = isAtBottom(ref.current)
  }, [])

  /** Force the view to the bottom and resume following. */
  const scrollToBottom = useCallback(() => {
    const element = ref.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    stuckRef.current = true
  }, [])

  // Layout effect, so the jump happens in the same frame the new text is laid
  // out — an ordinary effect lets the un-scrolled frame paint first, which
  // reads as a flicker on every token.
  //
  // Instant, not smooth: a smooth scroll is still animating when the next
  // token arrives and restarts it, so during a stream it never actually
  // reaches the bottom.
  useLayoutEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element || !stuckRef.current) return
    element.scrollTop = element.scrollHeight
  }, [signal, enabled])

  return { ref, onScroll, scrollToBottom }
}

export default useStickToBottom
