// VoiceChat Demo — static, no server required
// Visual clone of the main app with browser TTS only + SSE streaming

window.addEventListener('DOMContentLoaded', () => {
  if (window.tailwindConfig && window.tailwind) {
    window.tailwind.config = window.tailwindConfig
  }
})

function h(tag, attrs, ...children) {
  const el = document.createElement(tag)
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'key') return
      else el.setAttribute(k, v)
    })
  }
  children.flat().forEach(c => {
    if (c == null) return
    if (typeof c === 'string' || typeof c === 'number') el.append(String(c))
    else if (c instanceof Node) el.appendChild(c)
    else if (Array.isArray(c)) c.forEach(x => { if (x != null && x instanceof Node) el.appendChild(x) })
  })
  return el
}

function svgIcon(d, size, className) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: size || 20, height: size || 20, className: className || '' },
    h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: d || '' }))
}

const ICONS = {
  'plus': 'M12 4v16m8-8H4', 'x': 'M6 18L18 6M6 6l12 12',
  'trash-2': 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6',
  'settings': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  'message-square': 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  'send': 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  'mic': 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  'volume-2': 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
  'volume-x': 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2',
  'stop-circle': 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  'chevron-down': 'M19 9l-7 7-7-7',
  'refresh-cw': 'M23 4v6h-6M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  'radio': 'M4.9 19.1C7.7 21.9 11.9 23.3 16.1 21.9c4.2-1.4 7.3-5.3 7.9-9.7.6-4.4-1.4-8.7-5.1-10.7-1-.6-2.1-.9-3.2-.9 M12 16v-4m0 0l-2 2m2-2l2 2',
  'hand': 'M18 11V6a2 2 0 00-4 0v1M14 10V4a2 2 0 00-4 0v6m0-6v9M6 10V7a2 2 0 00-4 0v9a2 2 0 004 0v-3m10 0h.01',
  'copy': 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  'user': 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 7a4 4 0 100 8 4 4 0 000-8z',
  'sun': 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  'moon': 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  'test-tube': 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
}

function Icon(p) {
  return svgIcon(ICONS[p.name] || '', p.size || 20, p.className || '')
}

function WaveformBars(p) {
  const container = h('div', { className: 'flex items-end justify-center gap-0.5 h-10' })
  for (let i = 0; i < 24; i++) {
    const waveOffset = Math.sin((i / 24) * Math.PI * 2) * 0.5 + 0.5
    const barHeight = Math.max(4, (p.level / 128) * 40 * waveOffset + 4)
    const barClass = p.isActive ? (p.level > 20 ? 'bg-orange-500' : 'bg-red-500/50') : 'bg-gray-600'
    container.appendChild(h('div', {
      className: 'rounded-full transition-all ' + barClass,
      style: { width: '3px', height: barHeight + 'px', transitionDelay: (i / 24 * 0.3) + 's', transitionDuration: '100ms' }
    }))
  }
  return container
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  threads: [], activeThread: null, messages: {},
  providers: [{ id: 'demo', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }] }],
  darkMode: true, ttsEnabled: false, ttsMuted: false,
  selectedProvider: 'demo', selectedModel: 'gpt-4o',
  isStreaming: false, isLoading: false, isVoiceActive: false,
  isListening: false, isRecording: false, isSpeaking: false,
  voiceMode: 'continuous', transcript: '', audioLevel: 0,
  userStartedSpeaking: false, isCollapsed: false, inputText: '',
  showTtsMenu: false
}

function getMessages(threadId) { return state.messages[threadId] || [] }

// ─── SSE Streaming ──────────────────────────────────────────────────────────

async function streamResponse(threadId, userMessage, onToken, onComplete, onError) {
  const provider = state.providers.find(p => p.id === state.selectedProvider)
  if (!provider) { onError('No provider selected'); return }
  const threadMessages = getMessages(threadId)
  const conversation = [...threadMessages, userMessage]
  try {
    const response = await fetch(provider.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + provider.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: state.selectedModel, messages: conversation.map(m => ({ role: m.role, content: m.content })), max_tokens: 2000, stream: true })
    })
    if (!response.ok) { onError(await response.text()); return }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            const content = data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content
            if (content) { fullContent += content; onToken(content, fullContent) }
          } catch (e) { /* ignore */ }
        }
      }
    }
    onComplete(fullContent)
  } catch (error) { onError(error.message) }
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
let currentUtterance = null

