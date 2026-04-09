export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  createdAt: string
  updatedAt: string
}

export interface Thread {
  id: string
  title: string
  providerId?: string
  providerName?: string
  selected_provider_id?: string
  selected_provider_name?: string
  selected_model_id?: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  modelId?: string
  createdAt: string
  isStreaming?: boolean
  thinking?: string
}

export interface Model {
  id: string
  name: string
  capabilities?: string[]
}

export interface VoiceState {
  isActive: boolean
  isListening: boolean
  isSpeaking: boolean
  latency: number
  audioContext?: AudioContext
  mediaRecorder?: MediaRecorder
}