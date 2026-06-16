import React, { useState } from 'react'
import { Plus, Trash2, X, TestTube } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

function SettingsPanel() {
  const { providers, addProvider, removeProvider, setProviderModels, darkMode } = useChatStore()
  const [isAdding, setIsAdding] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [formData, setFormData] = useState({ name: '', baseUrl: '', apiKey: '' })

  const refreshModels = async () => {
    for (const provider of providers) {
      try {
        const response = await fetch(`/api/providers/${provider.id}/models`)
        if (response.ok) {
          const models = await response.json()
          setProviderModels(provider.id, models)
        }
      } catch (error) {
        setProviderModels(provider.id, [])
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        const provider = await response.json()
        addProvider(provider)
        setIsAdding(false)
        setFormData({ name: '', baseUrl: '', apiKey: '' })
        await refreshModels()
      }
    } catch (error) {
      alert('Failed to add provider')
    }
  }

  const handleTestConnection = async (providerId) => {
    setIsTesting(true)
    try {
      const response = await fetch(`/api/providers/${providerId}/models`)
      const data = await response.json()
      if (response.ok) {
        setProviderModels(providerId, data)
        alert(`Connection successful! Found ${data.length} models`)
      } else {
        alert(`Connection failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Connection failed: ${error.message}`)
    } finally {
      setIsTesting(false)
    }
  }

  const handleDeleteProvider = async (providerId) => {
    if (confirm('Are you sure you want to delete this provider?')) {
      try {
        await fetch(`/api/providers/${providerId}`, { method: 'DELETE' })
        removeProvider(providerId)
      } catch (error) {
        alert('Failed to delete provider')
      }
    }
  }

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-white'}`}>
      <div className={`border-b px-6 py-4 flex-shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Settings
            </h2>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className={`px-6 py-8 min-h-full ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Provider Settings
              </h2>
              <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Configure your AI providers
              </p>
            </div>

            <div className="mb-6">
              <button
                onClick={() => setIsAdding(true)}
                className={`w-full border-2 border-dashed rounded-xl p-6 flex items-center justify-center gap-2 transition-colors ${
                  darkMode
                    ? 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white hover:border-gray-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 hover:border-gray-400'
                }`}
              >
                <Plus size={20} />
                <span className="font-medium">Add Provider</span>
              </button>
            </div>

            {isAdding && (
              <form
                onSubmit={handleSubmit}
                className={`mb-8 p-6 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
              >
                <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Add New Provider
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., OpenAI"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                      required
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Base URL
                    </label>
                    <input
                      type="url"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                      required
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      API Key
                    </label>
                    <input
                      type="password"
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-lg transition-colors font-medium"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className={`flex-1 py-2.5 px-4 rounded-lg transition-colors font-medium ${
                      darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {providers.length === 0 ? (
              <div className={`text-center py-16 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <p className="text-sm">No providers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={`rounded-xl p-5 border ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {provider.name}
                        </div>
                        <div className={`text-sm truncate max-w-md ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {provider.base_url}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestConnection(provider.id)}
                          disabled={isTesting}
                          className={`p-2 rounded-lg transition-colors ${
                            darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                          title="Test Connection"
                        >
                          <TestTube size={16} className={isTesting ? 'animate-pulse' : ''} />
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(provider.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            darkMode ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-red-500 hover:text-red-700 hover:bg-red-100'
                          }`}
                          title="Delete Provider"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
