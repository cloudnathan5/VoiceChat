import React, { useState, useRef, useEffect } from 'react'
import { Send, Mic, ChevronDown, RefreshCw, Volume2, VolumeX, Settings, StopCircle, Radio, Hand } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { useTTS } from '../hooks/useTTS'
import MessageBubble from './MessageBubble'

// Waveform visualization component
function WaveformBars({ level, isActive }) {
  const barCount = 24
  const bars = []

  for (let i = 0; i < barCount; i++) {
    // Create a wave pattern based on position and level
    const waveOffset = Math.sin((i / barCount) * Math.PI * 2) * 0.5 + 0.5
    const barHeight = Math.max(4, (level / 128) * 40 * waveOffset + 4)
    const delay = (i / barCount) * 0.3

    bars.push(
      <div
        key={i}
        className={`rounded-full transition-all ${
          isActive
            ? level > 20
              ? 'bg-orange-500'
              : 'bg-red-500/50'
            : 'bg-gray-600'
        }`}
        style={{
          width: '3px',
          height: `${barHeight}px`,
          transitionDelay: `${delay}s`,
          transitionDuration: '100ms'
        }}
      />
    )
  }

  return (
    <div className="flex items-end justify-center gap-0.5 h-10">
      {bars}
    </div>
  )
}

