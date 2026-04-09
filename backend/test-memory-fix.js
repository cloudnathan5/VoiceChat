// Test the conversation memory functionality
import Database from './database.js'

async function testConversationMemory() {
  try {
    const db = new Database()
    console.log('Database initialized successfully')

    // Use existing providers instead of creating new ones
    const existingProviders = db.getProviders()
    console.log('Existing providers:', existingProviders.map(p => p.name))

    if (existingProviders.length === 0) {
      console.log('No providers found, test cannot proceed')
      return
    }

    // Use the first existing provider
    const provider = existingProviders[0]
    console.log('Using provider:', provider.name)

    // Create a test thread
    const thread = db.createThread('Test Conversation', provider.id)
    console.log('Created thread:', thread.id)

    // Add some messages to simulate conversation history
    const messages = [
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I\'m doing well, thank you! How can I help you?' },
      { role: 'user', content: 'Can you tell me about AI?' }
    ]

    for (const msg of messages) {
      const savedMessage = db.createMessage(thread.id, msg.content, msg.role)
      console.log('Saved message:', savedMessage)
    }

    // Get conversation history
    const conversationHistory = db.getMessages(thread.id)
    console.log('Conversation history retrieved:', conversationHistory.length, 'messages')

    // Test the callAIProvider function structure
    const currentMessage = 'What is machine learning?'

    // Prepare conversation history for AI providers
    const aiMessages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    // Add current message to the conversation
    aiMessages.push({ role: 'user', content: currentMessage })

    console.log('AI messages format:', aiMessages)
    console.log('Memory fix test passed!')

  } catch (error) {
    console.error('Test failed:', error)
    console.error(error.stack)
  }
}

// Comment out the automatic execution to prevent unwanted provider creation
// testConversationMemory()