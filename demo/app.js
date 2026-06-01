// VoiceChat Demo — static, no server required
// Uses only browser APIs: Web Speech API + SSE for streaming

// ─── State ───────────────────────────────────────────────────────────────────

let threads = []
let activeThread = null
let messages = {}
let darkMode = true
let ttsEnabled = false
let ttsMuted = false
let selectedProvider = 'demo'
let selectedModel = 'gpt-4o'
let isStreaming = false
let isLoading = false

// ─── Provider config ─────────────────────────────────────────────────────────

const PROVIDERS = [{
  id: 'demo',
  name: 'Demo (OpenAI-compatible)',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  models: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
  ]
}]

function getProvider() {
  return PROVIDERS.find(p => p.id === selectedProvider)
}

// ─── SSE streaming (replaces socket.io) ─────────────────────────────────────

async function streamResponse(threadId, userMessage, onToken, onComplete, onError) {
  const provider = getProvider()
  const threadMessages = messages[threadId] || []
  const conversation = [...threadMessages, userMessage]

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: conversation.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 2000,
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.text()
    onError(err)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6))
          const content = data.choices?.[0]?.delta?.content || ''
          if (content) {
            fullContent += content
            onToken(content, fullContent)
          }
        } catch {}
      }
    }
  }

  onComplete(fullContent)
}

// ─── TTS (browser only) ─────────────────────────────────────────────────────

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
let currentUtterance = null
let isSpeaking = false

function speak(text) {
  if (!synth || !text.trim() || ttsMuted) return
  stop()

  const sentences = text.split(/(?<=[.!?])\s+/)
  if (sentences.length === 0) return

  let index = 0
  const speakNext = () => {
    if (index >= sentences.length || ttsMuted) {
      isSpeaking = false
      return
    }

    currentUtterance = new SpeechSynthesisUtterance(sentences[index])
    currentUtterance.rate = 1.1
    currentUtterance.pitch = 1.0

    currentUtterance.onend = () => {
      index++
      setTimeout(speakNext, 50)
    }

    currentUtterance.onerror = () => {
      isSpeaking = false
    }

    synth.speak(currentUtterance)
    isSpeaking = true
  }

  speakNext()
}

function stopTts() {
  if (synth) synth.cancel()
  currentUtterance = null
  isSpeaking = false
}

// ─── Speech Recognition ─────────────────────────────────────────────────────

let recognition = null
let recognitionRef = null
let isListening = false
let isRecording = false
let transcript = ''
let audioLevel = 0
let voiceMode = 'continuous'
let isInterrupting = false
let userStartedSpeaking = false
let userStartedSpeakingRef = false

function setupSpeechRecognition(onFinalTranscript, onInterim) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) return null

  recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'

  recognition.onresult = (event) => {
    let finalTranscript = ''
    let interimTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        finalTranscript += t + ' '
        if (onFinalTranscript) onFinalTranscript(finalTranscript.trim())
      } else {
        interimTranscript += t
        if (t.trim()) onInterim(t.trim())
      }
    }

    const live = finalTranscript + interimTranscript
    transcript = live.trim()
    onFinalTranscript && onFinalTranscript(finalTranscript.trim())
  }

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error)
    if (event.error === 'not-allowed') {
      isListening = false
      isRecording = false
    }
  }

  recognition.onend = () => {
    if (isListening || isRecording) {
      try { recognition.start() } catch (e) {}
    }
  }

  return recognition
}

async function startListening(onTranscript) {
  try {
    const rec = setupSpeechRecognition(
      (finalText) => {
        if (onTranscript) onTranscript(finalText)
      },
      (interimText) => {
        if (interimText.trim()) userStartedSpeakingRef = true
      }
    )
    if (!rec) throw new Error('SpeechRecognition not supported')
    recognitionRef = rec
    rec.start()
    isListening = true
    transcript = ''
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

function stopListening() {
  if (recognitionRef) {
    recognitionRef.stop()
    recognitionRef = null
  }
  isListening = false
  transcript = ''
}

// ─── Message actions ─────────────────────────────────────────────────────────

function addMessage(threadId, message) {
  if (!messages[threadId]) messages[threadId] = []
  messages[threadId].push(message)
}

function getMessages(threadId) {
  return messages[threadId] || []
}

// ─── React-like rendering (vanilla DOM) ──────────────────────────────────────

function h(tag, attrs, ...children) {
  const el = document.createElement(tag)
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'dangerouslySetInnerHTML') el.innerHTML = v.__html
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'ref' && typeof v === 'function') v(el)
      else el.setAttribute(k, v)
    })
  }
  children.flat().forEach(c => {
    if (c == null) return
    if (typeof c === 'string' || typeof c === 'number') el.append(String(c))
    else if (c instanceof Node) el.appendChild(c)
  })
  return el
}

