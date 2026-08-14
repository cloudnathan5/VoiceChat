import React, { useState } from 'react'
import { Copy, User, ChevronRight, Brain } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useStickToBottom } from '../hooks/useStickToBottom'
import Markdown from './Markdown'

/**
 * The model's reasoning, kept after the answer arrives.
 *
 * This used to render only while `isStreaming` was true, so the moment a reply
 * finished the reasoning vanished from the page — it was still on the message,
 * just never displayed again. It now stays, folded away: open while the model
 * is still thinking, collapsed once there's an answer to read instead, and
 * whatever the reader last chose after that.
 */
function ReasoningBlock({ thinking, isStreaming, darkMode }) {
  const [override, setOverride] = useState(null)
  const open = override ?? Boolean(isStreaming)

  // Follow the reasoning as it is written, but only while it is being written.
  // Expanding a finished block should leave it at the first line, which is
  // where someone opening it wants to start reading.
  const { ref: scrollRef, onScroll } = useStickToBottom(thinking, {
    enabled: Boolean(isStreaming) && open,
  })

  return (
    <div
      className={`mb-2 rounded-lg border overflow-hidden ${
        darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
          darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <ChevronRight
          size={12}
          className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Brain size={12} className="flex-shrink-0" />
        <span className="font-medium">Reasoning</span>
        {isStreaming && <span className="opacity-70">thinking...</span>}
      </button>

      {open && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          data-testid="reasoning-scroll"
          className={`px-2.5 pb-2 text-xs italic whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-subtle ${
            darkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          {thinking}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const { darkMode } = useChatStore()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] min-w-0 rounded-lg p-4 relative ${
        isUser
          ? 'bg-blue-600 text-white'
          : darkMode
            ? 'bg-gray-800 border border-gray-700 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isUser ? 'bg-blue-700' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
            }`}>
              {isUser ? (
                <User size={12} className="text-white" />
              ) : (
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
              )}
            </div>
            <span className={`text-sm font-medium ${isUser ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-700'}`}>
              {isUser ? 'You' : 'AI'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className={`p-1 rounded transition-colors ${
                isUser
                  ? 'hover:bg-blue-700 text-blue-100'
                  : darkMode
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-gray-100 text-gray-500'
              }`}
              title="Copy message"
            >
              <Copy size={12} />
            </button>
            <span className={`text-xs ${
              isUser ? 'text-blue-200' : darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm leading-relaxed">
          {message.thinking && (
            <ReasoningBlock
              thinking={message.thinking}
              isStreaming={message.isStreaming}
              darkMode={darkMode}
            />
          )}

          {/* A typed message is not markdown — rendering it as such would eat
              the reader's own asterisks and underscores. Only the model's
              output gets parsed. */}
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            message.content && <Markdown content={message.content} />
          )}

          {message.isStreaming && (
            <div className="flex items-center space-x-2 mt-2">
              <div className="flex space-x-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full animate-pulse ${
                      darkMode ? 'bg-gray-500' : 'bg-gray-400'
                    }`}
                    style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <span className="text-gray-500">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
