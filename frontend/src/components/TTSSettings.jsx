import React, { useState, useEffect } from 'react'
import { Upload, Trash2, Download, RefreshCw } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

function TTSSettings() {
  const { ttsProvider, ttsVoice, ttsVoices, setTTSProvider, setTTSVoice, setTTSVoices, loadTTTSettings, loadTTSVoices } = useChatStore()
  const [coquiVoices, setCoquiVoices] = useState([])
  const [uploadName, setUploadName] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadTTTSettings()
    loadTTSVoices()
    if (ttsProvider === 'coqui') {
      loadCoquiVoices()
    }
  }, [ttsProvider])

  const loadCoquiVoices = async () => {
    const res = await fetch('/api/tts/coqui/voices')
    if (res.ok) {
      const data = await res.json()
      setCoquiVoices(data.voices)
    }
  }

  const handleProviderChange = async (provider) => {
    setTTSProvider(provider)
    await fetch('/api/tts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    })
    loadTTSVoices()
    if (provider === 'coqui') {
      loadCoquiVoices()
    }
  }

  const handleVoiceChange = async (voice) => {
    setTTSVoice(voice)
    await fetch('/api/tts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piperVoice: voice })
    })
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !uploadName) return
    setUploading(true)
    const formData = new FormData()
    formData.append('audio', file)
    formData.append('name', uploadName)
    try {
      const res = await fetch('/api/tts/coqui/voices', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        setUploadName('')
        loadCoquiVoices()
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteVoice = async (id) => {
    if (!confirm('Delete this voice sample?')) return
    await fetch(`/api/tts/coqui/voices/${id}`, {
      method: 'DELETE'
    })
    loadCoquiVoices()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Text-to-Speech</h3>

      {/* Provider Selection */}
      <div>
        <label className="text-sm text-gray-500">Provider</label>
        <select
          value={ttsProvider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full mt-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="browser">Browser (Built-in)</option>
          <option value="piper">Piper TTS (Local Neural)</option>
          <option value="coqui">Coqui XTTS (Voice Cloning)</option>
        </select>
      </div>

      {/* Piper Voice Selection */}
      {ttsProvider === 'piper' && (
        <div>
          <label className="text-sm text-gray-500">Voice</label>
          <select
            value={ttsVoice || 'en_US-lessac-medium'}
            onChange={(e) => handleVoiceChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          >
            {ttsVoices.map(voice => (
              <option key={voice.id} value={voice.id}>{voice.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Need a voice? Download Piper from GitHub and run:
            node backend/tts/download-voice.js en_US-lessac-medium
          </p>
        </div>
      )}

      {/* Coqui Voice Management */}
      {ttsProvider === 'coqui' && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500">Cloned Voices</label>
            {coquiVoices.length === 0 ? (
              <p className="text-sm text-gray-400 mt-1">No voice samples. Upload one below.</p>
            ) : (
              <div className="mt-1 space-y-1">
                {coquiVoices.map(voice => (
                  <div key={voice.id} className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                    <span className="text-sm">{voice.name}</span>
                    <button
                      onClick={() => handleDeleteVoice(voice.id)}
                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-500">Upload Voice Sample</label>
            <p className="text-xs text-gray-400">10-30 seconds of clear speech</p>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="Voice name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
              <label className="px-4 py-2 bg-blue-500 text-white rounded-md cursor-pointer hover:bg-blue-600 flex items-center gap-2">
                <Upload size={16} />
                {uploading ? 'Uploading...' : 'Choose'}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading || !uploadName}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TTSSettings