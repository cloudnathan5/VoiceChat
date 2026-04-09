import React from 'react'
import { Copy, User } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

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

  const formatContent = (content) => {
    // Simple markdown-like formatting for code blocks
    return content.split('```').map((part, index) => {
      if (index % 2 === 1) {
        // Code block
        return (
          <pre key={index} className={`border rounded p-3 my-2 overflow-x-auto ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300'
          }`}>
            <code className={`text-sm font-mono ${
              darkMode ? 'text-gray-200' : 'text-gray-800'
            }`}>{part}</code>
          </pre>
        )
      }
      // Regular text with line breaks
      return part.split('\n').map((line, lineIndex) => (
        <span key={lineIndex}>
          {line}
          {lineIndex < part.split('\n').length - 1 && <br />}
        </span>
      ))
    })
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-lg p-4 relative ${
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
            <span className={`text-sm font-medium ${isUser ? 'text-white' : darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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
        <div className="max-w-none">
          <div className="text-sm leading-relaxed">
            {message.isStreaming ? (
              <div>
                {/* Show accumulated thinking tokens if available */}
                {message.thinking && (
                  <div className="mb-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-xs italic whitespace-pre-wrap">
                    💭 {message.thinking}
                  </div>
                )}
                {/* Show streaming content if available */}
                {message.content && message.content.length > 0 && (
                  <div className="mb-2">
                    {formatContent(message.content)}
                  </div>
                )}
                {/* Show thinking animation */}
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    {[1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="w-1 bg-gray-400 rounded-full animate-pulse"
                        style={{
                          height: `${Math.random() * 8 + 4}px`,
                          animationDelay: `${i * 0.1}s`
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-gray-500">Thinking...</span>
                </div>
              </div>
            ) : (
              formatContent(message.content)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MessageBubble