function speak(text) {
  if (!synth || !text.trim() || state.ttsMuted) return
  stopTts()
  const sentences = text.split(/(?<=[.!?])\s+/)
  if (sentences.length === 0) return
  let index = 0
  const speakNext = () => {
    if (index >= sentences.length || state.ttsMuted) { state.isSpeaking = false; render(); return }
    currentUtterance = new SpeechSynthesisUtterance(sentences[index])
    currentUtterance.rate = 1.1; currentUtterance.pitch = 1.0
    currentUtterance.onend = () => { index++; setTimeout(speakNext, 50) }
    currentUtterance.onerror = () => { state.isSpeaking = false; render() }
    synth.speak(currentUtterance); state.isSpeaking = true; render()
  }
  speakNext()
}

function stopTts() { if (synth) synth.cancel()
  currentUtterance = null; state.isSpeaking = false; render() }

// ─── Speech Recognition ─────────────────────────────────────────────────────

let recognition = null, recognitionRef = null

function setupSpeechRecognition(onFinalTranscript, onInterim) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  recognition = new SR()
  recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US'
  recognition.onresult = (event) => {
    let finalTranscript = '', interimTranscript = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript
      if (event.results[i].isFinal) { finalTranscript += t + ' '
        if (onFinalTranscript) onFinalTranscript(finalTranscript.trim()) }
      else { interimTranscript += t; if (t.trim()) onInterim && onInterim(t.trim()) }
    }
    state.transcript = (finalTranscript + interimTranscript).trim(); render()
  }
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error)
    if (event.error === 'not-allowed') { state.isListening = false; state.isRecording = false; render() }
  }
  recognition.onend = () => { if (state.isListening || state.isRecording) { try { recognition.start() } catch (e) {} } }
  return recognition
}

async function startListening(onTranscript) {
  try {
    const rec = setupSpeechRecognition(
      (finalText) => { if (onTranscript) onTranscript(finalText) },
      (interimText) => { if (interimText.trim()) state.userStartedSpeaking = true }
    )
    if (!rec) throw new Error('SpeechRecognition not supported')
    recognitionRef = rec; rec.start(); state.isListening = true; state.transcript = ''
    render(); return true
  } catch (e) { console.error(e); return false }
}

