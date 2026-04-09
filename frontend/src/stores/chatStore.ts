import { create } from 'zustand'
import { Provider, Thread, Message, Model, VoiceState } from '../types'

interface ChatState {
  // State
  providers: Provider[]
  threads: Thread[]
  activeThread: Thread | null
  messages: Message[]
  streamingMessages: Message[] // Always preserved across thread switches
  models: Record<string, Model[]> // providerId -> models
  lastUsedProviderId: string | null
  lastUsedModelId: string | null
  isLoading: boolean
  isStreaming: boolean
  darkMode: boolean
  voiceState: VoiceState

  // Actions
  setProviders: (providers: Provider[]) => void
  addProvider: (provider: Provider) => void
  removeProvider: (id: string) => void

  setThreads: (threads: Thread[]) => void
  setActiveThread: (thread: Thread | null) => void
  addThread: (thread: Thread) => void
  updateThread: (id: string, updates: Partial<Thread>) => void
  removeThread: (id: string) => void

  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  updateMessageContent: (id: string, content: string) => void
  replaceStreamingMessage: (id: string, message: Message) => void

  setModels: (models: Record<string, Model[]>) => void
  setProviderModels: (providerId: string, models: Model[]) => void
  setLastUsedSelections: (providerId: string | null, modelId: string | null) => void
  setIsLoading: (loading: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  setDarkMode: (darkMode: boolean) => void
  toggleDarkMode: () => void

  // Voice actions
  setVoiceState: (state: Partial<VoiceState>) => void
  updateVoiceState: (updates: Partial<VoiceState>) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  providers: [],
  threads: [],
  activeThread: null,
  messages: [],
  streamingMessages: [],
  models: {},
  lastUsedProviderId: null,
  lastUsedModelId: null,
  isLoading: false,
  isStreaming: false,
  darkMode: localStorage.getItem('darkMode') === 'true',
  voiceState: {
    isActive: false,
    isListening: false,
    isSpeaking: false,
    latency: 0,
    audioContext: undefined,
    mediaRecorder: undefined
  },

  // Voice actions
  setVoiceState: (state) => set({ voiceState: { ...get().voiceState, ...state } }),
  updateVoiceState: (updates) => set((state) => ({ voiceState: { ...state.voiceState, ...updates } })),

  // Provider actions
  setProviders: (providers) => set({ providers }),
  addProvider: (provider) => set((state) => ({ providers: [...state.providers, provider] })),
  removeProvider: (id) => set((state) => ({ providers: state.providers.filter(p => p.id !== id) })),

  // Thread actions
  setThreads: (threads) => set({ threads }),
  setActiveThread: (thread) => {
    set({ activeThread: thread })
    if (thread) {
      // Load messages for this thread
      fetch(`/api/threads/${thread.id}/messages`)
      .then(res => res.json())
      .then(messages => {
        console.log('=== SET ACTIVE THREAD ===')
        console.log('Loading messages for thread:', thread.id)
        console.log('Loaded messages count:', messages.length)

        // Get the LATEST state to find streaming messages
        const latestState = get()
        console.log('Total streamingMessages:', latestState.streamingMessages.length)
        latestState.streamingMessages.forEach((m, i) => {
          console.log(`Streaming[${i}]: threadId=${m.threadId}, contentLen=${m.content?.length||0}, thinkingLen=${m.thinking?.length||0}`)
        })
        // Check if there's a streaming message for this thread in the persistent streamingMessages
        const threadStreamingMessage = latestState.streamingMessages.find(m => m.threadId === thread.id)

        if (threadStreamingMessage) {
          console.log('=== RESTORING STREAMING MESSAGE ===')
          console.log('Thread ID:', thread.id)
          console.log('Streaming message threadId:', threadStreamingMessage.threadId)
          console.log('Content length:', threadStreamingMessage.content?.length || 0)
          console.log('Thinking length:', threadStreamingMessage.thinking?.length || 0)
          console.log('Thinking preview:', threadStreamingMessage.thinking?.substring(0, 100) || 'EMPTY')
          // Merge loaded messages with the preserved streaming message for this thread
          const nonStreamingMessages = messages.filter(m => !m.isStreaming || m.id === threadStreamingMessage.id)
          // Remove any duplicate streaming message that might have been saved
          const filteredNonStreaming = nonStreamingMessages.filter(m => m.id !== threadStreamingMessage.id)
          console.log('Setting messages with restored streaming, thinkingLen:', threadStreamingMessage.thinking?.length || 0)
          set({ messages: [...filteredNonStreaming, threadStreamingMessage] })
        } else {
          // Normal case: just set the loaded messages - but DON'T touch streamingMessages
          const latestForPreserve = get()
          console.log('=== NO STREAMING MESSAGE FOR THIS THREAD ===')
          console.log('Current streamingMessages count:', latestForPreserve.streamingMessages.length)
          latestForPreserve.streamingMessages.forEach((m, i) => {
            console.log(`  Streaming[${i}]: threadId=${m.threadId}, thinkingLen=${m.thinking?.length||0}`)
          })
          console.log('Setting messages WITHOUT touching streamingMessages')
          set({ messages })
        }
      })
    } else {
      // Clear messages when no thread is active
      set({ messages: [] })
    }
  },
  addThread: (thread) => set((state) => ({ threads: [thread, ...state.threads] })),
  updateThread: (id, updates) => set((state) => ({
    threads: state.threads.map(t => t.id === id ? { ...t, ...updates } : t),
    // Also update activeThread if it's the current thread
    activeThread: state.activeThread?.id === id ? { ...state.activeThread, ...updates } : state.activeThread
  })),
  removeThread: (id) => set((state) => ({ threads: state.threads.filter(t => t.id !== id) })),

  // Message actions
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
  })),
  updateMessageContent: (id, content) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, content } : m)
  })),
  replaceStreamingMessage: (id, message) => set((state) => {
    // Update in both messages and streamingMessages
    const updatedMessages = state.messages.map(m => m.id === id ? message : m)
    const existingStreaming = state.streamingMessages.find(m => m.id === id)
    let updatedStreamingMessages
    if (existingStreaming) {
      updatedStreamingMessages = state.streamingMessages.map(m => m.id === id ? message : m)
      console.log('Updating streaming message, thinking length:', message.thinking?.length || 0)
    } else {
      updatedStreamingMessages = [...state.streamingMessages, message]
      console.log('Adding new streaming message, thinking length:', message.thinking?.length || 0)
    }
    return { messages: updatedMessages, streamingMessages: updatedStreamingMessages }
  }),

  // Model actions
  setModels: (models) => set({ models }),
  setProviderModels: (providerId, providerModels) => set((state) => ({
    models: {
      ...state.models,
      [providerId]: providerModels.filter((model, index, self) =>
        index === self.findIndex(m => m.id === model.id)
      )
    }
  })),
  setLastUsedSelections: (providerId, modelId) => set({ lastUsedProviderId: providerId, lastUsedModelId: modelId }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setDarkMode: (darkMode) => {
    localStorage.setItem('darkMode', String(darkMode))
    set({ darkMode })
  },
  toggleDarkMode: () => set((state) => {
    const newDarkMode = !state.darkMode
    localStorage.setItem('darkMode', String(newDarkMode))
    return { darkMode: newDarkMode }
  })
}))