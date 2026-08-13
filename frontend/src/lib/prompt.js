// The system prompt actually sent, assembled from the two the user controls.
//
// They are kept apart rather than merged into one editable box because they
// answer to different things: the system prompt is what the user wants the
// model to be, and the TTS prompt is a consequence of the output being spoken
// rather than read. Editing one should not cost you the other, and the TTS
// half has to disappear the moment speech is switched off — its instructions
// actively make a written reply worse.

export const STORAGE_KEYS = {
  systemPrompt: 'vc_system_prompt',
  ttsPrompt: 'vc_tts_prompt',
}

/** No opinion by default: an unrequested persona is a surprise. */
export const DEFAULT_SYSTEM_PROMPT = ''

/**
 * Speech is a different medium from text, and models don't know they're being
 * read aloud. Left alone they answer with bullet lists, headings and emoji,
 * all of which a synthesiser either reads out as punctuation or skips.
 */
export const DEFAULT_TTS_PROMPT = [
  'Your reply will be spoken aloud by a text-to-speech voice, not read on screen.',
  'Write the way people talk: plain sentences, no markdown, no bullet points, no',
  'headings, no code blocks, no emoji, and no symbols that do not read naturally',
  'out loud. Expand abbreviations and write numbers as they should be said.',
  'Keep it short and conversational — a couple of sentences unless more is asked for.',
].join(' ')

/**
 * Join the prompts that apply right now. The TTS half is included only while
 * speech output is on.
 */
export function composeSystemPrompt({ systemPrompt, ttsPrompt, ttsEnabled } = {}) {
  const parts = [String(systemPrompt || '').trim()]
  if (ttsEnabled) parts.push(String(ttsPrompt || '').trim())

  // A blank line between them: run together, the second reads like a
  // continuation of the first sentence of the first.
  return parts.filter(Boolean).join('\n\n')
}