function render() {
  const root = document.getElementById('root')
  root.innerHTML = ''
  root.appendChild(renderApp())
}

function renderApp() {
  return h('div', {
    className: `flex h-screen font-inter ${darkMode ? 'bg-gray-950' : 'bg-white'}`
  },
    renderSidebar(),
    h('div', { className: 'flex-1 flex flex-col min-w-0' },
      activeThread ? renderChatArea() : renderEmptyState()
    )
  )
}

function renderSidebar() {
  return h('div', {
    className: `w-80 border-r flex flex-col transition-all duration-300 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`
  },
    h('div', {
      className: `p-6 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`
    },
      h('div', { className: 'flex items-center justify-between mb-4' },
        h('h1', { className: `text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}` }, 'VoiceChat'),
        h('div', { className: 'flex items-center gap-2' },
          h('button', {
            className: `p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`,
            onClick: () => { darkMode = !darkMode; render() },
            title: darkMode ? 'Switch to light mode' : 'Switch to dark mode'
          }, darkMode ? renderSunIcon() : renderMoonIcon())
        )
      ),
      h('button', {
        className: 'w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium',
        onClick: handleNewThread
      },
        h('span', null, '+'),
        'New Chat'
      )
    ),
    h('div', { className: 'flex-1 overflow-y-auto scrollbar-hide' },
      threads.length === 0
        ? h('div', { className: `p-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}` },
            'No conversations yet'
          )
        : threads.map(t =>
            h('div', {
              key: t.id,
              className: `p-4 border-b cursor-pointer transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'} ${activeThread?.id === t.id ? (darkMode ? 'bg-gray-800 border-l-4 border-blue-500' : 'bg-blue-50 border-l-4 border-blue-500') : (darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}`,
              onClick: () => { activeThread = t; render() }
            },
              h('div', { className: 'flex items-center justify-between' },
                h('div', { className: 'flex-1 min-w-0' },
                  h('div', { className: `font-medium truncate text-sm ${darkMode ? 'text-white' : 'text-gray-900'}` }, t.title),
                  t.providerName && h('div', { className: `text-xs truncate mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}` }, t.providerName),
                  h('div', { className: `text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}` },
                    t.updatedAt && !isNaN(new Date(t.updatedAt)) ? new Date(t.updatedAt).toLocaleDateString() : 'Just now'
                  )
                ),
                h('button', {
                  className: `p-1 rounded transition-colors ${darkMode ? 'hover:bg-red-900 text-red-400' : 'hover:bg-red-100 text-red-500'}`,
                  onClick: (e) => { e.stopPropagation(); handleDeleteThread(t.id) }
                }, renderTrashIcon())
              )
            )
          )
    )
  )
}

function renderEmptyState() {
  return h('div', {
    className: `flex-1 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`
  },
    h('div', { className: 'text-center max-w-md px-6' },
      h('div', {
        className: `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-800' : 'bg-blue-100'}`
      },
        h('svg', { className: `${darkMode ? 'text-blue-400' : 'text-blue-600'}`, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 32, height: 32 },
          h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
        )
      ),
      h('h1', { className: `text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}` }, 'VoiceChat'),
      h('p', { className: `mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}` },
        'Select a conversation or create a new one to start chatting with AI'
      ),
      h('button', {
        className: 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors',
        onClick: handleNewThread
      }, 'Create New Chat')
    )
  )
}

