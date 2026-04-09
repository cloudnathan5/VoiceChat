import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import Database from './database.js'

console.log('Imports successful')

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"]
  }
})

console.log('Server objects created')

// Initialize database
const db = new Database()
console.log('Database initialized successfully')

// Middleware
app.use(cors({
  origin: "http://localhost:3001",
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))

console.log('Middleware configured')

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Provider management
app.get('/api/providers', (req, res) => {
  const providers = db.getProviders()
  res.json(providers)
})

app.post('/api/providers', (req, res) => {
  const { name, baseUrl, apiKey } = req.body
  try {
    const provider = db.saveProvider({ name, baseUrl, apiKey: apiKey || '' })
    res.json(provider)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.delete('/api/providers/:id', (req, res) => {
  const { id } = req.params
  db.deleteProvider(id)
  res.json({ success: true })
})

// Thread management
app.get('/api/threads', (req, res) => {
  const threads = db.getThreads()
  res.json(threads)
})

app.post('/api/threads', (req, res) => {
  const { title, providerId, selectedProviderId, selectedModelId } = req.body
  const thread = db.createThread(title, providerId)

  // If selected provider/model are provided, update the thread
  if (selectedProviderId || selectedModelId) {
    const updatedThread = db.updateThread(thread.id, thread.title, selectedProviderId || providerId, selectedModelId)
    res.json(updatedThread)
  } else {
    res.json(thread)
  }
})

app.put('/api/threads/:id', (req, res) => {
  const { id } = req.params
  const { title, selectedProviderId, selectedModelId } = req.body
  const thread = db.updateThread(id, title, selectedProviderId, selectedModelId)
  res.json(thread)
})

app.delete('/api/threads/:id', (req, res) => {
  const { id } = req.params
  db.deleteThread(id)
  res.json({ success: true })
})

// Message management
app.get('/api/threads/:threadId/messages', (req, res) => {
  const { threadId } = req.params
  const messages = db.getMessages(threadId)
  res.json(messages)
})

app.post('/api/threads/:threadId/messages', async (req, res) => {
  const { threadId } = req.params
  const { content, role, providerId, modelId, stream = false } = req.body

  try {
    // Save user message
    const userMessage = db.createMessage(threadId, content, role)

    // If it's a user message and we have a provider, get AI response
    if (role === 'user' && providerId) {
      const provider = db.getProvider(providerId)
      if (!provider) {
        return res.status(400).json({ error: 'Provider not found' })
      }

      // Get conversation history for this thread
      const conversationHistory = db.getMessages(threadId)

      // If streaming is requested, use streaming endpoint
      if (stream) {
        return await handleStreamingResponse(provider, conversationHistory, content, modelId, threadId, res)
      } else {
        // Call the actual AI provider with conversation history
        let aiResponse
        try {
          aiResponse = await callAIProvider(provider, conversationHistory, content, modelId)
        } catch (error) {
          aiResponse = `Error calling AI provider: ${error.message}`
        }

        // Save AI response
        const aiMessage = db.createMessage(threadId, aiResponse, 'assistant')

        // Return both messages
        res.json({ userMessage, aiMessage })
      }
    } else {
      res.json(userMessage)
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Function to handle streaming responses
async function handleStreamingResponse(provider, conversationHistory, currentMessage, modelId, threadId, res) {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  })

  try {
    // Send initial event
    res.write('event: start\ndata: {}\n\n')


    // Call streaming AI provider
    const fullResponse = await callAIProviderStreaming(provider, conversationHistory, currentMessage, modelId, res)

    // Save the complete response to database
    const aiMessage = db.createMessage(threadId, fullResponse, 'assistant')

    // Send completion event
    res.write(`event: complete\ndata: ${JSON.stringify({ message: aiMessage })}\n\n`)
    res.end()
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
    res.end()
  }
}

// Function to call actual AI providers with streaming
async function callAIProviderStreaming(provider, conversationHistory, currentMessage, modelId, res) {
  let endpoint = '/chat/completions'
  let headers = {
    'Authorization': `Bearer ${provider.api_key}`,
    'Content-Type': 'application/json'
  }

  // Prepare conversation history for AI providers
  const messages = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content
  }))

  // Add current message to the conversation
  messages.push({ role: 'user', content: currentMessage })

  let body = {
    model: modelId || 'gpt-3.5-turbo',
    messages: messages,
    max_tokens: 500,
    stream: true
  }

  // Handle different provider configurations
  if (provider.name.toLowerCase().includes('anthropic')) {
    endpoint = '/v1/messages'
    headers = {
      'x-api-key': provider.api_key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }
    body = {
      model: modelId || 'claude-3-sonnet-20240229',
      messages: messages,
      max_tokens: 500,
      stream: true
    }
  }
  else if (provider.name.toLowerCase().includes('nvidia')) {
    endpoint = '/v1/chat/completions'
    headers = {
      'Authorization': `Bearer ${provider.api_key}`,
      'Content-Type': 'application/json'
    }
    body.stream = true
  }

  const response = await fetch(`${provider.base_url}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}: ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullResponse = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            let content = ''
            let thinking = ''

            if (provider.name.toLowerCase().includes('anthropic')) {
              content = data.content?.[0]?.text || ''
              // Anthropic thinking tokens
              thinking = data.thinking || data.reasoning || data.content?.[0]?.thinking || ''
            } else {
              content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || ''
              // Comprehensive thinking token detection for various providers
              thinking = data.choices?.[0]?.delta?.thinking ||
                        data.thinking ||
                        data.reasoning ||
                        data.choices?.[0]?.delta?.reasoning ||
                        data.content?.[0]?.thinking ||
                        data.delta?.thinking ||
                        data.choices?.[0]?.delta?.internal_reasoning ||
                        data.internal_reasoning ||
                        ''

            // Special handling for Qwen models which often have thinking tokens
            if (modelId && (modelId.toLowerCase().includes('qwen') || modelId.toLowerCase().includes('qwen2'))) {
              console.log('Qwen model detected, checking for thinking tokens...')
              // Qwen models might use different field names
              thinking = thinking || data.choices?.[0]?.delta?.thoughts || data.thoughts || ''
            }
            }

            // Send thinking tokens if available
            if (thinking) {
              console.log('Thinking token detected:', thinking)
              res.write(`event: thinking\ndata: ${JSON.stringify({ content: thinking })}\n\n`)
            } else {
              // Debug: log the raw data structure to see what's available
              console.log('No thinking token detected, data structure:', JSON.stringify(data).substring(0, 500))
            }

            // Send content tokens if available
            if (content) {
              fullResponse += content
              res.write(`event: token\ndata: ${JSON.stringify({ content })}\n\n`)
            }
          } catch (e) {
            // Ignore parsing errors for incomplete JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullResponse
}

// Function to call actual AI providers
async function callAIProvider(provider, conversationHistory, currentMessage, modelId) {
  let endpoint = '/chat/completions'
  let headers = {
    'Authorization': `Bearer ${provider.api_key}`,
    'Content-Type': 'application/json'
  }

  // Prepare conversation history for AI providers
  const messages = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content
  }))

  // Add current message to the conversation
  messages.push({ role: 'user', content: currentMessage })

  let body = {
    model: modelId || 'gpt-3.5-turbo',
    messages: messages,
    max_tokens: 500
  }

  // Handle different provider configurations
  if (provider.name.toLowerCase().includes('anthropic')) {
    endpoint = '/v1/messages'
    headers = {
      'x-api-key': provider.api_key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }
    body = {
      model: modelId || 'claude-3-sonnet-20240229',
      messages: messages,
      max_tokens: 500
    }
  }
  else if (provider.name.toLowerCase().includes('nvidia')) {
    endpoint = '/v1/chat/completions'
    headers = {
      'Authorization': `Bearer ${provider.api_key}`,
      'Content-Type': 'application/json'
    }
  }

  const response = await fetch(`${provider.base_url}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  // Parse response based on provider
  if (provider.name.toLowerCase().includes('anthropic')) {
    return data.content?.[0]?.text || 'No response text found'
  } else {
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || 'No response text found'
  }
}

// Model listing from provider
app.get('/api/providers/:id/models', async (req, res) => {
  const { id } = req.params
  try {
    const provider = db.getProvider(id)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }

    // Handle different provider types
    let modelsEndpoint = '/models'
    let headers = {
      'Authorization': `Bearer ${provider.api_key}`,
      'Content-Type': 'application/json'
    }

    // NVIDIA specific configuration
    if (provider.name.toLowerCase().includes('nvidia')) {
      modelsEndpoint = '/v1/models'
      // NVIDIA might have different auth format
      headers = {
        'Authorization': `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json'
      }
    }
    // Anthropic specific configuration
    else if (provider.name.toLowerCase().includes('anthropic')) {
      modelsEndpoint = '/v1/models'
      headers = {
        'x-api-key': provider.api_key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
    // Google specific configuration
    else if (provider.name.toLowerCase().includes('google')) {
      modelsEndpoint = '/v1/models'
      headers = {
        'x-goog-api-key': provider.api_key,
        'Content-Type': 'application/json'
      }
    }

    // Fetch models from provider
    const url = `${provider.base_url}${modelsEndpoint}`
    console.log('Fetching models from:', url)

    // Validate URL
    if (!provider.base_url || provider.base_url === 'https://api.example.com/v1' || provider.base_url.includes('example.com')) {
      return res.json([]) // Return empty array for invalid/test providers
    }

    // Skip providers without API keys (unless they're local providers like Ollama)
    if (!provider.api_key && !provider.base_url.includes('localhost') && !provider.base_url.includes('.local')) {
      return res.json([]) // Return empty array for providers without API keys
    }

    try {
      const response = await fetch(url, {
        headers,
        timeout: 10000 // 10 second timeout
      })

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

    // Parse different response formats
    let models = []
    if (Array.isArray(data)) {
      models = data
    } else if (data.data) {
      models = data.data
    } else if (data.models) {
      models = data.models
    }

      // Format models consistently
      const formattedModels = models.map(model => ({
        id: model.id,
        name: model.id, // Use ID as name if name not available
        ...model
      }))

      res.json(formattedModels)
    } catch (error) {
      console.error(`Error fetching models from ${provider.name}:`, error.message)
      res.json([]) // Return empty array instead of error
    }
  } catch (error) {
    console.error(`Error setting up request for ${provider.name}:`, error.message)
    res.json([]) // Return empty array instead of error
  }
})

// Socket.IO for real-time voice chat
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  socket.on('join-thread', (threadId) => {
    socket.join(threadId)
    console.log(`Client ${socket.id} joined thread ${threadId}`)
  })

  socket.on('voice-chunk', (data) => {
    // Handle voice chunks from client
    socket.to(data.threadId).emit('voice-chunk', data)
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 4001

server.listen(PORT, () => {
  console.log(`VoiceChat backend running on port ${PORT}`)
})

export { app, server }