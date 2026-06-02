// Mock API for static demo mode
// All data is persisted in localStorage (simulating a SQLite database)

const LS_KEYS = {
  providers: 'demo_providers',
  threads: 'demo_threads',
  messages: 'demo_messages',
  settings: 'demo_settings',
  tts_enabled_v2: 'demo_tts_enabled_v2',
  tts_muted_v2: 'demo_tts_muted_v2',
  tts_preferred_voice_v2: 'demo_tts_preferred_voice_v2',
  lastUsedProviderId: 'demo_lastUsedProviderId',
  lastUsedModelId: 'demo_lastUsedModelId',
  darkMode: 'demo_darkMode'
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ---- Provider helpers ----
function getProviders() {
  return lsGet(LS_KEYS.providers, []);
}
function saveProviders(p) { lsSet(LS_KEYS.providers, p); }

function addProvider({ name, baseUrl, apiKey }) {
  const p = { id: genId(), name, base_url: baseUrl, apiKey, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const list = getProviders();
  list.push(p);
  saveProviders(list);
  return p;
}
function deleteProvider(id) {
  saveProviders(getProviders().filter(p => p.id !== id));
}

// ---- Thread helpers ----
function getThreads() {
  return lsGet(LS_KEYS.threads, []);
}
function saveThreads(t) { lsSet(LS_KEYS.threads, t); }

function createThread(title, providerId) {
  const t = { id: genId(), title, providerId: providerId || null, providerName: null, selected_provider_id: providerId || null, selected_model_id: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const list = getThreads();
  list.unshift(t);
  saveThreads(list);
  return t;
}
function updateThread(id, title, selectedProviderId, selectedModelId) {
  const list = getThreads();
  const idx = list.findIndex(t => t.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], title, providerName: list[idx].providerName, selected_provider_id: selectedProviderId || list[idx].selected_provider_id, selected_model_id: selectedModelId || list[idx].selected_model_id, updatedAt: new Date().toISOString() };
  saveThreads(list);
  return list[idx];
}
function deleteThread(id) {
  saveThreads(getThreads().filter(t => t.id !== id));
  // Also remove messages for this thread
  const msgs = lsGet(LS_KEYS.messages, []);
  lsSet(LS_KEYS.messages, msgs.filter(m => m.threadId !== id));
}

// ---- Message helpers ----
function getMessages() {
  return lsGet(LS_KEYS.messages, []);
}
function saveMessages(m) { lsSet(LS_KEYS.messages, m); }

function addMessage(msg) {
  const list = getMessages();
  list.push(msg);
  saveMessages(list);
  return msg;
}
function updateMessage(id, updates) {
  const list = getMessages();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...updates };
  saveMessages(list);
  return list[idx];
}

// ---- TTS settings helpers ----
function getTtsSettings() {
  return lsGet(LS_KEYS.settings, { voice_provider: 'browser', preferred_voice: null, piper: { host: 'localhost', port: 5001, enabled: false, model: 'en_US-lessac-medium' } });
}
function saveTtsSettings(s) { lsSet(LS_KEYS.settings, s); }

// ---- Mock AI responses (for demo) ----
const mockResponses = [
  "That's a great question! Let me think about this for a moment...\n\nBased on my analysis, there are several key factors to consider here. First, the architecture of the system plays a crucial role in how data flows through the application.\n\nHere are some recommendations:\n1. Start with a clear requirements document\n2. Use version control from day one\n3. Write tests before implementing features\n4. Keep your dependencies up to date",

  "I'd be happy to help with that! Here's what I think about your question:\n\nThe key insight is that simplicity often leads to better results than over-engineering. When building applications, focus on:\n\n- **Clear interfaces** between components\n- **Minimal state** management\n- **Graceful degradation** when things go wrong\n\nWould you like me to elaborate on any of these points?",

  "Let me break this down for you:\n\n```javascript\nconst example = {\n  name: 'demo',\n  version: '1.0.0',\n  description: 'A static demo'\n};\n```\n\nThis is a simple example, but it demonstrates the core concept. The important thing is to keep your code readable and maintainable.",

  "That's an interesting perspective! Here are my thoughts:\n\n1. **Performance**: Always measure before optimizing\n2. **Developer experience**: Good tooling matters\n3. **User experience**: Keep it simple and intuitive\n\nI recommend starting with the basics and iterating based on feedback from real users.",

  "Great question! The answer depends on your specific use case, but here's my general guidance:\n\nFor most projects, I'd recommend starting with a simple architecture and evolving it as your needs grow. Don't over-engineer early on.\n\n*Note: This is a static demo — actual AI responses require a backend server.*"
];

let mockResponseIndex = 0;

function getMockResponse() {
  const response = mockResponses[mockResponseIndex % mockResponses.length];
  mockResponseIndex++;
  return response;
}

// ---- Mock models (since we can't fetch real models without a backend) ----
const mockModels = {
  'openai': [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ],
  'anthropic': [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-0', name: 'Claude Opus 4' },
    { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5' }
  ],
  'google': [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
  ],
  'default': [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }
  ]
};

// ---- Intercept fetch ----
const originalFetch = window.fetch;

window.fetch = async function(url, options) {
  const urlStr = url instanceof Request ? url.url : url;
  const method = (options && options.method) || 'GET';

  try {
    // --- Provider routes ---
    if (urlStr === '/api/providers' && method === 'GET') {
      return new Response(JSON.stringify(getProviders()), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/providers' && method === 'POST') {
      const body = await (options?.body ? JSON.parse(options.body) : {});
      const provider = addProvider(body);
      return new Response(JSON.stringify(provider), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/providers\/[^/]+$/) && method === 'DELETE') {
      const id = urlStr.split('/').pop();
      deleteProvider(id);
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/providers\/[^/]+\/models$/) && method === 'GET') {
      const id = urlStr.split('/').pop();
      const provider = getProviders().find(p => p.id === id);
      const name = provider ? provider.name.toLowerCase() : 'default';
      const models = mockModels[name] || mockModels['default'];
      return new Response(JSON.stringify(models), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- Thread routes ---
    if (urlStr === '/api/threads' && method === 'GET') {
      return new Response(JSON.stringify(getThreads()), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/threads' && method === 'POST') {
      const body = await (options?.body ? JSON.parse(options.body) : {});
      const thread = createThread(body.title, body.providerId || body.selectedProviderId);
      return new Response(JSON.stringify(thread), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/threads\/[^/]+$/) && method === 'DELETE') {
      const id = urlStr.split('/').pop();
      deleteThread(id);
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/threads\/[^/]+$/) && method === 'PUT') {
      const id = urlStr.split('/').pop();
      const body = await (options?.body ? JSON.parse(options.body) : {});
      const thread = updateThread(id, body.title, body.selectedProviderId, body.selectedModelId);
      return new Response(JSON.stringify(thread), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/threads\/[^/]+\/messages$/) && method === 'GET') {
      const id = urlStr.split('/').pop();
      const msgs = getMessages().filter(m => m.threadId === id);
      return new Response(JSON.stringify(msgs), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- Message routes ---
    if (urlStr.match(/^\/api\/messages$/) && method === 'POST') {
      const body = await (options?.body ? JSON.parse(options.body) : {});
      const msg = addMessage(body);
      return new Response(JSON.stringify(msg), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.match(/^\/api\/messages\/[^/]+$/) && method === 'PUT') {
      const id = urlStr.split('/').pop();
      const body = await (options?.body ? JSON.parse(options.body) : {});
      const msg = updateMessage(id, body);
      return new Response(JSON.stringify(msg || {}), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- TTS routes ---
    if (urlStr === '/api/tts/settings' && method === 'GET') {
      return new Response(JSON.stringify(getTtsSettings()), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/tts/settings' && method === 'PUT') {
      const body = await (options?.body ? JSON.parse(options.body) : {});
      saveTtsSettings({ ...getTtsSettings(), ...body });
      return new Response(JSON.stringify(getTtsSettings()), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/tts/piper/models' && method === 'GET') {
      return new Response(JSON.stringify({ models: [] }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/tts/piper/health' && method === 'GET') {
      return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/tts/synthesize' && method === 'POST') {
      return new Response(JSON.stringify({ error: 'Piper not available in demo mode' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === '/api/tts/test' && method === 'POST') {
      return new Response(JSON.stringify({ error: 'Piper not available in demo mode' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // --- Health ---
    if (urlStr === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), mode: 'demo' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- AI chat (streaming) ---
    // We don't intercept the streaming messages route directly;
    // the app sends via socket.io. We'll handle that below.
    if (urlStr.match(/^\/api\/chat/) || urlStr.match(/^\/api\/stream/)) {
      // Not used in this app — fall through
    }

    // --- Fallback: let other requests through ---
    return originalFetch.apply(this, arguments);

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// ---- Intercept socket.io connections ----
// The app uses socket.io for streaming responses.
// We'll provide a mock socket that simulates streaming.
const originalIO = window.io;
if (typeof window.io === 'function') {
  window.io = function(url, opts) {
    const socket = originalIO(url, opts);

    socket._mockCallbacks = {};

    socket.on = function(event, callback) {
      if (event === 'connect') {
        // Immediately fire connect event
        callback();
      } else {
        socket._mockCallbacks[event] = callback;
      }
      return socket;
    };

    socket.emit = function(event, data) {
      if (event === 'start-stream') {
        // Simulate streaming response
        const content = getMockResponse();
        const tokens = content.split(' ');
        let accumulated = '';
        let thinkingAccumulated = '';

        // Send thinking tokens (simulated)
        const thinkingText = "Let me think about this...";
        for (let i = 0; i < thinkingText.length; i += 3) {
          setTimeout(() => {
            thinkingAccumulated += thinkingText.slice(i, i + 3);
            if (socket._mockCallbacks['thinking']) {
              socket._mockCallbacks['thinking']({ content: thinkingText.slice(i, i + 3) });
            }
          }, i * 50);
        }

        // Send tokens
        setTimeout(() => {
          tokens.forEach((token, i) => {
            setTimeout(() => {
              accumulated += token + ' ';
              if (socket._mockCallbacks['token']) {
                socket._mockCallbacks['token']({ content: token });
              }
              if (socket._mockCallbacks['quick_token']) {
                socket._mockCallbacks['quick_token']({ content: token });
              }
            }, i * 80);
          });

          // Send complete
          setTimeout(() => {
            if (socket._mockCallbacks['complete']) {
              socket._mockCallbacks['complete']({ content: accumulated });
            }
            if (socket._mockCallbacks['stream_complete']) {
              socket._mockCallbacks['stream_complete']({});
            }
          }, tokens.length * 80 + 200);
        }, 500);
      }
      if (event === 'abort') {
        if (socket._mockCallbacks['stream_aborted']) {
          socket._mockCallbacks['stream_aborted']({});
        }
      }
    };

    socket.disconnect = function() {
      return socket;
    };

    return socket;
  };
}

console.log('[Demo] Mock API initialized — running in static demo mode');
