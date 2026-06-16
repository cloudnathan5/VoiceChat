import React, { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import SettingsPanel from './components/SettingsPanel'
import { useChatStore } from './stores/chatStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})

function App() {
  const { activeThread, setProviders, setThreads, darkMode, addThread, setActiveThread, showSettings, setShowSettings } = useChatStore()

  useEffect(() => {
    // Load providers and threads on app startup
    const loadData = async () => {
      try {
        const [providersResponse, threadsResponse] = await Promise.all([
          fetch('/api/providers'),
          fetch('/api/threads')
        ])

        if (providersResponse.ok) {
          const providers = await providersResponse.json()
          setProviders(providers)
        }

        if (threadsResponse.ok) {
          const threads = await threadsResponse.json()
          setThreads(threads)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      }
    }

    loadData()
  }, [setProviders, setThreads])

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <QueryClientProvider client={queryClient}>
      <div className={`flex h-screen font-inter ${
        darkMode ? 'bg-gray-950' : 'bg-white'
      }`}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {showSettings ? (
            <SettingsPanel />
          ) : activeThread ? (
            <ChatArea />
          ) : (
            <div className={`flex-1 flex items-center justify-center ${
              darkMode ? 'bg-gray-900' : 'bg-gray-50'
            }`}>
              <div className="text-center max-w-md px-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  darkMode ? 'bg-gray-800' : 'bg-blue-100'
                }`}>
                  <svg className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h1 className={`text-2xl font-semibold mb-2 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>VoiceChat</h1>
                <p className={`mb-6 ${
                  darkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Select a conversation or create a new one to start chatting with AI
                </p>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/threads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          title: 'New Conversation',
                          providerId: null
                        })
                      })

                      if (response.ok) {
                        const newThread = await response.json()
                        addThread(newThread)
                        setActiveThread(newThread)
                      }
                    } catch (error) {
                      console.error('Failed to create new chat:', error)
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Create New Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App