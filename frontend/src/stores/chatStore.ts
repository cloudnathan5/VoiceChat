import { create } from 'zustand'
import { Provider, Thread, Message, Model, VoiceState } from '../types'

interface ChatState {
  // State
  providers: Provider[]
  threads: Thread[]
  activeThread: Thread | null
  messages: Message[]
  streamingMessages: Message[]
  // Always preserved across thread switches
  models: Record<string, Model[]> // providerId -> models
  lastUsedProviderId: string | null
  lastUsedModelId: string | null
  isLoading: boolean
  isStreaming: boolean
  darkMode: boolean
  showSettings: boolean
  ttsEnabled: boolean
  ttsMuted: boolean
  preferredVoice: string | null
  voiceState: VoiceState

  // Actions
  getProviders(): Provider[]
  setProviders: (providers: Provider[]) => void
  addProvider: (provider: Provider) => void
  removeProvider: (id: string) => void
  
  getThreads(): Thread[]
  setThreads: (threads: Thread[]) => void
  setActiveThread: (thread: Thread | null) => void
  addThread: (thread: Thread) => void
  updateThread: (id: string, updates: Partial<Thread>) => void
  removeThread: (id: string) => void
  
  getMessages(): Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  updateMessageContent: (id: string, content: string) => void
  replaceStreamingMessage: (id: string, message: Message) => void
  
  getModels(): Record<string, Model[]>
  setModels: (models: Record<string, Model[]>) => void
  setProviderModels: (providerId: string, models: Model[]) => void
  setLastUsedSelections: (providerId: string | null, modelId: string | null) => void
  
  getIsLoading(): boolean
  setIsLoading: (loading: boolean) => void
  
  getIsStreaming(): boolean
  setIsStreaming: (streaming: boolean) => void
  
  getDarkMode(): boolean
  setDarkMode: (darkMode: boolean) => void
  toggleDarkMode: () => void
  
  getShowSettings(): boolean
  setShowSettings: (show: boolean) => void
  
  // Voice actions
  setVoiceState: (state: Partial<VoiceState>) => void
  updateVoiceState: (updates: Partial<VoiceState>) => void
  
  // TTS actions
  getTtsEnabled: () => boolean
  getTtsMuted: () => boolean
  getPreferredVoice: () => string | null
  setTtsEnabledDb: (enabled: boolean) => void
  setTtsMutedDb: (muted: boolean) => void
  setPreferredVoiceDb: (voice: string | null) => void
  toggleTtsEnabled: () => void
  toggleTtsMuted: () => void
}

