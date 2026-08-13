import React, { useMemo, useState } from 'react'
import { Plus, X, TestTube, Pencil, Eye, EyeOff, Volume2, RotateCcw } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useTTS } from '../hooks/useTTS'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TTS_PROMPT } from '../lib/prompt.js'
import SearchableSelect from './SearchableSelect'

const fieldClass = (darkMode) =>
  `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    darkMode
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`

const labelClass = (darkMode) =>
  `block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`

/**
 * Add and edit differ only in what they do with the result and in how they
 * treat a blank API key, so they share one form. On edit the stored key is
 * deliberately not loaded into the field: blank means "keep the current key",
 * which is what the PUT route assumes too.
 */
function ProviderForm({ heading, initial, submitLabel, keyRequired, keyHint, onSubmit, onCancel, darkMode }) {
  const [formData, setFormData] = useState(initial)
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      await onSubmit(formData)
    } catch (submitError) {
      // Reporting inline rather than through alert(), which gave no clue what
      // had actually gone wrong.
      setError(submitError?.message || 'Could not save this provider.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`p-5 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
    >
      <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{heading}</h3>

      <div className="space-y-4">
        <div>
          <label className={labelClass(darkMode)}>Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder="e.g., OpenAI"
            className={fieldClass(darkMode)}
            required
          />
        </div>

        <div>
          <label className={labelClass(darkMode)}>Base URL</label>
          <input
            type="url"
            value={formData.baseUrl}
            onChange={(event) => setFormData({ ...formData, baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
            className={fieldClass(darkMode)}
            required
          />
        </div>

        <div>
          <label className={labelClass(darkMode)}>API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={formData.apiKey}
              onChange={(event) => setFormData({ ...formData, apiKey: event.target.value })}
              placeholder={keyRequired ? 'sk-...' : 'Leave blank to keep the current key'}
              className={`${fieldClass(darkMode)} pr-10`}
              required={keyRequired}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${
                darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {keyHint && <p className={`mt-1.5 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{keyHint}</p>}
        </div>
      </div>

      {error && (
        <div
          className={`mt-4 text-xs px-3 py-2 rounded-lg border ${
            darkMode ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role="status"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 px-4 rounded-lg transition-colors font-medium"
        >
          {isSaving ? 'Saving...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 py-2.5 px-4 rounded-lg transition-colors font-medium ${
            darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Toggle({ checked, onChange, label, description, darkMode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="w-full flex items-start justify-between gap-4 text-left"
    >
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{label}</span>
        {description && (
          <span className={`block text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{description}</span>
        )}
      </span>
      <span
        className={`flex-shrink-0 mt-0.5 w-10 h-6 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-cyan-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

/**
 * One editable prompt. Saves as you type — there is no submit step to forget,
 * and the value is only read when the next message is sent, so a half-typed
 * prompt can't corrupt a reply in flight.
 */
function PromptField({ label, description, value, onChange, defaultValue, placeholder, darkMode }) {
  const isDefault = value === defaultValue
  const emptyDefault = defaultValue === ''

  return (
    <div className={`rounded-xl p-5 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{label}</div>
          <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{description}</div>
        </div>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          disabled={isDefault}
          title={emptyDefault ? 'Clear this prompt' : 'Restore the default wording'}
          className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <RotateCcw size={12} />
          {emptyDefault ? 'Clear' : 'Reset to default'}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={5}
        className={`w-full border rounded-lg px-3 py-2 text-sm leading-relaxed resize-y min-h-[110px] max-h-[400px] overflow-y-auto scrollbar-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          darkMode
            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
        }`}
      />

      <div className={`mt-1.5 flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
        <span>{isDefault ? 'Default' : 'Customised'}</span>
        <span className="tabular-nums">{value.length} characters</span>
      </div>
    </div>
  )
}

function PromptSettings({ darkMode }) {
  const { systemPrompt, setSystemPrompt, ttsPrompt, setTtsPrompt, ttsEnabled } = useChatStore()

  return (
    <div className="mt-12">
      <div className="mb-6">
        <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Prompts</h2>
        <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Sent ahead of every message, in every chat. Changes apply to your next message.
        </p>
      </div>

      <div className="space-y-3">
        <PromptField
          label="System prompt"
          description="Standing instructions for the model — tone, role, anything it should always do."
          value={systemPrompt}
          onChange={setSystemPrompt}
          defaultValue={DEFAULT_SYSTEM_PROMPT}
          placeholder="e.g. You are a concise assistant. Answer in plain language and say when you are unsure."
          darkMode={darkMode}
        />

        <PromptField
          label="Speech prompt"
          description={
            ttsEnabled
              ? 'Added while speech output is on, so replies are written to be heard rather than read.'
              : 'Added only while speech output is on. Speech is currently off, so this is not being sent.'
          }
          value={ttsPrompt}
          onChange={setTtsPrompt}
          defaultValue={DEFAULT_TTS_PROMPT}
          placeholder="Instructions for how replies should sound when spoken aloud."
          darkMode={darkMode}
        />
      </div>
    </div>
  )
}

/**
 * The speech controls the composer's TTS menu offers, in a shape that suits a
 * settings page. Both read the same store, so a change in either shows up in
 * the other immediately.
 */
function VoiceSettings({ darkMode }) {
  const {
    availableVoices,
    isLoadingVoices,
    isSupported,
    isSpeaking,
    ttsEnabled,
    preferredVoice,
    setPreferredVoice,
    toggleTtsEnabled,
    test,
    stop,
  } = useTTS()

  const voiceOptions = useMemo(
    () =>
      availableVoices.map((voice) => ({
        value: voice.id,
        label: voice.name,
        hint: [voice.lang, voice.default ? 'Default' : '', voice.localService ? 'On device' : 'Network']
          .filter(Boolean)
          .join(' • '),
      })),
    [availableVoices],
  )

  const card = `rounded-xl p-5 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`

  return (
    <div className="mt-12">
      <div className="mb-6">
        <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Voice Settings</h2>
        <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          How replies are spoken back to you
        </p>
      </div>

      {!isSupported ? (
        <div className={`${card} text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          This browser has no speech synthesis, so replies can't be spoken here. Chrome, Edge and Safari
          support it.
        </div>
      ) : (
        <div className="space-y-3">
          <div className={card}>
            <Toggle
              checked={ttsEnabled}
              onChange={toggleTtsEnabled}
              label="Speak AI responses"
              description="Read replies aloud as they stream in"
              darkMode={darkMode}
            />
          </div>

          {ttsEnabled && (
            <div className={card}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Voice</div>
                  <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    {isLoadingVoices ? 'Loading voices...' : `${availableVoices.length} available on this system`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={isSpeaking ? stop : test}
                  className={`flex-shrink-0 flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors ${
                    darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Volume2 size={14} />
                  {isSpeaking ? 'Stop' : 'Test'}
                </button>
              </div>

              {isLoadingVoices ? (
                <div className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  Waiting for the browser to report its voices...
                </div>
              ) : availableVoices.length === 0 ? (
                <div className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  No voices are installed on this system.
                </div>
              ) : (
                <SearchableSelect
                  className="w-full max-w-sm"
                  ariaLabel="Voice"
                  darkMode={darkMode}
                  value={preferredVoice || ''}
                  options={voiceOptions}
                  onChange={setPreferredVoice}
                  placeholder="System default"
                  searchPlaceholder="Search voices"
                  emptyMessage="No voices match"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingsPanel() {
  const { providers, addProvider, updateProvider, removeProvider, setProviderModels, darkMode } = useChatStore()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  const refreshModels = async (providerId) => {
    const targets = providerId ? providers.filter((p) => p.id === providerId) : providers
    for (const provider of targets) {
      try {
        const response = await fetch(`/api/providers/${provider.id}/models`)
        setProviderModels(provider.id, response.ok ? await response.json() : [])
      } catch (error) {
        setProviderModels(provider.id, [])
      }
    }
  }

  const handleAdd = async (formData) => {
    const response = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error || 'Failed to add provider.')

    addProvider(data)
    setIsAdding(false)
    await refreshModels(data.id)
  }

  const handleEdit = async (providerId, formData) => {
    const response = await fetch(`/api/providers/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error || 'Failed to save provider.')

    updateProvider(providerId, data)
    setEditingId(null)
    // The URL or the key may have changed, so the cached model list is suspect.
    await refreshModels(providerId)
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

  const iconButton = (tone) =>
    `p-2 rounded-lg transition-colors ${
      tone === 'danger'
        ? darkMode
          ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30'
          : 'text-red-500 hover:text-red-700 hover:bg-red-100'
        : darkMode
          ? 'text-gray-400 hover:text-white hover:bg-gray-700'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-white'}`}>
      <div className={`app-header border-b px-6 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Settings
            </h2>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
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
                onClick={() => {
                  setIsAdding(true)
                  setEditingId(null)
                }}
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
              <div className="mb-8">
                <ProviderForm
                  heading="Add New Provider"
                  initial={{ name: '', baseUrl: '', apiKey: '' }}
                  submitLabel="Save"
                  keyRequired
                  onSubmit={handleAdd}
                  onCancel={() => setIsAdding(false)}
                  darkMode={darkMode}
                />
              </div>
            )}

            {providers.length === 0 ? (
              <div className={`text-center py-16 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <p className="text-sm">No providers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) =>
                  editingId === provider.id ? (
                    <ProviderForm
                      key={provider.id}
                      heading={`Edit ${provider.name}`}
                      initial={{
                        name: provider.name || '',
                        baseUrl: provider.baseUrl || provider.base_url || '',
                        apiKey: '',
                      }}
                      submitLabel="Save changes"
                      keyHint="Leave blank to keep the key already stored for this provider."
                      onSubmit={(formData) => handleEdit(provider.id, formData)}
                      onCancel={() => setEditingId(null)}
                      darkMode={darkMode}
                    />
                  ) : (
                    <div
                      key={provider.id}
                      className={`rounded-xl p-5 border ${
                        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {provider.name}
                          </div>
                          <div className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {provider.baseUrl || provider.base_url}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingId(provider.id)
                              setIsAdding(false)
                            }}
                            className={iconButton()}
                            title="Edit Provider"
                            aria-label={`Edit ${provider.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleTestConnection(provider.id)}
                            disabled={isTesting}
                            className={iconButton()}
                            title="Test Connection"
                          >
                            <TestTube size={16} className={isTesting ? 'animate-pulse' : ''} />
                          </button>
                          <button
                            onClick={() => handleDeleteProvider(provider.id)}
                            className={iconButton('danger')}
                            title="Delete Provider"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            <PromptSettings darkMode={darkMode} />

            <VoiceSettings darkMode={darkMode} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
