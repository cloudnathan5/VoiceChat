import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { Send, Mic, RefreshCw, Volume2, VolumeX, StopCircle, Radio, Hand, ArrowLeft } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { useTTS } from '../hooks/useTTS'
import MessageBubble from './MessageBubble'
import SearchableSelect from './SearchableSelect'

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
    showSettings,
    setShowSettings,
    voiceState,
    updateVoiceState
  } = useChatStore()

  const [inputText, setInputText] = useState('')
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [modelError, setModelError] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

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
    isLoadingVoices,
    isSpeaking: isTtsSpeaking,
    isSupported: isTtsSupported,
    ttsEnabled,
    preferredVoice,
    setPreferredVoice,
    speak,
    startStreamingTTS,
    feedStreamingTTS,
    completeStreamingTTS,
    stop: stopTts,
    toggleTtsEnabled,
  } = useTTS()

  // Grow the composer to fit what's been typed, up to the max height its class
  // list sets — past that it scrolls instead. A textarea does not do this on
  // its own: without measuring, `rows={1}` and `min-h` pinned the box at two
  // lines and everything after that scrolled inside a 60px window.
  //
  // Layout effect rather than effect: measuring after paint makes the box
  // visibly jump a frame behind the caret.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    // 'auto' first, so the box can shrink again when text is deleted —
    // scrollHeight never reports less than the current height.
    textarea.style.height = 'auto'
    // scrollHeight covers content and padding but not the border, which
    // border-box sizing includes; without it the box is 2px short and scrolls.
    const borders = textarea.offsetHeight - textarea.clientHeight
    textarea.style.height = `${textarea.scrollHeight + borders}px`
  }, [inputText])

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

  // Load a provider's model list, reporting why if it doesn't work.
  //
  // This used to be four copies of the same fetch, each swallowing failures
  // into console.error. Combined with a backend that answered a failed lookup
  // with a plausible-looking stub list, a wrong URL or a rejected key looked
  // exactly like success right up until the first message failed.
  const loadModels = useCallback(async (providerId) => {
    if (!providerId) return
    setIsRefreshing(true)
    setModelError('')
    try {
      const response = await fetch(`/api/providers/${providerId}/models`)
      const data = await response.json()
      if (!response.ok) {
        setModelError(data?.error || `Could not list models (HTTP ${response.status}).`)
        setProviderModels(providerId, [])
        return
      }
      setProviderModels(providerId, Array.isArray(data) ? data : [])
    } catch (error) {
      setModelError(error?.message || 'Could not list models.')
      setProviderModels(providerId, [])
    } finally {
      setIsRefreshing(false)
    }
  }, [setProviderModels])

  // Restore last-used provider/model on mount (if no thread is active yet)
  useEffect(() => {
    if (!providers.length) return
    const lastProviderId = useChatStore.getState().lastUsedProviderId
    const lastModelId = useChatStore.getState().lastUsedModelId
    if (lastProviderId) {
      setSelectedProvider(lastProviderId)
      setSelectedModel(lastModelId || '')
      loadModels(lastProviderId)
    }
  }, [])

  // Restore model selection when thread changes
  useEffect(() => {
    if (activeThread) {
      const providerId = activeThread.selected_provider_id || activeThread.provider_id || ''
      setSelectedProvider(providerId)
      setSelectedModel(activeThread.selected_model_id || '')
      loadModels(providerId)
    }
  }, [activeThread, loadModels])

  const handleVoiceSelect = (voiceId) => {
    setPreferredVoice(voiceId)
  }

  // Turning speech off should also silence what is already mid-sentence,
  // rather than letting the current reply finish talking over the decision.
  const handleToggleTts = () => {
    if (ttsEnabled) stopTts()
    toggleTtsEnabled()
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
    if (useChatStore.getState().ttsEnabled) {
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
        if (useChatStore.getState().ttsEnabled) {
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
        if (useChatStore.getState().ttsEnabled && fullContent.trim()) {
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
        // Opening the mic is not an interruption. Aborting the reply and
        // cutting off speech here meant switching to voice killed whatever was
        // being said even if the user then sat in silence. Barge-in is already
        // handled below, on the first transcribed word — that is the signal
        // that someone actually started talking.
        resetInterruptFlag()
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
  const handleRefreshModels = () => loadModels(selectedProvider)

  const handleProviderChange = async (newProviderId) => {
    setSelectedProvider(newProviderId)
    setSelectedModel('')
    setLastUsedSelections(newProviderId, '')

    await loadModels(newProviderId)

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

  const handleModelChange = async (newModelId) => {
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

  // Option lists for the pickers. Memoised because this component re-renders on
  // every streamed token and a model list can run to several hundred entries.
  const providerOptions = useMemo(
    () =>
      (providers || []).map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.baseUrl || provider.base_url || '',
      })),
    [providers],
  )

  const voiceOptions = useMemo(
    () =>
      availableVoices.map((voice) => ({
        value: voice.id,
        label: voice.name,
        hint: [voice.lang, voice.default ? 'Default' : ''].filter(Boolean).join(' • '),
      })),
    [availableVoices],
  )

  // The id is worth showing under the name: OpenRouter labels a model
  // "Google: Gemma 4 26B A4B" but wants "google/gemma-4-26b-a4b" on the wire,
  // and searching either one should find it.
  const modelOptions = useMemo(
    () =>
      (models[selectedProvider] || []).map((model) => {
        const label = model.name || model.id
        return { value: model.id, label, hint: model.id === label ? '' : model.id }
      }),
    [models, selectedProvider],
  )

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
      <div className={`app-header border-b px-6 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {showSettings ? 'Settings' : activeThread.title}
            </h2>
            {!showSettings && activeThread.providerName && (
              <p className={darkMode ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>
                {activeThread.providerName}
              </p>
            )}
          </div>
          {showSettings && (
            <button
              onClick={() => setShowSettings(false)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
              title="Close settings"
            >
              <ArrowLeft size={18} />
            </button>
          )}

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
            <SearchableSelect
              className="flex-1 max-w-[180px]"
              ariaLabel="Provider"
              darkMode={darkMode}
              value={selectedProvider}
              options={providerOptions}
              onChange={handleProviderChange}
              placeholder="Provider"
              searchPlaceholder="Search providers"
              emptyMessage="No providers match"
            />

            {/* Model Selector */}
            <SearchableSelect
              className="flex-1 max-w-[180px]"
              ariaLabel="Model"
              darkMode={darkMode}
              value={selectedModel}
              options={modelOptions}
              onChange={handleModelChange}
              disabled={!selectedProvider}
              placeholder="Model"
              searchPlaceholder="Search models"
              emptyMessage={selectedProvider ? 'No models match' : 'Select a provider first'}
            />

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

            {/* Speech Toggle — one control, like the mic button beside it.
                This was a dropdown holding "Enable TTS" and "Speak AI
                responses", two checkboxes for what is really one decision:
                enabled-but-silent is not a state anyone wants. */}
            <button
              onClick={handleToggleTts}
              disabled={!isTtsSupported}
              aria-pressed={ttsEnabled}
              className={`p-2 rounded-lg transition-colors relative disabled:opacity-50 disabled:cursor-not-allowed ${
                ttsEnabled
                  ? darkMode
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                    : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                  : darkMode
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
              }`}
              title={
                !isTtsSupported
                  ? 'This browser cannot speak replies'
                  : ttsEnabled
                    ? 'Stop speaking replies'
                    : 'Speak replies aloud'
              }
            >
              {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {isTtsSpeaking && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
              )}
            </button>

            {/* Voice Selector */}
            <SearchableSelect
              className="flex-1 max-w-[150px]"
              ariaLabel="Voice"
              darkMode={darkMode}
              value={preferredVoice || ''}
              options={voiceOptions}
              onChange={handleVoiceSelect}
              disabled={!isTtsSupported || voiceOptions.length === 0}
              placeholder={isLoadingVoices ? 'Voices...' : voiceOptions.length ? 'Voice' : 'No voices'}
              searchPlaceholder="Search voices"
              emptyMessage="No voices match"
            />
          </div>

          {/* Why the model list is empty — silence here used to leave people
              staring at an empty dropdown with no idea what was wrong. */}
          {modelError && (
            <div
              className={`mb-3 text-xs px-3 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
              role="status"
            >
              {modelError}
            </div>
          )}

          {/* Message Input Row */}
          <div className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
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
                className={`w-full border rounded-lg p-3 pr-24 resize-none overflow-y-auto scrollbar-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] max-h-[200px] transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} ${
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