function stopListening() {
  if (recognitionRef) { recognitionRef.stop(); recognitionRef = null }
  state.isListening = false; state.transcript = ''; render()
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

function handleNewThread() {
  const id = Date.now().toString()
  const thread = { id, title: 'Chat ' + (state.threads.length + 1), providerName: state.selectedProvider, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  state.threads = [thread, ...state.threads]
  state.messages[id] = []
  state.activeThread = thread
  render()
}

function handleDeleteThread(id) {
  if (confirm('Are you sure you want to delete this thread?')) {
    state.threads = state.threads.filter(t => t.id !== id)
    delete state.messages[id]
    if (state.activeThread && state.activeThread.id === id) state.activeThread = null
    render()
  }
}

function handleSendMessage() {
  const text = state.inputText && state.inputText.trim()
  if (!text || !state.activeThread || state.isLoading) return
  stopTts(); state.userStartedSpeaking = false
  const userMessage = { id: Date.now().toString(), threadId: state.activeThread.id, role: 'user', content: text, createdAt: new Date().toISOString() }
  state.messages[state.activeThread.id].push(userMessage)
  state.inputText = ''; state.isLoading = true; state.isStreaming = true
  render()
  setTimeout(scrollToBottom, 50)
  const streamingMessageId = (Date.now() + 1).toString()
  state.messages[state.activeThread.id].push({ id: streamingMessageId, threadId: state.activeThread.id, role: 'assistant', content: '', createdAt: new Date().toISOString(), modelId: state.selectedModel, isStreaming: true })
  let fullContent = '', thinkingContent = ''
  const ttsEnabled = state.ttsEnabled, ttsMuted = state.ttsMuted
  streamResponse(state.activeThread.id, userMessage, (token, accumulated) => {
    fullContent = accumulated
    const msgs = getMessages(state.activeThread.id)
    const aiMsg = msgs.find(m => m.role === 'assistant' && m.isStreaming)
    if (aiMsg) { aiMsg.content = fullContent; aiMsg.thinking = thinkingContent }
    render()
    if (ttsEnabled && !ttsMuted) { const sentences = fullContent.split(/(?<=[.!?])\s+/); sentences.forEach(s => speak(s)) }
    scrollToBottom()
  }, (completeContent) => {
    const msgs = getMessages(state.activeThread.id)
    const aiMsg = msgs.find(m => m.role === 'assistant' && m.isStreaming)
    if (aiMsg) { aiMsg.isStreaming = false; aiMsg.content = completeContent }
    state.isLoading = false; state.isStreaming = false
    if (ttsEnabled && !ttsMuted && completeContent.trim()) speak(completeContent)
    render(); scrollToBottom()
  }, (error) => {
    console.error('Stream error:', error)
    const msgs = getMessages(state.activeThread.id)
    const aiMsg = msgs.find(m => m.role === 'assistant' && m.isStreaming)
    if (aiMsg) { aiMsg.isStreaming = false; aiMsg.content = 'Error: ' + error }
    state.isLoading = false; state.isStreaming = false; render()
  })
}

function handleVoiceChat() {
  if (state.isListening) { stopListening(); state.isVoiceActive = false }
  else {
    if (!state.ttsEnabled) { state.ttsEnabled = true; render() }
    startListening((text) => { window.dispatchEvent(new CustomEvent('voice-transcript', { detail: text })) })
    state.inputText = ''; state.isVoiceActive = true
  }
}

function scrollToBottom() {
  setTimeout(() => { const container = document.querySelector('.scrollable-messages'); if (container) container.scrollTop = container.scrollHeight }, 50)
}

let lastSentTranscript = '', lastWordTime = 0
setInterval(() => {
  if (!state.isListening) { lastWordTime = 0; clearTimeout(window._voiceAutoSendTimeout); return }
  if (!state.transcript.trim()) { clearTimeout(window._voiceAutoSendTimeout); return }
  if (state.transcript === lastSentTranscript) return
  lastWordTime = Date.now()
  clearTimeout(window._voiceAutoSendTimeout)
  window._voiceAutoSendTimeout = setTimeout(() => {
    if (Date.now() - lastWordTime >= 1500 && state.transcript.trim()) { handleSendMessage(); lastSentTranscript = state.transcript; state.inputText = '' }
  }, 1500)
}, 100)

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble(message) {
  const isUser = message.role === 'user'
  const header = h('div', { className: 'flex items-center justify-between mb-2' },
    h('div', { className: 'flex items-center space-x-2' },
      h('div', { className: 'w-6 h-6 rounded-full flex items-center justify-center ' + (isUser ? 'bg-blue-700' : 'bg-gray-700') },
        isUser ? Icon({ name: 'user', size: 12, className: 'text-white' }) : h('div', { className: 'w-2 h-2 bg-gray-600 rounded-full' })
      ),
      h('span', { className: 'text-sm font-medium ' + (isUser ? 'text-white' : 'text-gray-400') }, isUser ? 'You' : 'AI')
    ),
    h('div', { className: 'flex items-center space-x-2' },
      h('button', { className: 'p-1 rounded transition-colors hover:bg-gray-700 text-gray-400', onClick: () => navigator.clipboard.writeText(message.content) }, Icon({ name: 'copy', size: 12 }))
    )
  )
  const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const timeEl = h('span', { className: 'text-xs text-gray-400' }, timeStr)
  const contentChildren = []
  if (message.isStreaming) {
    if (message.thinking) contentChildren.push(h('div', { className: 'mb-2 p-2 bg-yellow-100/20 border border-yellow-500/30 rounded text-yellow-300/80 text-xs italic whitespace-pre-wrap' }, '💭 ' + message.thinking))
    if (message.content && message.content.length > 0) {
      const lines = message.content.split('\n'), children = []
      lines.forEach((line, i) => { children.push(document.createTextNode(line)); if (i < lines.length - 1) children.push(h('br')) })
      contentChildren.push(h('div', { className: 'mb-2 whitespace-pre-wrap' }, ...children))
    }
    contentChildren.push(
      h('div', { className: 'flex items-center space-x-2' },
        h('div', { className: 'flex space-x-1' },
          [1, 2, 3].map(i => h('div', { className: 'w-1 bg-gray-400 rounded-full animate-pulse', style: { height: (Math.random() * 8 + 4) + 'px', animationDelay: (i * 0.1) + 's' } }))
        ),
        h('span', { className: 'text-gray-500' }, 'Thinking...')
      )
    )
  } else {
    const lines = message.content.split('\n'), children = []
    lines.forEach((line, i) => { children.push(document.createTextNode(line)); if (i < lines.length - 1) children.push(h('br')) })
    contentChildren.push(h('div', { className: 'whitespace-pre-wrap' }, ...children))
  }
  const bubbleClass = isUser ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-700 text-white'
  return h('div', { className: 'flex ' + (isUser ? 'justify-end' : 'justify-start') + ' mb-4' },
    h('div', { className: 'max-w-[80%] rounded-lg p-4 relative ' + bubbleClass }, header, timeEl, h('div', { className: 'max-w-none' }, h('div', { className: 'text-sm leading-relaxed' }, ...contentChildren)))
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  const threadMessages = state.activeThread ? getMessages(state.activeThread.id) : []
  const isVoiceActiveState = state.isVoiceActive && (state.isListening || state.isRecording)
  const showWaveform = isVoiceActiveState && state.audioLevel > 0
  const provider = state.providers.find(p => p.id === state.selectedProvider)

  // Sidebar
  const sidebar = h('div', {
    className: (state.isCollapsed ? 'w-16' : 'w-80') + ' border-r flex flex-col transition-all duration-300 bg-gray-900 border-gray-800'
  },
    h('div', { className: 'p-6 border-b border-gray-800' },
      h('div', { className: 'flex items-center justify-between' },
        !state.isCollapsed && h('h1', { className: 'text-xl font-bold text-white' }, 'VoiceChat'),
        h('div', { className: 'flex items-center gap-2' },
          h('button', { className: 'p-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800', onClick: () => { state.isCollapsed = !state.isCollapsed; render() } }, Icon({ name: state.isCollapsed ? 'plus' : 'x', size: 20 })),
          !state.isCollapsed && h('button', { className: 'p-2 rounded-lg transition-colors text-yellow-400 hover:text-yellow-300 hover:bg-gray-800', onClick: () => { state.darkMode = !state.darkMode; render() } }, Icon({ name: 'sun', size: 20 }))
        )
      ),
      !state.isCollapsed && h('button', { className: 'w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium', onClick: handleNewThread }, Icon({ name: 'plus', size: 16 }), 'New Chat')
    ),
    h('div', { className: 'flex-1 overflow-y-auto scrollbar-hide' },
      !state.isCollapsed && (
        state.threads.length === 0
          ? h('div', { className: 'p-8 text-center text-gray-400' },
              Icon({ name: 'message-square', size: 48, className: 'mx-auto mb-4 opacity-50' }),
              h('p', { className: 'text-sm' }, 'No conversations yet')
            )
          : state.threads.map(thread => h('div', {
              className: 'p-4 border-b border-gray-800 cursor-pointer transition-colors ' + (state.activeThread && state.activeThread.id === thread.id ? 'bg-gray-800 border-l-4 border-blue-500' : 'hover:bg-gray-800'),
              onClick: () => { state.activeThread = thread; render() }
            },
              h('div', { className: 'flex items-center justify-between' },
                h('div', { className: 'flex-1 min-w-0' },
                  h('div', { className: 'font-medium truncate text-sm text-white' }, thread.title),
                  thread.providerName && h('div', { className: 'text-xs truncate mt-1 text-gray-400' }, thread.providerName),
                  h('div', { className: 'text-xs mt-1 text-gray-500' }, thread.updatedAt && !isNaN(new Date(thread.updatedAt)) ? new Date(thread.updatedAt).toLocaleDateString() : 'Just now')
                ),
                h('button', { className: 'p-1 rounded transition-colors hover:bg-red-900 text-red-400', onClick: (e) => { e.stopPropagation(); handleDeleteThread(thread.id) } }, Icon({ name: 'trash-2', size: 14 }))
              )
            ))
      ),
      state.isCollapsed && (
        h('div', { className: 'p-4 space-y-2' },
          ...state.threads.slice(0, 5).map(t => h('button', { className: 'w-full p-2 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-800 ' + (state.activeThread && state.activeThread.id === t.id ? 'bg-gray-800 text-blue-400' : 'text-gray-400'), onClick: () => { state.activeThread = t; render() } }, Icon({ name: 'message-square', size: 16 })))
        )
      ),
      state.isCollapsed && state.threads.length > 5 && h('div', { className: 'text-center text-xs text-gray-500' }, '+' + (state.threads.length - 5) + ' more')
    )
  )

  // Main content
  const mainContent = state.activeThread
    ? h('div', { className: 'flex-1 flex flex-col min-h-0 bg-gray-950' },
        // Header
        h('div', { className: 'border-b px-6 py-4 flex-shrink-0 border-gray-800 bg-gray-900' },
          h('div', { className: 'flex items-center justify-between' },
            h('div', null,
              h('h2', { className: 'text-lg font-semibold text-white' }, state.activeThread.title),
              state.activeThread.providerName && h('p', { className: 'text-gray-400 text-sm' }, state.activeThread.providerName)
            ),
            h('div', { className: 'flex items-center gap-3' },
              state.isSpeaking && h('div', { className: 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-600/20' },
                h('div', { className: 'flex space-x-1' },
                  [1, 2, 3].map(i => h('div', {
                    key: i,
                    className: 'w-1 rounded-full animate-pulse bg-cyan-400',
                    style: { height: (4 + i * 3) + 'px' }
                  }))
                ),
                h('span', { className: 'text-xs text-cyan-400' }, 'Speaking...'),
                h('button', { onClick: stopTts, className: 'p-1 rounded hover:bg-cyan-500/30 text-cyan-400' }, Icon({ name: 'volume-x', size: 14 }))
              ),
              isVoiceActiveState && h('div', { className: 'flex items-center gap-3 px-3 py-2 rounded-full bg-orange-600/20' },
                h('div', { className: 'flex items-center gap-2' },
                  h('div', { className: 'w-2 h-2 bg-red-500 rounded-full animate-pulse' }),
                  h('span', { className: 'text-xs font-medium text-orange-400' }, state.isRecording ? 'Recording...' : 'Listening...')
                ),
                showWaveform && h('div', { className: 'flex items-center' }, WaveformBars({ level: state.audioLevel, isActive: true })),
                h('button', { onClick: handleVoiceChat, className: 'p-1 rounded-full hover:bg-red-500/30 text-red-400' }, Icon({ name: 'stop-circle', size: 16 }))
              )
            )
          )
        ),

        // Messages
        h('div', { className: 'flex-1 min-h-0 overflow-y-auto scrollable-messages' },
          h('div', { className: 'px-6 py-4 min-h-full bg-gray-900' },
            h('div', { className: 'max-w-4xl mx-auto space-y-4' },
              ...threadMessages.map(m => MessageBubble(m)),
              state.isStreaming && h('div', { className: 'flex justify-start' },
                h('div', { className: 'max-w-[80%] rounded-lg p-4 bg-gray-800 border border-gray-700 text-white' },
                  h('div', { className: 'flex items-center space-x-2' },
                    h('div', { className: 'flex space-x-1' },
                      [1, 2, 3].map(i => h('div', {
                        key: i,
                        className: 'w-1 bg-gray-400 rounded-full animate-pulse',
                        style: { height: (Math.random() * 8 + 4) + 'px', animationDelay: (i * 0.1) + 's' }
                      }))
                    ),
                    h('span', { className: 'text-gray-500' }, 'Thinking...')
                  )
                )
              )
            )
          )
        ),

        // Input Area
        h('div', { className: 'border-t px-6 py-4 flex-shrink-0 border-gray-800 bg-gray-900' },
          h('div', { className: 'max-w-4xl mx-auto' },
            // Controls row
            h('div', { className: 'flex items-center gap-3 mb-3' },
              // Provider selector
              h('div', { className: 'relative flex-1 max-w-[180px]' },
                h('select', { className: 'w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 border-gray-700 text-white', onChange: (e) => { state.selectedProvider = e.target.value; render() }, value: state.selectedProvider },
                  h('option', { value: '' }, 'Provider'),
                  ...state.providers.map(p => h('option', { value: p.id }, p.name))
                ),
                Icon({ name: 'chevron-down', size: 14, className: 'absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400' })
              ),
              // Model selector
              h('div', { className: 'relative flex-1 max-w-[180px]' },
                h('select', { className: 'w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-gray-800 border-gray-700 text-white', onChange: (e) => { state.selectedModel = e.target.value; render() }, value: state.selectedModel, disabled: !state.selectedProvider },
                  h('option', { value: '' }, 'Model'),
                  ...(provider && provider.models ? provider.models.map(m => h('option', { value: m.id }, m.name)) : [])
                ),
                Icon({ name: 'chevron-down', size: 14, className: 'absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400' })
              ),
              // Refresh button
              h('button', { className: 'p-2 rounded-lg transition-colors bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700', title: 'Refresh Models' }, Icon({ name: 'refresh-cw', size: 16 })),
              // Voice mode toggle
              state.isVoiceActive && h('div', { className: 'flex items-center gap-1' },
                h('button', { onClick: () => { state.voiceMode = 'continuous'; render() }, className: 'p-1.5 rounded transition-colors ' + (state.voiceMode === 'continuous' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 border border-gray-700') }, Icon({ name: 'radio', size: 14 })),
                h('button', { onClick: () => { state.voiceMode = 'push-to-talk'; render() }, className: 'p-1.5 rounded transition-colors ' + (state.voiceMode === 'push-to-talk' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 border border-gray-700') }, Icon({ name: 'hand', size: 14 }))
              ),
              // Voice chat toggle
              state.voiceMode === 'push-to-talk' && state.isVoiceActive
                ? h('button', { className: 'p-2 rounded-lg transition-colors relative ' + (state.isRecording ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-orange-600/30 text-orange-400 border border-orange-500/50') },
                    Icon({ name: 'mic', size: 16 }),
                    state.isRecording && h('span', { className: 'absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse' })
                  )
                : h('button', { onClick: handleVoiceChat, className: 'p-2 rounded-lg transition-colors relative ' + (isVoiceActiveState ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700') },
                    Icon({ name: 'mic', size: 16 }),
                    isVoiceActiveState && h('span', { className: 'absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse' })
                  ),
              // TTS toggle
              h('button', {
                onClick: () => { state.ttsEnabled = !state.ttsEnabled; render() },
                className: 'p-2 rounded-lg transition-colors ' + (state.ttsEnabled && !state.ttsMuted ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : state.ttsEnabled && state.ttsMuted ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700')
              }, state.ttsEnabled ? (state.ttsMuted ? Icon({ name: 'volume-x', size: 18 }) : Icon({ name: 'volume-2', size: 18 })) : Icon({ name: 'settings', size: 18, className: 'opacity-50' }))
            ),

            // Textarea row
            h('div', { className: 'flex items-end space-x-3' },
              h('div', { className: 'flex-1 relative' },
                h('textarea', {
                  className: 'w-full border rounded-lg p-3 pr-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] max-h-[120px] transition-all bg-gray-800 border-gray-700 text-white placeholder-gray-500' + (isVoiceActiveState && !state.isRecording ? '' : isVoiceActiveState && state.isRecording ? ' border-orange-500 ring-2 ring-orange-500/20' : isVoiceActiveState ? ' border-red-500 ring-2 ring-red-500/20' : ''),
                  value: state.inputText,
                  onInput: (e) => { state.inputText = e.target.value; render() },
                  onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } },
                  placeholder: isVoiceActiveState ? (state.voiceMode === 'push-to-talk' ? (state.isRecording ? 'Speak now... (release to send)' : 'Hold mic button to record') : (state.isRecording ? 'Speak now...' : 'Listening...')) : 'Type your message...',
                  rows: 1,
                  disabled: isVoiceActiveState && !state.isRecording
                }),
                // Voice status indicator
                isVoiceActiveState && h('div', { className: 'absolute top-2 right-2 flex items-center space-x-2' },
                  state.audioLevel > 0 && h('div', { className: 'flex items-center gap-0.5' },
                    h('div', { className: 'w-1 bg-orange-500 rounded-full animate-pulse', style: { height: Math.min(20, state.audioLevel / 5) + 'px' } }),
                    h('div', { className: 'w-1 bg-orange-500 rounded-full animate-pulse', style: { height: Math.min(20, state.audioLevel / 4) + 'px', animationDelay: '0.1s' } }),
                    h('div', { className: 'w-1 bg-orange-500 rounded-full animate-pulse', style: { height: Math.min(20, state.audioLevel / 3) + 'px', animationDelay: '0.2s' } })
                  ),
                  h('span', { className: 'text-xs text-orange-400' }, state.isRecording ? 'Recording...' : 'Listening...')
                ),
                // Quick provider info
                state.selectedProvider && !isVoiceActiveState && h('div', { className: 'absolute bottom-2 right-2 flex items-center space-x-2' },
                  h('span', { className: 'text-xs px-2 py-1 rounded text-gray-400 bg-gray-700' },
                    (state.providers.find(p => p.id === state.selectedProvider) && state.providers.find(p => p.id === state.selectedProvider).name || 'Provider') +
                    (state.selectedModel && ' \u2022 ' + (provider && provider.models && provider.models.find(m => m.id === state.selectedModel) && provider.models.find(m => m.id === state.selectedModel).name || 'Model'))
                  )
                )
              ),
              h('button', { onClick: handleSendMessage, disabled: !state.inputText || !state.inputText.trim() || state.isLoading, className: 'p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors' }, Icon({ name: 'send', size: 18 }))
            ),

            // Voice mode hint
            isVoiceActiveState && h('div', { className: 'mt-2 text-center text-xs text-gray-500' },
              state.voiceMode === 'push-to-talk' ? 'Hold mic button to record \u2022 Release to send' : 'Speak to send \u2022 Auto-sends after 1.5s silence'
            )
          )
        )
      )
    : h('div', { className: 'flex-1 flex items-center justify-center bg-gray-900' },
        h('div', { className: 'text-center max-w-md px-6' },
          h('div', { className: 'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-gray-800' },
            h('svg', { className: 'text-blue-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', width: 32, height: 32 },
              h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
            )
          ),
          h('h1', { className: 'text-2xl font-semibold mb-2 text-white' }, 'VoiceChat'),
          h('p', { className: 'mb-6 text-gray-400' }, 'Select a conversation or create a new one to start chatting with AI'),
          h('button', { onClick: handleNewThread, className: 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors' }, 'Create New Chat')
        )
      )

  return h('div', { className: 'flex h-screen font-inter bg-gray-950 text-white' }, sidebar, h('div', { className: 'flex-1 flex flex-col min-w-0' }, mainContent))
}

function render() {
  const root = document.getElementById('root')
  root.innerHTML = ''
  root.appendChild(App())
}

render()
