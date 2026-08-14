/**
 * How far from the bottom still counts as "at the bottom".
 *
 * Not zero: scrollTop is fractional on scaled displays, and content can grow
 * between the scroll event and the measurement, so an exact comparison drops
 * out of follow mode on its own during a stream.
 */
export const BOTTOM_THRESHOLD_PX = 32

/**
 * Is this scroller at (or near enough to) the bottom?
 *
 * Takes anything with the three scroll metrics, so it can be tested without a
 * DOM. Content that doesn't overflow is trivially at the bottom — otherwise a
 * short reply would never be followed once it grew.
 */
export function isAtBottom(el, threshold = BOTTOM_THRESHOLD_PX) {
  if (!el) return false

  const { scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = el
  if (scrollHeight <= clientHeight) return true

  return scrollHeight - scrollTop - clientHeight <= threshold
}
