/**
 * Talking to an OpenAI-compatible (or Anthropic) chat endpoint from the
 * browser.
 *
 * Everything here is pure so it can be unit tested without a network: URL
 * shaping, request bodies, per-provider delta extraction, and turning failures
 * into something a human can act on. The demo runs entirely client-side, so a
 * bad base URL or a CORS rejection is the single most common way it breaks —
 * "Failed to fetch" on its own tells the user nothing.
 */

/** @returns {'anthropic'|'openai'} */
export function detectProviderKind(provider) {
  const haystack = `${provider?.name || ''} ${provider?.baseUrl || ''}`.toLowerCase()
  return haystack.includes('anthropic') ? 'anthropic' : 'openai'
}

/** Strip trailing slashes so URL joins don't produce `//`. */
export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

/** Full chat URL, tolerating base URLs that already include the path. */
export function chatCompletionsUrl(baseUrl, kind = 'openai') {
  const base = normalizeBaseUrl(baseUrl)

  if (kind === 'anthropic') {
    if (/\/messages$/.test(base)) return base
    return /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`
  }

  if (/\/(chat\/)?completions$/.test(base)) return base
  return `${base}/chat/completions`
}

/** Full model-listing URL. */
export function modelsUrl(baseUrl, kind = 'openai') {
  const base = normalizeBaseUrl(baseUrl)
  if (/\/models$/.test(base)) return base
  if (kind === 'anthropic' && !/\/v1$/.test(base)) return `${base}/v1/models`
  return `${base}/models`
}

/**
 * Build the message array to send.
 *
 * The store persists messages to localStorage synchronously as they are added,
 * which means the just-typed turn is already in `stored` by the time we get
 * here. Appending `current` unconditionally — as this used to — sent every
 * user turn to the model twice, along with the empty assistant placeholder
 * that the UI adds to render the streaming bubble.
 */
export function buildMessages(stored, current, { systemPrompt } = {}) {
  const history = (stored || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !m.isStreaming)
    .map((m) => ({ role: m.role, content: String(m.content || '').trim() }))
    .filter((m) => m.content.length > 0)

  const text = String(current || '').trim()
  const last = history[history.length - 1]
  const alreadyPresent = last && last.role === 'user' && last.content === text

  if (text && !alreadyPresent) history.push({ role: 'user', content: text })

  const prompt = String(systemPrompt || '').trim()
  return prompt ? [{ role: 'system', content: prompt }, ...history] : history
}

/** Assemble the streaming chat request for a provider. */
export function buildChatRequest({ provider, model, messages, maxTokens = 2048, systemPrompt }) {
  const kind = detectProviderKind(provider)
  const url = chatCompletionsUrl(provider.baseUrl, kind)

  if (kind === 'anthropic') {
    const [maybeSystem, ...rest] = messages
    const hasSystem = maybeSystem?.role === 'system'
    return {
      kind,
      url,
      headers: {
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01',
        // Without this header Anthropic rejects browser origins outright.
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: {
        model: model || 'claude-sonnet-4-20250514',
        messages: hasSystem ? rest : messages,
        ...(hasSystem ? { system: maybeSystem.content } : {}),
        max_tokens: maxTokens,
        stream: true,
      },
    }
  }

  return {
    kind,
    url,
    headers: {
      Authorization: `Bearer ${provider.apiKey || ''}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      stream: true,
    },
  }
}

/**
 * Pull the useful parts out of one streamed JSON payload.
 *
 * `reasoning` is kept separate from `content` because reasoning-heavy open
 * models (DeepSeek-R1, QwQ and friends — the sort of thing you reach for on a
 * free endpoint) put their chain of thought in a different field. Merging it
 * into the answer means the synthesiser reads the model's thinking aloud.
 *
 * @returns {{content: string, reasoning: string, finished: boolean}}
 */
export function extractDelta(json, kind = 'openai') {
  if (!json || typeof json !== 'object') {
    return { content: '', reasoning: '', finished: false }
  }

  if (kind === 'anthropic') {
    let content = ''
    let reasoning = ''
    if (json.type === 'content_block_delta') {
      // The delta is self-describing, so there's no need to track which block
      // is open — which is what the previous version got wrong, filing every
      // text_delta under "thinking" and emitting no answer at all.
      if (json.delta?.type === 'text_delta') content = json.delta.text || ''
      else if (json.delta?.type === 'thinking_delta') reasoning = json.delta.thinking || ''
    }
    return {
      content,
      reasoning,
      finished: json.type === 'message_stop',
    }
  }

  const choice = json.choices?.[0]
  const delta = choice?.delta || {}

  let content = delta.content
  // A few gateways ignore `stream: true` and answer with a whole message.
  if (content == null) content = choice?.message?.content
  if (content == null) content = choice?.text
  if (Array.isArray(content)) {
    content = content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('')
  }

  const reasoning = delta.reasoning_content ?? delta.reasoning ?? ''

  return {
    content: typeof content === 'string' ? content : '',
    reasoning: typeof reasoning === 'string' ? reasoning : '',
    finished: Boolean(choice?.finish_reason),
  }
}

/** Normalise the many shapes of a `/models` response. */
export function parseModelList(data) {
  const raw = Array.isArray(data) ? data : data?.data || data?.models || []
  if (!Array.isArray(raw)) return []

  return raw
    .map((m) => (typeof m === 'string' ? { id: m } : m))
    .filter((m) => m && typeof m === 'object' && (m.id || m.name))
    .map((m) => ({
      id: String(m.id || m.name),
      name: String(m.name || m.id),
      capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
    }))
}

/** Turn an error response body into one actionable sentence. */
export function describeHttpError(status, bodyText) {
  let detail = ''
  try {
    const parsed = JSON.parse(bodyText)
    detail =
      parsed?.error?.message ||
      (typeof parsed?.error === 'string' ? parsed.error : '') ||
      parsed?.message ||
      parsed?.detail ||
      ''
  } catch {
    // An HTML error page is noise, not detail.
    const text = String(bodyText || '').trim()
    if (text && !/^\s*</.test(text)) detail = text.slice(0, 300)
  }

  const hint =
    status === 401 || status === 403
      ? 'The API key was rejected.'
      : status === 404
        ? 'Endpoint not found — check the base URL includes the version path (e.g. https://…/v1) and that the model exists.'
        : status === 429
          ? 'Rate limited by the provider. Wait a moment and retry.'
          : status === 400
            ? 'The provider rejected the request — usually an unknown model name.'
            : status >= 500
              ? 'The provider had a server error.'
              : ''

  return [`HTTP ${status}`, hint, detail].filter(Boolean).join(' — ')
}

/**
 * Explain a `fetch` rejection. In a browser-only app this is nearly always
 * CORS rather than an outage, but the browser deliberately tells us nothing,
 * so the message has to cover the likely causes.
 */
export function describeNetworkError(error, url) {
  if (error?.name === 'AbortError') return ''

  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  })()

  return (
    `Could not reach ${host}. The demo calls the provider straight from your ` +
    'browser, so this is usually CORS: the endpoint has to send ' +
    'Access-Control-Allow-Origin. Check the base URL, or use a provider that ' +
    'permits browser requests.'
  )
}