// Database helper methods
const getDbSetting = (db: any, key: string): string | null => {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const result = stmt.get(key)
  return result ? result.value : null
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  providers: [],
  threads: [],
  activeThread: null,
  messages: [],
  streamingMessages: [],
  models: {},
  lastUsedProviderId: localStorage.getItem('lastUsedProviderId') || null,
  lastUsedModelId: localStorage.getItem('lastUsedModelId') || null,
  isLoading: false,
  isStreaming: false,
  darkMode: localStorage.getItem('darkMode') === 'true',
  showSettings: false,
  ttsEnabled: JSON.parse(localStorage.getItem('tts_enabled_v2') || 'false'),
  ttsMuted: JSON.parse(localStorage.getItem('tts_muted_v2') || 'false'),
  preferredVoice: localStorage.getItem('tts_preferred_voice_v2') || null,
  voiceState: {
    isActive: false,
    isListening: false,
    isSpeaking: false,
    latency: 0,
    audioContext: undefined,
    mediaRecorder: undefined
  },

  // Database helper methods that match the backend schema
  getTtsEnabled: () => {
    return JSON.parse(localStorage.getItem('tts_enabled_v2') || 'false')
  },
  getTtsMuted: () => {
    return JSON.parse(localStorage.getItem('tts_muted_v2') || 'false')
  },
  getPreferredVoice: () => {
    return localStorage.getItem('tts_preferred_voice_v2') || null
  },
  setTtsEnabledDb: (enabled: boolean) => {
    localStorage.setItem('tts_enabled_v2', JSON.stringify(enabled))
  },
  setTtsMutedDb: (muted: boolean) => {
    localStorage.setItem('tts_muted_v2', JSON.stringify(muted))
  },
  setPreferredVoiceDb: (voice: string | null) => {
    localStorage.setItem('tts_preferred_voice_v2', voice || '')
  },

  // Voice actions
  setVoiceState: (state) => set({ voiceState: { ...get().voiceState, ...state } }),
  updateVoiceState: (updates) => set((state) => ({
    voiceState: { ...state.voiceState, ...updates }
  })),

  // TTS actions
  toggleTtsEnabled: () => set((state) => {
    const newEnabled = !state.ttsEnabled
    state.setTtsEnabledDb(newEnabled)
    return { ttsEnabled: newEnabled }
  }),
  toggleTtsMuted: () => set((state) => {
    const newMuted = !state.ttsMuted
    state.setTtsMutedDb(newMuted)
    return { ttsMuted: newMuted }
  }),
  // Provider actions
  setProviders: (providers) => set({ providers }),
  addProvider: (provider) => set((state) => ({ 
    providers: [...state.providers, provider] 
  })),
  removeProvider: (id) => set((state) => ({ 
    providers: state.providers.filter(p => p.id !== id) 
  })),

  // Thread actions
  setThreads: (threads) => set({ threads }),
  setActiveThread: (thread) => { 
    set({ activeThread: thread })
    if (thread) {
      // Load messages for this thread
      fetch(`/api/threads/${thread.id}/messages`)
        .then(res => res.json())
        .then(messages => {
          const latestState = get()
          const threadStreamingMessage = latestState.streamingMessages.find(m => m.threadId === thread.id)
          if (threadStreamingMessage) {
            const nonStreamingMessages = messages.filter(m => !m.isStreaming || m.id === threadStreamingMessage.id)
            const filteredNonStreaming = nonStreamingMessages.filter(m => m.id !== threadStreamingMessage.id)
            set({ messages: [...filteredNonStreaming, threadStreamingMessage] })
          } else {
            // Filter out any leftover streaming messages (isStreaming: true with empty content)
            const nonStreamingMessages = messages.filter(m => !m.isStreaming)
            set({ messages: nonStreamingMessages })
          }
        })
    } else {
      // Clear messages when no thread is active
      set({ messages: [] })
    }
  },
  addThread: (thread) => set((state) => ({ 
    threads: [thread, ...state.threads] 
  })),
  updateThread: (id, updates) => set((state) => ({
    threads: state.threads.map(t => t.id === id ? { ...t, ...updates } : t),
    // Also update activeThread if it's the current thread
    activeThread: state.activeThread?.id === id ? { ...state.activeThread, ...updates } : state.activeThread
  })),
  removeThread: (id) => set((state) => ({ 
    threads: state.threads.filter(t => t.id !== id) 
  })),

  // Message actions
  getMessages: () => get().messages,
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => {
    const newMessages = [...state.messages, message]
    try {
      const allMsgs = JSON.parse(localStorage.getItem('vc_messages') || '{}')
      const threadMsgs = allMsgs[message.threadId] || []
      threadMsgs.push(message)
      allMsgs[message.threadId] = threadMsgs
      localStorage.setItem('vc_messages', JSON.stringify(allMsgs))
    } catch (e) {}
    return { messages: newMessages }
  }),
  updateMessage: (id, updates) => set((state) => {
    const newMessages = state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
    try {
      const allMsgs = JSON.parse(localStorage.getItem('vc_messages') || '{}')
      for (const tid in allMsgs) {
        const idx = allMsgs[tid].findIndex(m => m.id === id)
        if (idx >= 0) {
          allMsgs[tid][idx] = { ...allMsgs[tid][idx], ...updates }
          localStorage.setItem('vc_messages', JSON.stringify(allMsgs))
          break
        }
      }
    } catch (e) {}
    return { messages: newMessages }
  }),
  updateMessageContent: (id, content) => set((state) => {
    const newMessages = state.messages.map(m => m.id === id ? { ...m, content } : m)
    try {
      const allMsgs = JSON.parse(localStorage.getItem('vc_messages') || '{}')
      for (const tid in allMsgs) {
        const idx = allMsgs[tid].findIndex(m => m.id === id)
        if (idx >= 0) {
          allMsgs[tid][idx] = { ...allMsgs[tid][idx], content }
          localStorage.setItem('vc_messages', JSON.stringify(allMsgs))
          break
        }
      }
    } catch (e) {}
    return { messages: newMessages }
  }),
  replaceStreamingMessage: (id, message) => set((state) => {
    // Update in both messages and streamingMessages
    const updatedMessages = state.messages.map(m => m.id === id ? message : m)
    const existingStreaming = state.streamingMessages.find(m => m.id === id)
    let updatedStreamingMessages
    if (existingStreaming) {
      updatedStreamingMessages = state.streamingMessages.map(m => m.id === id ? message : m)
    } else {
      updatedStreamingMessages = [...state.streamingMessages, message]
    }
    return { messages: updatedMessages, streamingMessages: updatedStreamingMessages }
  }),

  // Model actions
  getModels: () => get().models,
  setModels: (models) => set({ models }),
  setProviderModels: (providerId, providerModels) => set((state) => ({
    models: { ...state.models, 
      [providerId]: providerModels.filter((model, index, self) => 
        index === self.findIndex(m => m.id === model.id)
      )
    }
  })),
  setLastUsedSelections: (providerId, modelId) => {
    localStorage.setItem('lastUsedProviderId', providerId || '')
    localStorage.setItem('lastUsedModelId', modelId || '')
    set({ 
      lastUsedProviderId: providerId, 
      lastUsedModelId: modelId 
    })
  },
  
  // Loading states
  getIsLoading: () => get().isLoading,
  setIsLoading: (isLoading) => set({ isLoading }),
  getIsStreaming: () => get().isStreaming,
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  
  // UI states
  getDarkMode: () => get().darkMode,
  setDarkMode: (darkMode) => {
    localStorage.setItem('darkMode', String(darkMode))
    set({ darkMode })
  },
  toggleDarkMode: () => set((state) => {
    const newDarkMode = !state.darkMode
    localStorage.setItem('darkMode', String(newDarkMode))
    return { darkMode: newDarkMode }
  }),
  
  // Settings panel
  getShowSettings: () => get().showSettings,
  setShowSettings: (show) => set({ showSettings: show }),
}))