function ChatArea() {
  const {
    activeThread,
    messages,
    addMessage,
    isLoading,
    isStreaming,
    setIsLoading,
    setIsStreaming,
    providers,
    models,
    updateThread,
    setProviderModels,
    setLastUsedSelections,
    darkMode,
    voiceState,
    updateVoiceState
  } = useChatStore()

  const [inputText, setInputText] = useState('')
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showTtsMenu, setShowTtsMenu] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const ttsMenuRef = useRef(null)

  // Enhanced voice chat hook
  const {
    isListening,
    isRecording,
    transcript,
    audioLevel,
    userStartedSpeaking,
    userStartedSpeakingRef,
    resetInterruptFlag,
    voiceMode,
    isInterrupting,
    startListening,
    startPushToTalk,
    stopPushToTalk,
    stopListening,
    interrupt,
    abortGeneration,
    connectSocket,
    getSocket,
    setVoiceMode
  } = useVoiceChat()

  // TTS hook
  const {
    availableVoices,
    availablePiperModels,
    isLoadingVoices,
    isSpeaking: isTtsSpeaking,
    isPiperAvailable,
    voiceProvider,
    ttsEnabled,
    ttsMuted,
    preferredVoice,
    setPreferredVoice,
    setVoiceProvider,
    speak,
    startStreamingTTS,
    feedStreamingTTS,
    completeStreamingTTS,
    stop: stopTts,
    toggleTtsEnabled,
    toggleTtsMuted,
    test: testTts,
    checkPiperStatus
  } = useTTS()

  // Close TTS menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ttsMenuRef.current && !ttsMenuRef.current.contains(event.target)) {
        setShowTtsMenu(false)
      }
    }
    if (showTtsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTtsMenu])

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
      isListening: isListening || isRecording,
      isSpeaking: isTtsSpeaking
    })
  }, [isVoiceActive, isListening, isRecording, isTtsSpeaking, updateVoiceState])

  // Update input text with real-time transcript
  useEffect(() => {
    if ((isListening || isRecording) && transcript) {
      setInputText(transcript)
    }
  }, [transcript, isListening, isRecording])

  // Restore last-used provider/model on mount (if no thread is active yet)
  useEffect(() => {
    if (!providers.length) return
    const lastProviderId = useChatStore.getState().lastUsedProviderId
    const lastModelId = useChatStore.getState().lastUsedModelId
    if (lastProviderId) {
      setSelectedProvider(lastProviderId)
      setSelectedModel(lastModelId || '')
      // Fetch models for this provider
      fetch(`/api/providers/${lastProviderId}/models`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setProviderModels(lastProviderId, data)
          }
        })
        .catch(error => {
          console.error('Failed to refresh models:', error)
        })
    }
  }, [])

  // Restore model selection when thread changes
  useEffect(() => {
    if (activeThread) {
      const providerId = activeThread.selected_provider_id || activeThread.provider_id || ''
      setSelectedProvider(providerId)
      setSelectedModel(activeThread.selected_model_id || '')

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
  }, [activeThread, setProviderModels])

  const handleVoiceSelect = (voiceId) => {
    setPreferredVoice(voiceId)
    setShowTtsMenu(false)
  }

  // Send a message (text or voice transcript)
  const sendMessage = async (text) => {
    const messageText = text || inputText
    if (!messageText.trim() || !activeThread || isLoading) return

    // Interrupt any ongoing generation/voice/TTS
    abortGeneration()
    stopTts()
    resetInterruptFlag()

    const userMessage = {
      id: Date.now().toString(),
      threadId: activeThread.id,
      role: 'user',
      content: messageText,
      createdAt: new Date().toISOString()
    }

    addMessage(userMessage)
    if (!text) setInputText('')
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
        content: 'No provider selected. Please configure a provider in settings.',
        createdAt: new Date().toISOString(),
        isStreaming: false
      })
      setIsLoading(false)
      setIsStreaming(false)
      return
    }

    let fullContent = ''
    let thinkingContent = ''

    // Initialize streaming TTS queue
    const ttsEnabledState = useChatStore.getState().ttsEnabled
    const ttsMutedState = useChatStore.getState().ttsMuted
    if (ttsEnabledState && !ttsMutedState) {
      startStreamingTTS()
    }

    const socket = connectSocket(activeThread.id, {
      onToken: (data) => {
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

        // Feed content to streaming TTS queue
        const ttsEnabledState = useChatStore.getState().ttsEnabled
        const ttsMutedState = useChatStore.getState().ttsMuted
        if (ttsEnabledState && !ttsMutedState) {
          feedStreamingTTS(fullContent)
        }
      },
      onThinking: (data) => {
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
        // Skip quick token TTS for now
      },
      onComplete: (data) => {
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

        // Complete streaming TTS — speak any remaining partial content
        const ttsEnabledState = useChatStore.getState().ttsEnabled
        const ttsMutedState = useChatStore.getState().ttsMuted
        if (ttsEnabledState && !ttsMutedState && fullContent.trim()) {
          completeStreamingTTS()
        }
      },
      onError: (data) => {
        console.error('Stream error:', data.error)
        // Complete any partial streaming TTS
        completeStreamingTTS()
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

    socket.emit('start-stream', {
      threadId: activeThread.id,
      content: messageText,
      role: 'user',
      providerId: providerId,
      modelId: selectedModel
    })
  }

  const handleSendMessage = async () => {
    await sendMessage()
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Handle auto-send when silence detected in continuous mode
  const lastSentTranscriptRef = useRef('')
  const lastWordTimeRef = useRef(0)

  useEffect(() => {
    if (!isListening) {
      lastWordTimeRef.current = 0
      clearTimeout(window._voiceAutoSendTimeout)
      return
    }

    if (!transcript.trim()) {
      clearTimeout(window._voiceAutoSendTimeout)
      return
    }

    // Don't auto-send if we've already sent this transcript
    if (transcript === lastSentTranscriptRef.current) return

    // Update the timestamp whenever the transcript changes (new word detected)
    lastWordTimeRef.current = Date.now()

    // Clear existing timeout
    clearTimeout(window._voiceAutoSendTimeout)

    // Start a new timeout — fires when no new words for 1.5s
    window._voiceAutoSendTimeout = setTimeout(() => {
      const elapsed = Date.now() - lastWordTimeRef.current
      // Only send if at least 1.5s has passed AND there are actual words
      if (elapsed >= 1500 && transcript.trim()) {
        console.log('[Voice] Auto-send after silence:', transcript)
        sendMessage(transcript)
        lastSentTranscriptRef.current = transcript
        setInputText('')
      }
    }, 1500)

    // If transcript becomes empty/whitespace, cancel the timeout
    if (!transcript.trim()) {
      clearTimeout(window._voiceAutoSendTimeout)
    }

    return () => clearTimeout(window._voiceAutoSendTimeout)
  }, [transcript, isListening])

  // Handle TTS interruption when user starts speaking — interrupt on first transcribed word
  // Uses the shared ref from the hook directly — same object instance
  useEffect(() => {
    if (!isVoiceActive || !isTtsSpeaking) {
      // Reset the flag when TTS stops — prevents false interrupts on next message
      if (userStartedSpeakingRef.current) {
        userStartedSpeakingRef.current = false
      }
      return
    }
    const interval = setInterval(() => {
      if (userStartedSpeakingRef.current) {
        console.log('[TTS] Interrupt — user started speaking')
        userStartedSpeakingRef.current = false
        stopTts()
        abortGeneration()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [isVoiceActive, isTtsSpeaking, stopTts, abortGeneration])

  const toggleVoiceChat = async () => {
    if (isVoiceActive) {
      // Stop voice chat entirely
      stopListening()
      setIsVoiceActive(false)
    } else {
      // Start voice chat
      try {
        abortGeneration()
        stopTts()
        // Auto-enable TTS when entering voice mode so responses are spoken
        if (!ttsEnabled) {
          toggleTtsEnabled()
        }
        await startListening((text) => {
          // Dispatch custom event so the effect above can react
          window.dispatchEvent(new CustomEvent('voice-transcript', { detail: text }))
        })
        setInputText('')
        setIsVoiceActive(true)
      } catch (error) {
        console.error('Failed to start voice chat:', error)
        setIsVoiceActive(false)
      }
    }
  }

  // Push-to-talk: start recording
  const handlePushToTalkStart = async () => {
    if (isRecording) return
    if (!isVoiceActive) {
      // Start voice chat first if not active
      setIsVoiceActive(true)
      await startListening()
    }
    await startPushToTalk()
  }

  // Push-to-talk: stop recording and send
  const handlePushToTalkEnd = async () => {
    if (isRecording) {
      stopPushToTalk((text) => {
        sendMessage(text)
      })
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
        updateThread(activeThread.id, {
          selected_provider_id: newProviderId,
          selected_model_id: ''
        })
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
        updateThread(activeThread.id, {
          selected_provider_id: selectedProvider,
          selected_model_id: newModelId
        })
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

  // Determine active voice state for UI
  const isVoiceActiveState = isVoiceActive && (isListening || isRecording)
  const showWaveform = isVoiceActiveState && audioLevel > 0

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

          {/* Voice Chat Status Indicator */}
          {isVoiceActiveState && (
            <div className={`flex items-center gap-3 px-3 py-2 rounded-full ${darkMode ? 'bg-orange-600/20' : 'bg-orange-100'}`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className={`text-xs font-medium ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                  {isRecording ? 'Recording...' : 'Listening...'}
                </span>
              </div>

              {/* Waveform visualization */}
              {showWaveform && (
                <div className="flex items-center">
                  <WaveformBars level={audioLevel} isActive={true} />
                </div>
              )}

              {/* Stop button */}
              <button
                onClick={toggleVoiceChat}
                className={`p-1 rounded-full hover:bg-red-500/30 ${darkMode ? 'text-red-400' : 'text-red-600'}`}
                title="Stop voice chat"
              >
                <StopCircle size={16} />
              </button>
            </div>
          )}

          {/* TTS Status Indicator */}
          {isTtsSpeaking && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${darkMode ? 'bg-cyan-600/20' : 'bg-cyan-100'}`}>
              <div className="flex space-x-1">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`w-1 rounded-full animate-pulse ${darkMode ? 'bg-cyan-400' : 'bg-cyan-600'}`}
                    style={{ height: `${4 + i * 3}px` }}
                  />
                ))}
              </div>
              <span className={`text-xs ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                Speaking...
              </span>
              <button
                onClick={stopTts}
                className={`p-1 rounded hover:bg-cyan-500/30 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}
                title="Stop TTS"
              >
                <VolumeX size={14} />
              </button>
            </div>
          )}
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
              <ChevronDown size={14} className={`absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
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
              <ChevronDown size={14} className={`absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefreshModels}
              disabled={!selectedProvider || isRefreshing}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 relative ${darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'}`}
              title={isRefreshing ? 'Refreshing models...' : 'Refresh Models'}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              )}
            </button>

            {/* Voice Mode Toggle */}
            {isVoiceActive && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setVoiceMode('continuous')}
                  className={`p-1.5 rounded transition-colors ${
                    voiceMode === 'continuous'
                      ? 'bg-orange-600 text-white'
                      : darkMode ? 'bg-gray-800 text-gray-500 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-300'
                  }`}
                  title="Continuous mode (auto-send on silence)"
                >
                  <Radio size={14} />
                </button>
                <button
                  onClick={() => setVoiceMode('push-to-talk')}
                  className={`p-1.5 rounded transition-colors ${
                    voiceMode === 'push-to-talk'
                      ? 'bg-orange-600 text-white'
                      : darkMode ? 'bg-gray-800 text-gray-500 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-300'
                  }`}
                  title="Push-to-talk mode (hold to record)"
                >
                  <Hand size={14} />
                </button>
              </div>
            )}

            {/* Voice Chat Toggle */}
            {voiceMode === 'push-to-talk' && isVoiceActive ? (
              <button
                onMouseDown={handlePushToTalkStart}
                onMouseUp={handlePushToTalkEnd}
                onTouchStart={handlePushToTalkStart}
                onTouchEnd={handlePushToTalkEnd}
                className={`p-2 rounded-lg transition-colors relative ${
                  isRecording
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-orange-600/30 text-orange-400 border border-orange-500/50'
                }`}
                title={isRecording ? 'Recording... release to send' : 'Hold to record'}
              >
                <Mic size={16} />
                {isRecording && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </button>
            ) : (
              <button
                onClick={toggleVoiceChat}
                className={`p-2 rounded-lg transition-colors relative ${
                  isVoiceActiveState
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                }`}
                title={isVoiceActiveState ? 'Stop voice chat' : 'Start voice chat'}
              >
                <Mic size={16} />
                {isVoiceActiveState && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </button>
            )}

            {/* TTS Toggle - Settings Menu */}
            <div className="relative" ref={ttsMenuRef}>
              <button
                onClick={() => setShowTtsMenu(!showTtsMenu)}
                className={`p-2 rounded-lg transition-colors ${ttsEnabled && !ttsMuted ? (darkMode ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'bg-cyan-500 hover:bg-cyan-600 text-white') : ttsEnabled && ttsMuted ? (darkMode ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400' : 'bg-amber-100 hover:bg-amber-200 text-amber-600') : darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'}`}
                title={ttsEnabled ? (ttsMuted ? 'Unmute TTS' : 'Mute TTS') : 'Enable TTS'}
              >
                {ttsEnabled ? (
                  ttsMuted ? <VolumeX size={18} /> : <Volume2 size={18} />
                ) : (
                  <Settings size={18} className="opacity-50" />
                )}
              </button>

              {/* TTS Settings Dropdown */}
              {showTtsMenu && (
                <div className={`absolute right-0 mb-2 bottom-full w-80 rounded-lg shadow-xl border z-50 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  {/* Header */}
                  <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Text-to-Speech
                      </span>
                      {isTtsSpeaking && (
                        <button
                          onClick={stopTts}
                          className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={ttsEnabled}
                        onChange={toggleTtsEnabled}
                        className="rounded text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Enable TTS
                      </span>
                    </label>
                    {ttsEnabled && (
                      <label className="flex items-center gap-3 mt-2">
                        <input
                          type="checkbox"
                          checked={!ttsMuted}
                          onChange={toggleTtsMuted}
                          className="rounded text-cyan-500 focus:ring-cyan-500"
                        />
                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Speak AI responses
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Provider Selection */}
                  {ttsEnabled && (
                    <div className={`p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        TTS Provider
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setVoiceProvider('browser')}
                          className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                            voiceProvider === 'browser'
                              ? 'bg-cyan-600 text-white border-cyan-600'
                              : darkMode
                                ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          <div className="font-medium">Browser</div>
                          <div className={`text-[10px] ${voiceProvider === 'browser' ? 'text-cyan-100' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>OS Voices</div>
                        </button>
                        <button
                          onClick={() => {
                            if (isPiperAvailable) {
                              setVoiceProvider('piper')
                            } else {
                              checkPiperStatus()
                            }
                          }}
                          className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                            voiceProvider === 'piper'
                              ? 'bg-cyan-600 text-white border-cyan-600'
                              : isPiperAvailable
                                ? darkMode
                                  ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                : darkMode
                                  ? 'bg-gray-700 text-gray-500 border-gray-600 opacity-60'
                                  : 'bg-gray-100 text-gray-400 border-gray-300 opacity-60'
                          }`}
                        >
                          <div className="font-medium">Piper</div>
                          <div className={`text-[10px] ${voiceProvider === 'piper' ? 'text-cyan-100' : isPiperAvailable ? (darkMode ? 'text-gray-500' : 'text-gray-400') : 'text-red-400'}`}>
                            {isPiperAvailable ? 'Local TTS' : 'Not running'}
                          </div>
                        </button>
                      </div>
                      {voiceProvider === 'piper' && !isPiperAvailable && (
                        <div className={`mt-2 text-[10px] p-2 rounded ${darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
                          Start Piper server on port 5001
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voice List - Browser */}
                  {ttsEnabled && voiceProvider === 'browser' && (
                    <div className="max-h-48 overflow-y-auto p-2">
                      {isLoadingVoices ? (
                        <div className={`p-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading voices...
                        </div>
                      ) : availableVoices.length > 0 ? (
                        availableVoices.map(voice => (
                          <div
                            key={voice.id}
                            onClick={() => handleVoiceSelect(voice.id)}
                            className={`px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                            } ${preferredVoice === voice.id ? (darkMode ? 'bg-cyan-600/30 text-cyan-400' : 'bg-cyan-100 text-cyan-700') : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}
                          >
                            <div className="font-medium">{voice.name}</div>
                            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {voice.lang} {voice.default && '• Default'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={`p-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No voices available
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voice List - Piper */}
                  {ttsEnabled && voiceProvider === 'piper' && (
                    <div className="max-h-48 overflow-y-auto p-2">
                      {availablePiperModels.length > 0 ? (
                        availablePiperModels.map(model => (
                          <div
                            key={model.id}
                            onClick={() => handleVoiceSelect(model.id)}
                            className={`px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                            } ${preferredVoice === model.id ? (darkMode ? 'bg-cyan-600/30 text-cyan-400' : 'bg-cyan-100 text-cyan-700') : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}
                          >
                            <div className="font-medium">{model.name}</div>
                            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {model.language} • {model.quality} quality
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={`p-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading Piper voices...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message Input Row */}
          <div className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  isVoiceActiveState
                    ? (voiceMode === 'push-to-talk' 
                        ? (isRecording ? 'Speak now... (release to send)' : 'Hold mic button to record')
                        : (isRecording ? 'Speak now...' : 'Listening...'))
                    : 'Type your message...'
                }
                className={`w-full border rounded-lg p-3 pr-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] max-h-[120px] transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} ${
                  isVoiceActiveState
                    ? (isRecording ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-red-500 ring-2 ring-red-500/20')
                    : ''
                }`}
                rows={1}
                disabled={isVoiceActiveState && !isRecording}
              />

              {/* Voice Status Indicator with Waveform */}
              {isVoiceActiveState && (
                <div className="absolute top-2 right-2 flex items-center space-x-2">
                  {/* Waveform bars */}
                  {audioLevel > 0 && (
                    <div className="flex items-center gap-0.5">
                      <div className="w-1 bg-orange-500 rounded-full animate-pulse" style={{ height: `${Math.min(20, audioLevel / 5)}px` }} />
                      <div className="w-1 bg-orange-500 rounded-full animate-pulse" style={{ height: `${Math.min(20, audioLevel / 4)}px`, animationDelay: '0.1s' }} />
                      <div className="w-1 bg-orange-500 rounded-full animate-pulse" style={{ height: `${Math.min(20, audioLevel / 3)}px`, animationDelay: '0.2s' }} />
                    </div>
                  )}
                  <span className={`text-xs ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                    {isRecording ? 'Recording...' : 'Listening...'}
                  </span>
                </div>
              )}

              {/* Quick Provider Info */}
              {selectedProvider && !isVoiceActiveState && (
                <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                  <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-500 bg-gray-100'}`}>
                    {providers.find(p => p.id === selectedProvider)?.name || 'Provider'}
                    {selectedModel && ' • ' + (models[selectedProvider]?.find(m => m.id === selectedModel)?.name || 'Model')}
                  </span>
                </div>
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </div>

          {/* Voice Mode Hint */}
          {isVoiceActiveState && (
            <div className={`mt-2 text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {voiceMode === 'push-to-talk'
                ? 'Hold mic button to record • Release to send'
                : 'Speak to send • Auto-sends after 1.5s silence'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatArea
