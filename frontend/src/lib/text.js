/**
 * Text processing that sits between the model and the speech synthesiser.
 *
 * `splitSpeakable` is what makes the conversation feel fast: it pulls complete
 * sentences out of a half-finished stream so the first one starts playing
 * while the rest is still arriving. Splitting on `/[.!?]/` — the obvious
 * implementation — cuts "Dr. Smith" and "version 3. 14" in half, which is
 * immediately audible, so the rules below are a little fussier.
 */

/**
 * Abbreviations routinely followed by a capitalised word, where the generic
 * "a lowercase continuation means keep going" rule below can't save us.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'ft', 'rev', 'hon',
  'gen', 'col', 'lt', 'sgt', 'capt', 'gov', 'sen', 'rep', 'atty', 'supt',
  'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'assn', 'bros',
  'fig', 'figs', 'vol', 'no', 'nos', 'pp', 'ed', 'eds', 'al', 'ch', 'sec', 'eq',
  'approx', 'apt', 'ave', 'blvd', 'rd', 'ste',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'vs', 'viz', 'cf',
  'a.m', 'p.m', 'u.s', 'u.k', 'e.g', 'i.e', 'ph.d', 'm.d', 'b.a', 'm.a', 'b.s', 'm.s',
])

const TERMINATORS = '.!?…'
const CLOSERS = '"\'”’)]}»'
const CLAUSE_BREAKS = ',;:—–'

const isTerminator = (ch) => ch !== undefined && TERMINATORS.includes(ch)
const isLowerAlpha = (ch) => ch !== undefined && /\p{Ll}/u.test(ch)

/**
 * Decide whether a run of terminating punctuation really ends a sentence.
 *
 * @param {string} text     full buffer
 * @param {number} runStart index of the first terminator character
 * @param {string} run      the terminator run itself, e.g. "." or "?!"
 * @param {number} nextIdx  index of the first character after the trailing space
 */
function isSentenceEnd(text, runStart, run, nextIdx) {
  // A lowercase continuation means the dot belonged to the word, not the
  // sentence: "etc. and so on", "e.g. like this". This single rule covers most
  // abbreviations without having to enumerate them.
  if (isLowerAlpha(text[nextIdx])) return false

  // "!", "?" and "…" are unambiguous; only "." needs the extra scrutiny.
  if (run !== '.') return true

  const before = text.slice(0, runStart)

  // Numbered list marker at the start of a line: "1. First item".
  if (/(?:^|\n)[ \t]*\d{1,2}$/.test(before)) return false

  // A lone letter is an initial: "J. R. R. Tolkien".
  if (/(?:^|[\s("'])\p{L}$/u.test(before)) return false

  const word = before.match(/(\p{L}[\p{L}.]*)$/u)
  if (word && ABBREVIATIONS.has(word[1].toLowerCase().replace(/\.$/, ''))) return false

  return true
}

/** Latest clause-level break inside `window`, or -1. Used for run-on text. */
function lastClauseBreak(window, minChars) {
  let best = -1
  for (let i = 0; i < window.length - 1; i++) {
    if (!CLAUSE_BREAKS.includes(window[i])) continue
    if (!/\s/.test(window[i + 1])) continue
    let ws = i + 1
    while (ws < window.length && /\s/.test(window[ws])) ws++
    if (ws >= minChars) best = ws
  }
  return best
}

/**
 * Find where to cut `text`, or -1 to keep buffering.
 * Always returns a strictly positive index so callers cannot spin.
 */
function findCut(text, minChars, maxChars) {
  let i = 0
  while (i < text.length) {
    if (!isTerminator(text[i])) {
      i++
      continue
    }

    const runStart = i
    let end = i
    while (end < text.length && isTerminator(text[end])) end++
    const run = text.slice(runStart, end)

    while (end < text.length && CLOSERS.includes(text[end])) end++

    let ws = end
    while (ws < text.length && /\s/.test(text[ws])) ws++

    // No trailing whitespace yet: either we're mid-token ("3.14") or the
    // buffer simply stops here, and waiting one more token is cheaper than
    // guessing wrong.
    if (ws === end) {
      i = end
      continue
    }

    if (isSentenceEnd(text, runStart, run, ws) && ws >= minChars) return ws

    // Either not a real sentence end, or too short to speak on its own; in
    // both cases keep scanning so it merges into the next chunk.
    i = ws
  }

  // No sentence boundary in sight. Once the buffer is long enough that waiting
  // would be audible, break on a clause instead.
  if (text.length < maxChars) return -1

  const window = text.slice(0, maxChars)
  const clause = lastClauseBreak(window, minChars)
  if (clause > 0) return clause

  const space = window.lastIndexOf(' ')
  if (space > minChars) return space + 1
  return maxChars
}

/**
 * Pull every complete utterance out of a streaming buffer.
 *
 * @param {string} text
 * @param {{minChars?: number, maxChars?: number}} [options]
 *   `minChars` merges very short sentences into the next one so the voice
 *   doesn't stutter ("Sure." / "Yes." / "Here."). Pass 0 when flushing at the
 *   end of a response.
 * @returns {{chunks: string[], rest: string}}
 */
export function splitSpeakable(text, { minChars = 0, maxChars = 240 } = {}) {
  const chunks = []
  let rest = text ?? ''

  for (;;) {
    const cut = findCut(rest, minChars, maxChars)
    if (cut <= 0) break
    const chunk = rest.slice(0, cut).trim()
    rest = rest.slice(cut)
    if (chunk) chunks.push(chunk)
  }

  return { chunks, rest }
}

/**
 * Strip markup a speech synthesiser would otherwise read out literally.
 * Asterisks become audible stumbles and code blocks become minutes of symbols.
 */
export function sanitizeForSpeech(text) {
  if (!text) return ''

  return text
    // Code blocks, including the unterminated one at the head of a stream.
    .replace(/```[\s\S]*?```/g, ' code block. ')
    .replace(/```[\s\S]*$/g, ' code block. ')
    .replace(/`([^`\n]+)`/g, '$1')
    // Links and images keep their human-readable half.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Block-level markers.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*_][ \t]*){3,}$/gm, ' ')
    .replace(/^\s*[-*+][ \t]+/gm, '')
    // Emphasis, matched in pairs so snake_case identifiers survive intact.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\|/g, ' ')
    // Emoji, skin-tone modifiers, variation selectors and ZWJ.
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
