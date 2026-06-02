// Mock socket.io for static demo mode
// This replaces socket.io-client in the browser-only demo
// It connects to the real AI provider API via fetch/SSE instead of a Socket.IO server

let _socketId = 0;
let _sockets = [];

function _createSocket() {
  const id = _socketId++;
  const socket = {
    _callbacks: {},
    _currentThread: null,
    _abortController: null,
    connected: false,

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
      const providers = JSON.parse(localStorage.getItem('vc_providers') || '[]');
      const provider = providers.find(p => p.id === providerId);
      if (!provider) {
        this._emit('stream_error', { error: 'No provider configured' });
        this._emit('complete', {});
        return;
      }

      const allMsgs = JSON.parse(localStorage.getItem('vc_messages') || '{}');
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
        let buffer = '';
        let inThinking = false;
        let thinkingContent = '';
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
    socket.connected = true;
    if (socket._callbacks['connect']) {
      socket._callbacks['connect']();
    }
  }, 0);

  return socket;
}

function io(url, opts) {
  const socket = _createSocket();
  _sockets.push(socket);
  return socket;
}

io.io = io;
io.connect = io;

export default io;
