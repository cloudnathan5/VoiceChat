// ===================================================================
// VoiceChat Static Demo — runs fully in the browser, no backend needed
// ===================================================================

console.log('[VoiceChat] PATCHING FETCH');

// ─── 1. Patch fetch to intercept all API calls ──────────────────────────
const _origFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init && init.method) || 'GET';
  console.log('[VoiceChat] FETCH:', method, url);

  // ── Providers ──
  if (url === '/api/providers' && method === 'GET') {
    return new Response(JSON.stringify(_providers()), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url === '/api/providers' && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body) : {};
    const p = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: body.name || 'New Provider',
      baseUrl: body.baseUrl || '',
      apiKey: body.apiKey || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const providers = _providers();
    providers.push(p);
    _providers(providers);
    return new Response(JSON.stringify(p), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.match(/^\/api\/providers\/([^/]+)$/)) {
    const id = url.match(/^\/api\/providers\/([^/]+)$/)[1];
    if (method === 'DELETE') {
      _providers(_providers().filter(p => p.id !== id));
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  if (url.match(/^\/api\/providers\/([^/]+)\/models$/)) {
    const id = url.match(/^\/api\/providers\/([^/]+)\/models$/)[1];
    const provider = _providers().find(p => p.id === id);
    if (provider) {
      try {
        let modelsUrl = provider.baseUrl + '/models';
        const isAnthropic = provider.name.toLowerCase().includes('anthropic');
        const headers = isAnthropic
          ? { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }
          : { 'Authorization': 'Bearer ' + provider.apiKey };
        const res = await _origFetch(modelsUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          const models = (data.data || data).map(m => ({
            id: m.id,
            name: m.name || m.id,
            capabilities: m.capabilities || []
          }));
          return new Response(JSON.stringify(models), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {
        console.warn('Failed to fetch models:', e);
      }
    }
    return new Response(JSON.stringify([
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
    ]), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── Threads ──
  if (url === '/api/threads' && method === 'GET') {
    return new Response(JSON.stringify(_threads()), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url === '/api/threads' && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body) : {};
    const t = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: body.title || 'New Conversation',
      providerId: body.providerId || null,
      providerName: null,
      selected_provider_id: body.selectedProviderId || body.providerId || null,
      selected_provider_name: '',
      selected_model_id: body.selectedModelId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const threads = _threads();
    threads.unshift(t);
    _threads(threads);
    return new Response(JSON.stringify(t), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.match(/^\/api\/threads\/([^/]+)$/)) {
    const id = url.match(/^\/api\/threads\/([^/]+)$/)[1];
    if (method === 'DELETE') {
      _threads(_threads().filter(t => t.id !== id));
      const allMsgs = _messages();
      for (const key in allMsgs) {
        if (key.startsWith(id + '_')) {
          delete allMsgs[key];
        }
      }
      _messages(allMsgs);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (method === 'PUT') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const threads = _threads();
      const idx = threads.findIndex(t => t.id === id);
      if (idx >= 0) {
        threads[idx] = {
          ...threads[idx],
          title: body.title || threads[idx].title,
          selected_provider_id: body.selectedProviderId || threads[idx].selected_provider_id,
          selected_model_id: body.selectedModelId || threads[idx].selected_model_id,
          updatedAt: new Date().toISOString()
        };
        _threads(threads);
        return new Response(JSON.stringify(threads[idx]), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
  if (url.match(/^\/api\/threads\/([^/]+)\/messages$/)) {
    const threadId = url.match(/^\/api\/threads\/([^/]+)\/messages$/)[1];
    const msgs = _messages()[threadId] || [];
    return new Response(JSON.stringify(msgs), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── Messages ──
  if (url.match(/^\/api\/messages$/) && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body) : {};
    const msgs = _messages();
    const tid = body.threadId;
    if (!msgs[tid]) msgs[tid] = [];
    msgs[tid].push(body);
    _messages(msgs);
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.match(/^\/api\/messages\/([^/]+)$/)) {
    const id = url.match(/^\/api\/messages\/([^/]+)$/)[1];
    if (method === 'PUT') {
      const body = init?.body ? JSON.parse(init.body) : {};
      const msgs = _messages();
      for (const tid in msgs) {
        const idx = msgs[tid].findIndex(m => m.id === id);
        if (idx >= 0) {
          msgs[tid][idx] = { ...msgs[tid][idx], ...body };
          _messages(msgs);
          return new Response(JSON.stringify(msgs[tid][idx]), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }

  // ── TTS (skip) ──
  if (url.match(/^\/api\/tts/)) {
    return new Response(JSON.stringify({}), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── Health ──
  if (url === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', mode: 'static' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fall through to real fetch
  return _origFetch(input, init);
};

// ─── 2. LocalStorage helpers ────────────────────────────────────────────
const _providers = (() => {
  let cache = null;
  return (list) => {
    if (list !== undefined) {
      cache = list;
      try { localStorage.setItem('vc_providers', JSON.stringify(list)); } catch(e) { console.error('[VoiceChat] localStorage.setItem failed:', e); }
    }
    if (cache === null) {
      try { cache = JSON.parse(localStorage.getItem('vc_providers')) || []; }
      catch { cache = []; }
    }
    return cache;
  };
})();
const _threads = (() => {
  let cache = null;
  return (list) => {
    if (list !== undefined) { 
      cache = list; 
        try { localStorage.setItem('vc_threads', JSON.stringify(list)); } catch(e) { console.error('[VoiceChat] localStorage.setItem failed:', e); }
    }
    if (cache === null) {
      try { cache = JSON.parse(localStorage.getItem('vc_threads')) || []; } catch { cache = []; }
    }
    return cache;
  };
})();
const _messages = (() => {
  let cache = null;
  return (map) => {
    if (map !== undefined) { cache = map; localStorage.setItem('vc_messages', JSON.stringify(map)); }
    if (cache === null) {
      try { cache = JSON.parse(localStorage.getItem('vc_messages')) || {}; }
      catch { cache = {}; }
    }
    return cache;
  };
})();

// ─── 3. Replace socket.io with real SSE client ──────────────────────────
const _origIO = window.io;
window.io = function(url, opts) {
  const socket = {
    _callbacks: {},
    _connected: false,
    _currentThread: null,
    _abortController: null,

    on(event, cb) {
      this._callbacks[event] = cb;
      return this;
    },
    emit(event, data) {
      if (event === 'join_thread') {
        this._currentThread = data.threadId;
      }
      if (event === 'start-stream') {
        this._startStream(data);
      }
      if (event === 'abort') {
        this._abort();
      }
      return this;
    },
    disconnect() {
      this._abort();
      return this;
    },

    _startStream(data) {
      this._abort();
      this._abortController = new AbortController();

      const { threadId, content, role, providerId, modelId } = data;

      const provider = _providers().find(p => p.id === providerId);
      if (!provider) {
        this._emit('stream_error', { error: 'No provider configured' });
        this._emit('complete', {});
        return;
      }

      const allMsgs = _messages();
      const threadMsgs = allMsgs[threadId] || [];
      const conversationHistory = threadMsgs
        .filter(m => m.role !== 'assistant' || m.id !== data.id)
        .map(m => ({ role: m.role, content: m.content }));

      const isAnthropic = provider.name.toLowerCase().includes('anthropic');
      const isNvidia = provider.name.toLowerCase().includes('nvidia');

      let endpoint = '/chat/completions';
      let headers = {
        'Authorization': 'Bearer ' + provider.apiKey,
        'Content-Type': 'application/json'
      };
      let body = {
        model: modelId || 'gpt-3.5-turbo',
        messages: [...conversationHistory, { role: 'user', content: content }],
        max_tokens: 4000,
        stream: true
      };

      if (isAnthropic) {
        endpoint = '/v1/messages';
        headers = {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        };
        body = {
          model: modelId || 'claude-sonnet-4-20250514',
          messages: [...conversationHistory, { role: 'user', content: content }],
          max_tokens: 4000,
          stream: true
        };
      }

      const baseUrl = provider.baseUrl.replace(/\/+$/, '');
      const fullUrl = baseUrl + endpoint;

      fetch(fullUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: this._abortController.signal
      }).then(async (response) => {
        if (!response.ok) {
          const errText = await response.text();
          this._emit('stream_error', { error: `${response.status}: ${errText}` });
          this._emit('complete', {});
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let thinkingContent = '';
        let buffer = '';
        let inThinking = false;
        const isAnthropicStream = isAnthropic;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              if (isAnthropicStream) {
                try {
                  const json = JSON.parse(trimmed);
                  if (json.type === 'content_block_start') {
                    inThinking = json.content_block?.type === 'thinking';
                  }
                  if (json.type === 'content_block_delta') {
                    if (json.delta?.type === 'input_json_delta') {
                      try {
                        const parsed = JSON.parse(json.delta.partial_json);
                        if (parsed.content) thinkingContent += parsed.content;
                      } catch {}
                    } else if (json.delta?.type === 'text_delta') {
                      thinkingContent += json.delta.text;
                    }
                  }
                } catch {}
              } else {
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  if (dataStr === '[DONE]') break;
                  try {
                    const json = JSON.parse(dataStr);
                    const delta = json.choices?.[0]?.delta;
                    if (delta?.content) {
                      fullContent += delta.content;
                      this._emit('token', { content: delta.content });
                      this._emit('quick_token', { content: delta.content });
                    }
                  } catch {}
                }
              }
            }
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            this._emit('stream_error', { error: e.message });
          }
        }

        if (thinkingContent) {
          this._emit('thinking', { content: thinkingContent });
        }

        this._emit('complete', { content: fullContent });
        this._emit('stream_complete', {});
      }).catch((e) => {
        if (e.name !== 'AbortError') {
          this._emit('stream_error', { error: e.message });
        }
      });
    },

    _abort() {
      if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
      }
    },

    _emit(event, data) {
      if (this._callbacks[event]) {
        this._callbacks[event](data);
      }
    }
  };

  setTimeout(() => {
    socket._connected = true;
    if (socket._callbacks['connect']) {
      socket._callbacks['connect']();
    }
  }, 0);

  return socket;
};

console.log('[VoiceChat] Static demo mode — running in browser');
