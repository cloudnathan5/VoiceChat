// Match/rank logic for the searchable pickers.
//
// The model lists are long — OpenRouter alone answers with ~400 entries — so
// scrolling to find one is the wrong interaction. Two things matter here:
//
//   1. Terms may be typed in any order and out of sequence. Someone hunting for
//      "Google: Gemma 4 26B A4B" types "gemma 26b", not the vendor prefix.
//   2. The best match has to sort first. A plain substring filter leaves the
//      order the provider happened to send, so typing an exact model name can
//      still put it below ten near-misses.

const normalize = (value) => (typeof value === 'string' ? value.toLowerCase().trim() : '')

// Everything a query may match against: the visible label, the underlying id,
// and the secondary hint line. Ids matter because they are what a provider's
// docs quote ("meta-llama/llama-4-70b"), even though the label is prettier.
const haystackOf = (option) => {
  const label = normalize(option?.label)
  const value = normalize(option?.value)
  const hint = normalize(option?.hint)
  return [label, value === label ? '' : value, hint === label ? '' : hint]
    .filter(Boolean)
    .join(' ')
}

// True when `term` appears at the start of some word, not just anywhere.
// "gpt" should rank higher in "OpenAI: GPT-5.5" than in "Nvidia Nemotron-gpt".
const hasWordStart = (haystack, term) => {
  for (let i = haystack.indexOf(term); i !== -1; i = haystack.indexOf(term, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(haystack[i - 1])) return true
  }
  return false
}

/**
 * Rank one option against a query. Lower is a better match; -1 means no match
 * at all, which is the signal to drop the option from the list.
 */
export function scoreOption(option, query) {
  const q = normalize(query)
  if (!q) return 0

  const haystack = haystackOf(option)
  const terms = q.split(/\s+/).filter(Boolean)

  // Every term has to land somewhere, but not contiguously and not in order.
  if (!terms.every((term) => haystack.includes(term))) return -1

  const label = normalize(option?.label)
  if (label === q) return 0
  if (label.startsWith(q)) return 1
  if (hasWordStart(label, q)) return 2
  if (label.includes(q)) return 3
  if (haystack.includes(q)) return 4
  return 5 // matched only as scattered terms
}

/**
 * Filter and rank options for a query. An empty query returns the list
 * untouched — provider order is meaningful, so don't reshuffle it for free.
 */
export function filterOptions(options, query) {
  const list = Array.isArray(options) ? options : []
  if (!normalize(query)) return list

  const scored = []
  for (let i = 0; i < list.length; i++) {
    const score = scoreOption(list[i], query)
    if (score >= 0) scored.push({ option: list[i], score, i })
  }

  // Ties keep the provider's original order rather than an arbitrary one.
  scored.sort((a, b) => a.score - b.score || a.i - b.i)
  return scored.map((entry) => entry.option)
}
