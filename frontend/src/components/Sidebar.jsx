import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Settings, MessageSquare, X, TestTube, Moon, Sun } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

function Sidebar() {
const { threads, activeThread, setActiveThread, addThread, removeThread, providers, addProvider, removeProvider, setProviderModels, lastUsedProviderId, lastUsedModelId, darkMode, toggleDarkMode } = useChatStore()
const [isOpen, setIsOpen] = useState(false)
const [isAdding, setIsAdding] = useState(false)
const [isTesting, setIsTesting] = useState(false)
const [formData, setFormData] = useState({ name: '', baseUrl: '', apiKey: '' })
const [isCollapsed, setIsCollapsed] = useState(false)

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

useEffect(() => { if (isOpen) refreshModels() }, [isOpen])

const handleNewThread = async (e) => {
e?.preventDefault()
e?.stopPropagation()
const title = `Chat ${threads.length + 1}`
const defaultProvider = lastUsedProviderId || (providers.length > 0 ? providers[0].id : null)
try {
const response = await fetch('/api/threads', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ title, providerId: defaultProvider, selectedProviderId: defaultProvider, selectedModelId: lastUsedModelId })
})
if (response.ok) {
const thread = await response.json()
addThread(thread)
setActiveThread(thread)
}
} catch (error) { console.error('Failed to create thread:', error) }
}

const handleDeleteThread = async (threadId, e) => {
e.stopPropagation()
if (confirm('Are you sure you want to delete this thread?')) {
try {
const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' })
if (response.ok) {
removeThread(threadId)
if (activeThread?.id === threadId) setActiveThread(null)
}
} catch (error) { alert(`Failed to delete thread: ${error.message}`) }
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
}
} catch (error) { alert('Failed to add provider') }
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
} catch (error) { alert(`Connection failed: ${error.message}`) }
finally { setIsTesting(false) }
}

const handleDeleteProvider = async (providerId) => {
if (confirm('Are you sure you want to delete this provider?')) {
try {
await fetch(`/api/providers/${providerId}`, { method: 'DELETE' })
removeProvider(providerId)
} catch (error) { alert('Failed to delete provider') }
}
}

return (
<>
<div className={`${isCollapsed ? 'w-16' : 'w-80'} border-r flex flex-col transition-all duration-300 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
<div className={`p-6 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
<div className="flex items-center justify-between">
{!isCollapsed && (
<h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>VoiceChat</h1>
)}
<div className="flex items-center gap-2">
<button onClick={() => setIsCollapsed(!isCollapsed)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
{isCollapsed ? <Plus size={20} /> : <X size={20} />}
</button>
{!isCollapsed && (
<>
<button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-yellow-400 hover:text-yellow-300 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
{darkMode ? <Sun size={20} /> : <Moon size={20} />}
</button>
<button onClick={() => setIsOpen(true)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
<Settings size={20} />
</button>
</>
)}
</div>
</div>
{!isCollapsed && (
<button onClick={handleNewThread} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium">
<Plus size={16} /> New Chat
</button>
)}
</div>
<div className="flex-1 overflow-y-auto scrollbar-hide">
{!isCollapsed && (
threads.length === 0 ? (
<div className={`p-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
<MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
<p className="text-sm">No conversations yet</p>
</div>
) : (
threads.map((thread) => (
<div key={thread.id} onClick={() => setActiveThread(thread)} className={`p-4 border-b cursor-pointer transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-200'} ${activeThread?.id === thread.id ? (darkMode ? 'bg-gray-800 border-l-4 border-blue-500' : 'bg-blue-50 border-l-4 border-blue-500') : (darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}`}>
<div className="flex items-center justify-between">
<div className="flex-1 min-w-0">
<div className={`font-medium truncate text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{thread.title}</div>
{thread.providerName && <div className={`text-xs truncate mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{thread.providerName}</div>}
<div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{thread.updatedAt && !isNaN(new Date(thread.updatedAt)) ? new Date(thread.updatedAt).toLocaleDateString() : 'Just now'}</div>
</div>
<button onClick={(e) => handleDeleteThread(thread.id, e)} className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-red-900 text-red-400' : 'hover:bg-red-100 text-red-500'}`}>
<Trash2 size={14} />
</button>
</div>
</div>
))
)
)}
{isCollapsed && (
<div className="p-4 space-y-2">
{threads.slice(0, 5).map((thread) => (
<button
key={thread.id}
onClick={() => setActiveThread(thread)}
className={`w-full p-2 rounded-lg flex items-center justify-center transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} ${activeThread?.id === thread.id ? (darkMode ? 'bg-gray-800 text-blue-400' : 'bg-blue-100 text-blue-600') : (darkMode ? 'text-gray-400' : 'text-gray-600')}`}
title={thread.title}
>
<MessageSquare size={16} />
</button>
))}
{threads.length > 5 && (
<div className={`text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
+{threads.length - 5} more
</div>
)}
</div>
)}
</div>
</div>

{isOpen && (
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
<div className={`border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
<div className={`p-6 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
<h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Provider Settings</h2>
<button onClick={() => setIsOpen(false)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
<X size={20} />
</button>
</div>
<div className={`p-6 overflow-y-auto max-h-[60vh] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
<div className="mb-6">
<button onClick={() => setIsAdding(true)} className={`w-full border rounded-lg p-4 flex items-center justify-center gap-2 transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700'}`}>
<Plus size={16} /> Add Provider
</button>
</div>
{isAdding && (
<form onSubmit={handleSubmit} className={`mb-6 p-6 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
<h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Add New Provider</h3>
<div className="space-y-4">
<div>
<label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Name</label>
<input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., OpenAI" className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`} required />
</div>
<div>
<label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Base URL</label>
<input type="url" value={formData.baseUrl} onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`} required />
</div>
<div>
<label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>API Key</label>
<input type="password" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} placeholder="sk-..." className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`} required />
</div>
</div>
<div className="flex gap-3 mt-6">
<button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors font-medium">Save</button>
<button type="button" onClick={() => setIsAdding(false)} className={`flex-1 py-2 px-4 rounded-lg transition-colors font-medium ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>Cancel</button>
</div>
</form>
)}
{providers.length === 0 ? (
<div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}><p className="text-sm">No providers configured</p></div>
) : (
<>
<div className="space-y-3">
{providers.map((provider) => (
<div key={provider.id} className={`border rounded-lg p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
<div className="flex items-center justify-between">
<div>
<div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{provider.name}</div>
<div className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{provider.base_url}</div>
</div>
<div className="flex items-center gap-2">
<button onClick={() => handleTestConnection(provider.id)} disabled={isTesting} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`} title="Test Connection">
<TestTube size={16} className={isTesting ? 'animate-pulse' : ''} />
</button>
<button onClick={() => handleDeleteProvider(provider.id)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-red-500 hover:text-red-700 hover:bg-red-100'}`} title="Delete Provider">
<X size={16} />
</button>
</div>
</div>
</div>
))}
</div>
</>
)}
</div>
</div>
</div>
)}
</>
)
}

export default Sidebar