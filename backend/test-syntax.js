// Test the syntax of the callAIProvider function
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

  console.log('Function syntax OK')
}

console.log('Syntax test passed')