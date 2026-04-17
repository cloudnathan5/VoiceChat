import React, { useState, useRef, useEffect } from 'react'
import { Send, Mic, ChevronDown, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useVoiceChat } from '../hooks/useVoiceChat'
import MessageBubble from './MessageBubble'

function ChatArea() {
  const { activeThread, messages, addMessage, isLoading, isStreaming, setIsLoading, setIsStreaming, providers, models, updateThread, setProviderModels, setLastUsedSelections, darkMode, voiceState, updateVoiceState, ttsProvider, ttsVoice } = useChatStore()
  const [inputText, setInputText] = useState('')
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTTSEnabled, setIsTTSEnabled] = useState(true)
  const messagesEndRef = useRef(null)
  const ttsBufferRef = useRef('')
  const ttsInProgressRef = useRef(false)
  const ttsFlushScheduledRef = useRef(false)

  // Filter to remove emojis and non-speech characters for TTS
  const filterForSpeech = (text) => {
    if (!text) return ''
    // Remove emojis, symbols, and non-speech characters, keep basic punctuation and letters
    return text
      .replace(/[\p{Emoji_Presentation}\p{Emoji}\p{Extended_Pictographic}]/gu, '')
      .replace(/[^\w\s.,!?'"''""":;\-—()[\]{}<>@#$%^&*+=~`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Flush TTS buffer - speak accumulated text when buffer is large enough or ends with punctuation
  const flushTTSBuffer = async () => {
    if (!isTTSEnabled || !ttsBufferRef.current.trim()) return

    // Prevent concurrent flushes - if already flushing, schedule another flush for after
    if (ttsInProgressRef.current) {
      if (!ttsFlushScheduledRef.current) {
        ttsFlushScheduledRef.current = true
        setTimeout(() => {
          ttsFlushScheduledRef.current = false
          flushTTSBuffer()
        }, 200)
      }
      return
    }

    const text = filterForSpeech(ttsBufferRef.current)
    ttsBufferRef.current = ''

    if (!text) return

    ttsInProgressRef.current = true
    try {
      await speak(text, { provider: ttsProvider, voice: ttsVoice })
    } finally {
      ttsInProgressRef.current = false
    }
  }

  // Enhanced voice chat hook
  const {
    isListening,
    isSpeaking,
    transcript,
    startListening,
    stopListening,
    speak,
    interrupt,
    connectSocket,
    abortGeneration,
    getVoices
  } = useVoiceChat()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Sync voice state with store
  useEffect(() => {
    updateVoiceState({
      isActive: isVoiceActive,
      isListening,
      isSpeaking
    })
  }, [isVoiceActive, isListening, isSpeaking, updateVoiceState])

  // Update input text with real-time transcript
  useEffect(() => {
    if (isListening && transcript) {
      setInputText(transcript)
    }
  }, [transcript, isListening])

  // Restore model selection when thread changes and auto-refresh models
  useEffect(() => {
    if (activeThread) {
      const providerId = activeThread.selected_provider_id || activeThread.provider_id || ''
      setSelectedProvider(providerId)
      setSelectedModel(activeThread.selected_model_id || '')

      // Auto-refresh models when thread loads with a provider
      if (providerId) {
        setIsRefreshing(true)
        fetch(`/api/providers/${providerId}/models`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setProviderModels(providerId, data)
            }
          })
          .catch(error => {
            console.error('Failed to refresh models:', error)
          })
          .finally(() => {
            setIsRefreshing(false)
          })
      }
    }
  }, [activeThread])

  const handleSendMessage = async () => {
  if (!inputText.trim() || !activeThread) return

  // Interrupt any ongoing TTS when sending a message
  interrupt()

  const userMessage = {
    id: Date.now().toString(),
    threadId: activeThread.id,
    role: 'user',
    content: inputText,
    createdAt: new Date().toISOString()
  }

  addMessage(userMessage)
  setInputText('')
  setIsLoading(true)
  setIsStreaming(true)

  // Create streaming AI message
  const streamingMessageId = (Date.now() + 1).toString()
  const streamingMessage = {
    id: streamingMessageId,
    threadId: activeThread.id,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    modelId: selectedModel,
    isStreaming: true
  }
  addMessage(streamingMessage)

  const providerId = selectedProvider || activeThread.providerId
  if (!providerId) {
    useChatStore.getState().replaceStreamingMessage(streamingMessageId, {
      id: streamingMessageId,
      threadId: activeThread.id,
      role: 'assistant',
      content: 'No provider selected',
      createdAt: new Date().toISOString(),
      isStreaming: false
    })
    setIsLoading(false)
    setIsStreaming(false)
    return
  }

  let fullContent = ''
  let thinkingContent = ''

  // Connect via Socket.io for streaming with abort support
  const socket = connectSocket(activeThread.id, {
    onToken: (data) => {
      // Regular token for UI update - only updates UI, don't buffer for TTS
      // TTS is handled via quick_token for complete sentences
      fullContent += data.content
      useChatStore.getState().replaceStreamingMessage(streamingMessageId, {
        id: streamingMessageId,
        threadId: activeThread.id,
        role: 'assistant',
        content: fullContent,
        thinking: thinkingContent,
        createdAt: new Date().toISOString(),
        modelId: selectedModel,
        isStreaming: true
      })
    },
    onThinking: (data) => {
      // Thinking tokens
      thinkingContent += data.content
      useChatStore.getState().replaceStreamingMessage(streamingMessageId, {
        id: streamingMessageId,
        threadId: activeThread.id,
        role: 'assistant',
        content: fullContent,
        thinking: thinkingContent,
        createdAt: new Date().toISOString(),
        modelId: selectedModel,
        isStreaming: true
      })
    },
    onQuickToken: (data) => {
      // Quick answer token - speak immediately for low latency
      if (isTTSEnabled && data.content) {
        const filtered = filterForSpeech(data.content)
        if (filtered && !isSpeaking) {
          speak(filtered, { provider: ttsProvider, voice: ttsVoice })
        }
      }
      // Clear buffer since we already spoke the sentence
      ttsBufferRef.current = ''
    },
    onComplete: (data) => {
      // Stream complete - speak any remaining buffer
      if (ttsBufferRef.current.trim()) {
        const finalText = filterForSpeech(ttsBufferRef.current)
        ttsBufferRef.current = ''
        if (finalText) {
          speak(finalText, { provider: ttsProvider, voice: ttsVoice })
        }
      }
      useChatStore.getState().replaceStreamingMessage(streamingMessageId, {
        id: streamingMessageId,
        threadId: activeThread.id,
        role: 'assistant',
        content: fullContent,
        thinking: thinkingContent,
        createdAt: new Date().toISOString(),
        modelId: selectedModel,
        isStreaming: false
      })
      setIsLoading(false)
      setIsStreaming(false)
    },
    onError: (data) => {
      console.error('Stream error:', data.error)
      useChatStore.getState().replaceStreamingMessage(streamingMessageId, {
        id: streamingMessageId,
        threadId: activeThread.id,
        role: 'assistant',
        content: `Error: ${data.error || 'Streaming failed'}`,
        createdAt: new Date().toISOString(),
        isStreaming: false
      })
      setIsLoading(false)
      setIsStreaming(false)
    }
  })

  // Start the stream
  socket.emit('start-stream', {
    threadId: activeThread.id,
    content: inputText,
    role: 'user',
    providerId: providerId,
    modelId: selectedModel
  })
}

const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const toggleVoiceChat = async () => {
    const newVoiceActive = !isVoiceActive
    setIsVoiceActive(newVoiceActive)

    if (newVoiceActive) {
      try {
        // Abort any ongoing generation and interrupt TTS when user starts listening
        abortGeneration()
        await startListening()
        setInputText('') // Clear input when starting voice
      } catch (error) {
        console.error('Failed to start voice chat:', error)
        setIsVoiceActive(false)
      }
    } else {
      stopListening()

      // If we have a transcript, send it automatically
      if (inputText.trim()) {
        await handleSendMessage()
      }
    }
  }

  // Refresh models for selected provider
  const handleRefreshModels = async () => {
    if (!selectedProvider) return

    setIsRefreshing(true)
    try {
      const response = await fetch(`/api/providers/${selectedProvider}/models`)
      const data = await response.json()

      if (response.ok) {
        setProviderModels(selectedProvider, data)
      }
    } catch (error) {
      console.error('Failed to refresh models:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleProviderChange = async (e) => {
    const newProviderId = e.target.value
    setSelectedProvider(newProviderId)
    setSelectedModel('')
    setLastUsedSelections(newProviderId, '')

    // Auto-refresh models when provider changes
    if (newProviderId) {
      setIsRefreshing(true)
      try {
        const response = await fetch(`/api/providers/${newProviderId}/models`)
        const data = await response.json()

        if (response.ok) {
          setProviderModels(newProviderId, data)
        }
      } catch (error) {
        console.error('Failed to refresh models:', error)
      } finally {
        setIsRefreshing(false)
      }
    }

    if (activeThread) {
      try {
        await fetch(`/api/threads/${activeThread.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeThread.title,
            selectedProviderId: newProviderId,
            selectedModelId: ''
          })
        })
        updateThread(activeThread.id, { selected_provider_id: newProviderId, selected_model_id: '' })
      } catch (error) {
        console.error('Failed to save provider selection:', error)
      }
    }
  }

  const handleModelChange = async (e) => {
    const newModelId = e.target.value
    setSelectedModel(newModelId)
    setLastUsedSelections(selectedProvider, newModelId)

    if (activeThread) {
      try {
        await fetch(`/api/threads/${activeThread.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeThread.title,
            selectedProviderId: selectedProvider,
            selectedModelId: newModelId
          })
        })
        updateThread(activeThread.id, { selected_provider_id: selectedProvider, selected_model_id: newModelId })
      } catch (error) {
        console.error('Failed to save model selection:', error)
      }
    }
  }

  if (!activeThread) {
    return (
      <div className={`flex-1 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Select a thread to start chatting</p>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-white'}`}>
      {/* Header */}
      <div className={`border-b px-6 py-4 flex-shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {activeThread.title}
            </h2>
            {activeThread.providerName && (
              <p className={darkMode ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>
                {activeThread.providerName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className={`px-6 py-4 min-h-full ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className={`border-t px-6 py-4 flex-shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-4xl mx-auto">
          {/* Provider/Model Controls Row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Provider Selector */}
            <div className="relative flex-1 max-w-[180px]">
              <select
                className={`w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                onChange={handleProviderChange}
                value={selectedProvider}
              >
                <option value="">Provider</option>
                {(providers || []).map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}
              />
            </div>

            {/* Model Selector */}
            <div className="relative flex-1 max-w-[180px]">
              <select
                className={`w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                onChange={handleModelChange}
                value={selectedModel}
                disabled={!selectedProvider}
              >
                <option value="">Model</option>
                {(models[selectedProvider] || []).map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefreshModels}
              disabled={!selectedProvider || isRefreshing}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 relative ${darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'} ${isRefreshing ? 'cursor-not-allowed' : ''}`}
              title={isRefreshing ? 'Refreshing models...' : 'Refresh Models'}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              )}
            </button>
          </div>

          {/* Message Input Row */}
          <div className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? "Listening..." : "Type your message..."}
                className={`w-full border rounded-lg p-3 pr-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] max-h-[120px] transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} ${isListening ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                rows={1}
                disabled={isListening}
              />

              {/* Voice Status Indicator */}
              {isListening && (
                <div className="absolute top-2 right-2 flex items-center space-x-1">
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className="w-1 bg-red-500 rounded-full animate-pulse"
                        style={{
                          height: `${Math.random() * 12 + 4}px`,
                          animationDelay: `${i * 0.1}s`
                        }}
                      />
                    ))}
                  </div>
                  <span className={`text-xs ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                    Listening...
                  </span>
                </div>
              )}

              {/* Quick Provider Info */}
              {selectedProvider && !isListening && (
                <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                  <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-500 bg-gray-100'}`}>
                    {providers.find(p => p.id === selectedProvider)?.name || 'Provider'}
                    {selectedModel && ' • ' + (models[selectedProvider]?.find(m => m.id === selectedModel)?.name || 'Model')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* TTS Toggle */}
              <button
                onClick={() => setIsTTSEnabled(!isTTSEnabled)}
                className={`p-3 rounded-lg transition-colors ${isTTSEnabled ? 'bg-green-100 text-green-600' : darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                title={isTTSEnabled ? 'Disable TTS' : 'Enable TTS'}
              >
                {isTTSEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>

              {/* Voice Chat Toggle */}
              <button
                onClick={() => {
                  if (isSpeaking) {
                    interrupt() // Interrupt AI speech
                  } else {
                    toggleVoiceChat() // Toggle voice mode
                  }
                }}
                className={`p-3 rounded-lg transition-colors relative ${isVoiceActive ? 'bg-red-100 text-red-600' : isSpeaking ? 'bg-orange-100 text-orange-600' : darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {isSpeaking ? (
                  <Volume2 size={18} className="animate-pulse" />
                ) : (
                  <Mic size={18} />
                )}
                {isListening && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isLoading}
                className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatArea