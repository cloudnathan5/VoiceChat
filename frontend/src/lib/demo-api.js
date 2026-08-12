/**
 * The backend, reimplemented in the browser.
 *
 * The demo is a static page: there is no Express server and no SQLite. This
 * intercepts the `/api/*` calls the app already makes and answers them from
 * localStorage, so the same React code runs hosted and self-hosted. Anything
 * that isn't an `/api/*` path — notably the streaming call to the provider
 * itself — falls through to the real `fetch`.
 *
 * This used to live in `demo/static-demo.js`, loaded by a hand-written
 * `<script>` tag that every `vite build` deleted and someone had to add back.
 * Importing it from `main.jsx` keeps it in the bundle where the build can't
 * lose it.
 */

import { modelsUrl, detectProviderKind, parseModelList, describeHttpError, describeNetworkError } from './provider.js'

const KEYS = {
  providers: 'vc_providers',
  threads: 'vc_threads',
  messages: 'vc_messages',
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    // Quota exhausted, or storage blocked in a private window.
    console.error(`[demo] could not persist ${key}:`, error)
    return false
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const newId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/** Fetch the provider's model list, or explain why we couldn't. */
async function fetchModels(provider, realFetch) {
  if (!provider.baseUrl) {
    return json({ error: 'This provider has no base URL set.' }, 400)
  }

  const kind = detectProviderKind(provider)
  const url = modelsUrl(provider.baseUrl, kind)
  const headers =
    kind === 'anthropic'
      ? {
          'x-api-key': provider.apiKey || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
      : { Authorization: `Bearer ${provider.apiKey || ''}` }

  let response
  try {
    response = await realFetch(url, { headers })
  } catch (error) {
    return json({ error: describeNetworkError(error, url) }, 502)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return json({ error: describeHttpError(response.status, text) }, 502)
  }

  const data = await response.json().catch(() => null)
  const models = parseModelList(data)

  // Returning a plausible-looking stub list here — as this used to, with a
  // hardcoded GPT-4o — just moves the failure to the next request, where it
  // shows up as a confusing "model not found" from the provider.
  if (models.length === 0) {
    return json({ error: 'The provider returned no models for this key.' }, 502)
  }

  return json(models)
}

/** Install the interceptor. Safe to call more than once. */
export function installDemoApi() {
  if (typeof window === 'undefined' || window.__voicechatDemoApi) return
  window.__voicechatDemoApi = true

  const realFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()

    if (!url.startsWith('/api/')) return realFetch(input, init)

    const body = (() => {
      try {
        return init?.body ? JSON.parse(init.body) : {}
      } catch {
        return {}
      }
    })()

    // ── Providers ──
    if (url === '/api/providers') {
      if (method === 'GET') return json(load(KEYS.providers, []))
      if (method === 'POST') {
        const provider = {
          id: newId('p'),
          name: body.name || 'New Provider',
          baseUrl: body.baseUrl || '',
          apiKey: body.apiKey || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        const providers = load(KEYS.providers, [])
        providers.push(provider)
        if (!save(KEYS.providers, providers)) {
          return json({ error: 'Could not save the provider — browser storage is full or blocked.' }, 507)
        }
        return json(provider)
      }
    }

    const providerMatch = url.match(/^\/api\/providers\/([^/]+)$/)
    if (providerMatch) {
      const id = providerMatch[1]

      if (method === 'DELETE') {
        save(KEYS.providers, load(KEYS.providers, []).filter((p) => p.id !== id))
        return json({ success: true })
      }

      if (method === 'PUT') {
        const providers = load(KEYS.providers, [])
        const index = providers.findIndex((p) => p.id === id)
        if (index === -1) return json({ error: 'Provider not found.' }, 404)

        providers[index] = {
          ...providers[index],
          name: body.name ?? providers[index].name,
          baseUrl: body.baseUrl ?? providers[index].baseUrl,
          // The edit form is never handed the stored key, so an empty field
          // means "unchanged" rather than "clear it". Without this, opening
          // the form and saving a renamed provider would silently drop the key.
          apiKey: body.apiKey ? body.apiKey : providers[index].apiKey,
          updatedAt: new Date().toISOString(),
        }

        if (!save(KEYS.providers, providers)) {
          return json({ error: 'Could not save the provider — browser storage is full or blocked.' }, 507)
        }
        return json(providers[index])
      }
    }

    const modelsMatch = url.match(/^\/api\/providers\/([^/]+)\/models$/)
    if (modelsMatch) {
      const provider = load(KEYS.providers, []).find((p) => p.id === modelsMatch[1])
      if (!provider) return json({ error: 'Provider not found.' }, 404)
      return fetchModels(provider, realFetch)
    }

    // ── Threads ──
    if (url === '/api/threads') {
      if (method === 'GET') return json(load(KEYS.threads, []))
      if (method === 'POST') {
        const thread = {
          id: newId('t'),
          title: body.title || 'New Conversation',
          providerId: body.providerId || null,
          providerName: null,
          selected_provider_id: body.selectedProviderId || body.providerId || null,
          selected_provider_name: '',
          selected_model_id: body.selectedModelId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        const threads = load(KEYS.threads, [])
        threads.unshift(thread)
        save(KEYS.threads, threads)
        return json(thread)
      }
    }

    const threadMatch = url.match(/^\/api\/threads\/([^/]+)$/)
    if (threadMatch) {
      const id = threadMatch[1]
      if (method === 'DELETE') {
        save(KEYS.threads, load(KEYS.threads, []).filter((t) => t.id !== id))
        const messages = load(KEYS.messages, {})
        delete messages[id]
        save(KEYS.messages, messages)
        return json({ success: true })
      }
      if (method === 'PUT') {
        const threads = load(KEYS.threads, [])
        const index = threads.findIndex((t) => t.id === id)
        if (index < 0) return json({ error: 'Thread not found.' }, 404)
        threads[index] = {
          ...threads[index],
          title: body.title || threads[index].title,
          // `??` not `||`: clearing a selection sends '', which `||` would
          // discard, leaving the old model silently selected.
          selected_provider_id: body.selectedProviderId ?? threads[index].selected_provider_id,
          selected_model_id: body.selectedModelId ?? threads[index].selected_model_id,
          updatedAt: new Date().toISOString(),
        }
        save(KEYS.threads, threads)
        return json(threads[index])
      }
    }

    const threadMessagesMatch = url.match(/^\/api\/threads\/([^/]+)\/messages$/)
    if (threadMessagesMatch) {
      const stored = load(KEYS.messages, {})[threadMessagesMatch[1]] || []
      // A placeholder left behind by a stream that was interrupted mid-flight
      // would otherwise reappear as an empty bubble on reload.
      return json(stored.filter((m) => !m.isStreaming))
    }

    // ── Messages ──
    if (url === '/api/messages' && method === 'POST') {
      const messages = load(KEYS.messages, {})
      const list = messages[body.threadId] || []
      list.push(body)
      messages[body.threadId] = list
      save(KEYS.messages, messages)
      return json(body)
    }

    const messageMatch = url.match(/^\/api\/messages\/([^/]+)$/)
    if (messageMatch && method === 'PUT') {
      const messages = load(KEYS.messages, {})
      for (const threadId of Object.keys(messages)) {
        const index = messages[threadId].findIndex((m) => m.id === messageMatch[1])
        if (index >= 0) {
          messages[threadId][index] = { ...messages[threadId][index], ...body }
          save(KEYS.messages, messages)
          return json(messages[threadId][index])
        }
      }
      return json({ error: 'Message not found.' }, 404)
    }

    if (url === '/api/health') return json({ status: 'ok', mode: 'static' })

    return json({ error: `No demo handler for ${method} ${url}` }, 404)
  }
}

export default installDemoApi
