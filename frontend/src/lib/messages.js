/**
 * Reconcile a thread's stored messages with any reply still arriving.
 *
 * Reopening a thread reloads it from storage, but a reply that is mid-stream
 * lives only in memory — it has to be laid back over the stored list.
 *
 * Doing that by appending, as this used to, moved the in-flight message to the
 * bottom of the thread. That was invisible while it really was the newest
 * message, and wrong the moment it wasn't: interrupt a reply, keep talking,
 * then switch away and back, and the interrupted answer had jumped to the end
 * of the conversation. Stored order is the truth; an overlay only replaces
 * content in place.
 */
export function mergeThreadMessages(stored, inFlight = []) {
  const live = new Map((inFlight || []).filter((m) => m && m.id).map((m) => [m.id, m]))

  const merged = (stored || [])
    .filter((m) => m && m.id)
    // A stored message still flagged as streaming with nothing arriving for it
    // is a placeholder left behind by a reload mid-reply — it renders as an
    // empty bubble with a "Thinking..." animation that never resolves.
    .filter((m) => !m.isStreaming || live.has(m.id))
    .map((m) => live.get(m.id) || m)

  // A reply that began after the last save has no stored counterpart yet, so
  // it genuinely belongs at the end.
  const seen = new Set(merged.map((m) => m.id))
  for (const message of live.values()) {
    if (!seen.has(message.id)) merged.push(message)
  }

  return merged
}