function renderChatArea() {
  const threadMessages = getMessages(activeThread.id) || []
  const isVoiceActiveState = (isListening || isRecording)

  return h('div', {
    className: `flex-1 flex flex-col min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-white'}`
  },
    // Header
    h('div', {
      className: `border-b px-6 py-4 flex-shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`
    },
      h('div', { className: 'flex items-center justify-between' },
        h('div', null,
          h('h2', { className: `text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}` }, activeThread.title),
          activeThread.providerName && h('p', { className: `${darkMode ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}` }, activeThread.providerName)
        ),
        h('div', { className: 'flex items-center gap-3' },
          isSpeaking && h('div', {
            className: `flex items-center gap-2 px-3 py-1.5 rounded-full ${darkMode ? 'bg-cyan-600/20' : 'bg-cyan-100'}`
          },
            h('div', { className: 'flex space-x-1' }, [1,2,3].map(i =>
              h('div', {
                key: i,
                className: `w-1 rounded-full animate-pulse ${darkMode ? 'bg-cyan-400' : 'bg-cyan-600'}`,
                style: { height: `${4 + i * 3}px` }
              })
            )),
            h('span', { className: `text-xs ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}` }, 'Speaking...'),
            h('button', {
              className: `p-1 rounded hover:bg-cyan-500/30 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`,
              onClick: stopTts
            }, renderVolumeXIcon())
          ),
          isVoiceActiveState && h('div', {
            className: `flex items-center gap-3 px-3 py-2 rounded-full ${darkMode ? 'bg-orange-600/20' : 'bg-orange-100'}`
          },
            h('div', { className: 'flex items-center gap-2' },
              h('div', { className: 'w-2 h-2 bg-red-500 rounded-full animate-pulse' }),
              h('span', { className: `text-xs font-medium ${darkMode ? 'text-orange-400' : 'text-orange-600'}` },
                isRecording ? 'Recording...' : 'Listening...'
              )
            ),
            h('button', {
              className: `p-1 rounded-full hover:bg-red-500/30 ${darkMode ? 'text-red-400' : 'text-red-600'}`,
              onClick: toggleVoiceChat
            }, renderStopCircleIcon())
          )
        )
      )
    ),

    // Messages
    h('div', { className: 'flex-1 min-h-0 overflow-y-auto scrollbar-hide' },
      h('div', { className: `px-6 py-4 min-h-full ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}` },
        h('div', { className: 'max-w-4xl mx-auto space-y-4' },
          threadMessages.map(m => renderMessageBubble(m)),
          isStreaming && h('div', { className: 'flex justify-start' },
            h('div', { className: `max-w-[80%] rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}` },
              h('div', { className: 'flex items-center space-x-2' },
                h('div', { className: 'flex space-x-1' }, [1,2,3].map(i =>
                  h('div', {
                    key: i,
                    className: 'w-1 bg-gray-400 rounded-full animate-pulse',
                    style: { height: `${Math.random() * 8 + 4}px`, animationDelay: `${i * 0.1}s` }
                  })
                )),
                h('span', { className: `text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}` }, 'Thinking...')
              )
            )
          )
        )
      )
    ),

    // Input area
    h('div', {
      className: `border-t px-6 py-4 flex-shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`
    },
      h('div', { className: 'max-w-4xl mx-auto' },
        // Provider/Model controls
        h('div', { className: 'flex items-center gap-3 mb-3' },
          h('select', {
            className: `w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`,
            value: selectedProvider,
            onChange: (e) => { selectedProvider = e.target.value; render() }
          },
            PROVIDERS.map(p => h('option', { key: p.id, value: p.id }, p.name))
          ),
          h('select', {
            className: `w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`,
            value: selectedModel,
            onChange: (e) => { selectedModel = e.target.value; render() }
          },
            getProvider()?.models?.map(m => h('option', { key: m.id, value: m.id }, m.name)) || []
          ),
          h('button', {
            className: `p-2 rounded-lg transition-colors ${darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'}`,
            onClick: () => {
              ttsEnabled = !ttsEnabled
              render()
            },
            title: ttsEnabled ? 'Disable TTS' : 'Enable TTS'
          },
            ttsEnabled ? renderVolume2Icon() : renderVolumeXIcon()
          ),
          h('button', {
            className: `p-2 rounded-lg transition-colors ${darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'}`,
            onClick: () => {
              ttsMuted = !ttsMuted
              render()
            },
            title: ttsMuted ? 'Unmute TTS' : 'Mute TTS'
          },
            ttsMuted ? renderVolumeXIcon() : renderVolume2Icon()
          ),
          h('button', {
            className: `p-2 rounded-lg transition-colors relative ${isVoiceActiveState ? 'bg-red-500 hover:bg-red-600 text-white' : (darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300')}`,
            onClick: toggleVoiceChat,
            title: isVoiceActiveState ? 'Stop voice chat' : 'Start voice chat'
          },
            renderMicIcon(),
            isVoiceActiveState && h('span', { className: 'absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse' })
          )
        ),

        // Message input
        h('div', { className: 'flex items-end space-x-3' },
          h('textarea', {
            ref: (el) => { if (el) {
              el.value = window._inputText || ''
              el.placeholder = isVoiceActiveState ? (isRecording ? 'Speak now... (release to send)' : 'Listening...') : 'Type your message...'
              el.oninput = () => { window._inputText = el.value; render() }
              el.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }
              el.disabled = isVoiceActiveState && !isRecording
            }},
            className: `w-full border rounded-lg p-3 pr-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] max-h-[120px] transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} ${isVoiceActiveState ? (isRecording ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-red-500 ring-2 ring-red-500/20') : ''}`
          }),
          h('button', {
            className: 'p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors',
            disabled: !window._inputText?.trim() || isLoading,
            onClick: handleSendMessage
          }, renderSendIcon())
        ),

        isVoiceActiveState && h('div', { className: `mt-2 text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}` },
          voiceMode === 'push-to-talk'
            ? 'Hold mic button to record • Release to send'
            : 'Speak to send • Auto-sends after 1.5s silence'
        )
      )
    )
  )
}

