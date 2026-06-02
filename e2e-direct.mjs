import { searchWeb, formatResultsForAI } from './backend/webSearch.js';

async function test() {
  // Get provider
  const providersResp = await fetch('http://localhost:4001/api/providers');
  const providers = await providersResp.json();
  const hpc = providers.find(p => p.name === 'hpc');

  // Create thread
  const threadResp = await fetch('http://localhost:4001/api/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Web Search E2E Test',
      providerId: hpc.id,
      selectedProviderId: hpc.id,
      selectedModelId: 'Qwen-3.6-Opus'
    })
  });
  const thread = await threadResp.json();
  console.log('Thread:', thread.id);

  // Simulate the full flow: user message -> model calls search -> model uses results
  const userMessage = 'breaking news today 2026';
  
  // Get current conversation
  const historyResp = await fetch(`http://localhost:4001/api/threads/${thread.id}/messages`);
  const history = await historyResp.json();
  
  // Make the API call with web search enabled
  const apiResp = await fetch(`http://localhost:4001/api/threads/${thread.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: userMessage,
      role: 'user',
      providerId: hpc.id,
      modelId: 'Qwen-3.6-Opus',
      stream: false,
      webSearchEnabled: true
    })
  });
  
  const result = await apiResp.json();
  console.log('\n=== API Response ===');
  console.log('User message:', result.userMessage.content);
  console.log('AI response:', result.aiMessage.content);
  console.log('Response length:', result.aiMessage.content.length);
  
  // Check if response contains real facts
  const content = result.aiMessage.content;
  const hasFacts = content.includes('Yardeni') ||
                   content.includes('S&P') ||
                   content.includes('Trump') ||
                   content.includes('Iran') ||
                   content.includes('Ebola') ||
                   content.includes('gaza') ||
                   content.includes('World Cup') ||
                   content.includes('Knicks') ||
                   content.includes('NBA') ||
                   content.includes('Spirit Airlines') ||
                   content.includes('Scripps') ||
                   content.includes('Spelling Bee') ||
                   content.includes('Jamie Lee Curtis') ||
                   content.includes('Freedom 250') ||
                   content.includes('ICE') ||
                   content.includes('Kennedy');
  
  console.log('\n=== Has Facts from Search ===');
  console.log('Contains real facts:', hasFacts);
  
  if (!hasFacts) {
    console.log('\nModel response was:', content);
  }
  
  // Also check the conversation history
  const finalHistory = await fetch(`http://localhost:4001/api/threads/${thread.id}/messages`);
  const finalMessages = await finalHistory.json();
  console.log('\n=== Final Conversation ===');
  for (const msg of finalMessages) {
    console.log(`[${msg.role}] ${msg.content.substring(0, 200)}`);
  }
}

test().catch(console.error);