function renderMessageBubble(msg) {
  const isUser = msg.role === 'user'
  return h('div', { className: `flex ${isUser ? 'justify-end' : 'justify-start'} mb-4` },
    h('div', {
      className: `max-w-[80%] rounded-lg p-4 relative ${isUser ? 'bg-blue-600 text-white' : (darkMode ? 'bg-gray-800 border border-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-900')}`
    },
      h('div', { className: 'flex items-center justify-between mb-2' },
        h('div', { className: 'flex items-center space-x-2' },
          h('div', {
            className: `w-6 h-6 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-700' : (darkMode ? 'bg-gray-700' : 'bg-gray-200')}`
          },
            h('svg', { className: 'text-white', fill: 'currentColor', viewBox: '0 0 24 24', width: 12, height: 12 },
              h('path', { d: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' })
            )
          ),
          h('span', { className: `text-sm font-medium ${isUser ? 'text-white' : (darkMode ? 'text-gray-300' : 'text-gray-700')}` }, isUser ? 'You' : 'AI')
        ),
        h('div', { className: 'flex items-center space-x-2' },
          h('button', {
            className: `p-1 rounded transition-colors ${isUser ? 'hover:bg-blue-700 text-blue-100' : (darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}`,
            onClick: () => navigator.clipboard.writeText(msg.content)
          }, renderCopyIcon()),
          h('span', { className: `text-xs ${isUser ? 'text-blue-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}` },
            new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          )
        )
      ),
      h('div', { className: 'max-w-none' },
        h('div', { className: 'text-sm leading-relaxed' },
          msg.content.split('\n').map((line, i) => h('span', { key: i }, line, i < msg.content.split('\n').length - 1 ? h('br') : null))
        )
      )
    )
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function renderMicIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 16, height: 16 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' })
  )
}

function renderSendIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 18, height: 18 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' })
  )
}

function renderCopyIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 12, height: 12 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' })
  )
}

function renderTrashIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 14, height: 14 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
  )
}

function renderStopCircleIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 16, height: 16 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z' })
  )
}

function renderVolume2Icon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 18, height: 18 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z' })
  )
}

function renderVolumeXIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 18, height: 18 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2' })
  )
}

function renderSunIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 20, height: 20 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' })
  )
}

function renderMoonIcon() {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 20, height: 20 },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' })
  )
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function handleNewThread() {
  const id = Date.now().toString()
  const thread = {
    id,
    title: `Chat ${threads.length + 1}`,
    providerName: getProvider()?.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  threads = [thread, ...threads]
  messages[id] = []
  activeThread = thread
  render()
}

function handleDeleteThread(id) {
  if (confirm('Are you sure you want to delete this thread?')) {
    threads = threads.filter(t => t.id !== id)
    delete messages[id]
    if (activeThread?.id === id) activeThread = null
    render()
  }
}

function handleSendMessage() {
  const text = window._inputText?.trim()
  if (!text || !activeThread || isLoading) return

  // Stop any ongoing speech
  stopTts()

  const userMessage = {
    id: Date.now().toString(),
    threadId: activeThread.id,
    role: 'user',
    content: text,
    createdAt: new Date().toISOString()
  }

  addMessage(activeThread.id, userMessage)
  window._inputText = ''
  isLoading = true
  isStreaming = true
  render()

  // Scroll to bottom
  setTimeout(() => {
    const container = document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = container.scrollHeight
  }, 50)

  streamResponse(
    activeThread.id,
    userMessage,
    (token, fullContent) => {
      // Update the streaming AI message in place
      const threadMessages = messages[activeThread.id]
      const aiMsg = threadMessages.find(m => m.role === 'assistant' && m.isStreaming)
      if (aiMsg) {
        aiMsg.content = fullContent
      } else {
        addMessage(activeThread.id, {
          id: (Date.now() + 1).toString(),
          threadId: activeThread.id,
          role: 'assistant',
          content: fullContent,
          createdAt: new Date().toISOString(),
          isStreaming: true
        })
      }
      render()

      // Scroll to bottom
      setTimeout(() => {
        const container = document.querySelector('.overflow-y-auto')
        if (container) container.scrollTop = container.scrollHeight
      }, 50)

      // TTS streaming
      if (ttsEnabled && !ttsMuted) {
        speak(fullContent)
      }
    },
    (fullContent) => {
      // Mark streaming as complete
      const threadMessages = messages[activeThread.id]
      const aiMsg = threadMessages.find(m => m.role === 'assistant' && m.isStreaming)
      if (aiMsg) {
        aiMsg.isStreaming = false
      }

      isLoading = false
      isStreaming = false

      // Complete TTS
      if (ttsEnabled && !ttsMuted && fullContent.trim()) {
        speak(fullContent)
      }
      render()

      // Scroll to bottom
      setTimeout(() => {
        const container = document.querySelector('.overflow-y-auto')
        if (container) container.scrollTop = container.scrollHeight
      }, 50)
    },
    (error) => {
      console.error('Stream error:', error)
      isLoading = false
      isStreaming = false
      render()
    }
  )
}

let lastSentTranscript = ''
let lastWordTime = 0

function handleVoiceAutoSend() {
  if (!isListening) {
    lastWordTime = 0
    clearTimeout(window._voiceAutoSendTimeout)
    return
  }
  if (!transcript.trim()) {
    clearTimeout(window._voiceAutoSendTimeout)
    return
  }
  if (transcript === lastSentTranscript) return

  lastWordTime = Date.now()
  clearTimeout(window._voiceAutoSendTimeout)

  window._voiceAutoSendTimeout = setTimeout(() => {
    const elapsed = Date.now() - lastWordTime
    if (elapsed >= 1500 && transcript.trim()) {
      handleSendMessage()
      lastSentTranscript = transcript
      window._inputText = ''
    }
  }, 1500)
}

function toggleVoiceChat() {
  if (isListening) {
    stopListening()
    isListening = false
  } else {
    startListening((text) => {
      window.dispatchEvent(new CustomEvent('voice-transcript', { detail: text }))
    })
    window._inputText = ''
    isListening = true
  }
  render()
}

// ─── Auto-send effect ────────────────────────────────────────────────────────

setInterval(handleVoiceAutoSend, 100)

// ─── Init ────────────────────────────────────────────────────────────────────

window._inputText = ''

render()
