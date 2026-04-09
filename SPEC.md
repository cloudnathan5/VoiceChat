# VoiceChat - AI Chat Interface with Voice Capabilities

## Project Overview

**Project Name:** VoiceChat
**Type:** Web Application (React + Node.js)
**Core Functionality:** Aesthetic AI chat interface with real-time bidirectional voice communication, configurable LLM providers, and persistent conversation threads.
**Target Users:** Developers and power users who want a unified interface for chatting with various AI models via text or voice.

---

## UI/UX Specification

### Layout Structure

**Desktop (≥1024px)**
- Sidebar (280px fixed): Thread list, provider settings, model selector
- Main area (fluid): Chat interface with messages and input
- Minimal header with app title and connection status

**Tablet (768px-1023px)**
- Collapsible sidebar (hamburger menu)
- Full-width chat when sidebar hidden

**Mobile (<768px)**
- Bottom navigation or slide-out panel for threads/settings
- Full-screen chat interface

### Visual Design

**Color Palette**
- Background Primary: `#0D0D0D` (near black)
- Background Secondary: `#161616` (dark charcoal)
- Background Tertiary: `#1F1F1F` (card/panel backgrounds)
- Accent Primary: `#FF6B35` (warm orange - voice activation, highlights)
- Accent Secondary: `#00D9FF` (cyan - AI messages, links)
- Accent Tertiary: `#A855F7` (purple - user messages accent)
- Text Primary: `#FAFAFA` (near white)
- Text Secondary: `#A1A1A1` (muted gray)
- Text Tertiary: `#6B6B6B` (placeholder, timestamps)
- Success: `#22C55E` (green - connected, sending)
- Error: `#EF4444` (red - errors)
- Border: `#2A2A2A`

**Typography**
- Font Family: `"JetBrains Mono", "Fira Code", monospace` for code/technical
- Font Family: `"Outfit", "DM Sans", sans-serif` for UI text
- Headings: 24px (h1), 18px (h2), 14px (h3)
- Body: 15px
- Small: 13px
- Line Height: 1.6

**Spacing System**
- Base unit: 4px
- XS: 4px, S: 8px, M: 16px, L: 24px, XL: 32px, XXL: 48px

**Visual Effects**
- Glassmorphism on modals/overlays: `backdrop-filter: blur(12px)`
- Subtle glow on active elements: `box-shadow: 0 0 20px rgba(255, 107, 53, 0.3)`
- Smooth transitions: `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- Message appear animation: fade-in + slide-up (200ms)
- Voice waveform visualization: animated bars during voice activity

### Components

**1. Sidebar**
- Logo/App name at top
- "New Chat" button (prominent)
- Thread list with:
  - Thread title (truncated)
  - Last message preview (truncated)
  - Timestamp (relative: "2m ago", "1h ago")
  - Delete button on hover
- Provider Settings button (gear icon)
- Active provider indicator

**2. Provider Settings Modal**
- Provider dropdown (OpenAI, Anthropic, Google, Custom)
- Custom endpoint URL input (for OpenAI-compatible)
- API Key input (password field with show/hide toggle)
- "Test Connection" button
- Save/Cancel buttons

**3. Model Selector**
- Dropdown in header or sidebar
- Shows provider name + model name
- Refreshes models from provider on click
- Loading state while fetching

**4. Chat Area**
- Message list (scrollable)
- User messages: right-aligned, purple accent background
- AI messages: left-aligned, dark background
- Code blocks: syntax highlighted, copy button
- Streaming indicator (animated dots)
- Timestamp on hover

**5. Chat Input**
- Multi-line text input (auto-grow, max 200px)
- Send button ( Enter to send, Shift+Enter for new line)
- Voice button (microphone icon)
- Stop button (during AI response)
- Character count (optional)

**6. Voice Chat UI**
- Floating voice indicator when active
- Pulsing animation when listening
- Waveform visualization (frequency bars)
- Latency indicator (ms)
- Push-to-talk or voice activation mode toggle
- Mute/unmute button

**7. Settings/Config Panel**
- Theme toggle (dark mode only for now, but ready for light)
- Voice settings: sensitivity, auto-activate
- TTS settings (future)
- Clear conversations button

---

## Functionality Specification

### Core Features

**1. Provider Configuration**
- Pre-configured providers: OpenAI, Anthropic (Claude), Google (Gemini), Ollama
- Custom OpenAI-compatible endpoint support
- API key storage (localStorage or encrypted)
- Connection test before saving
- Auto-detect available models on provider change

**2. Model Listing**
- Query `/models` endpoint from provider
- Parse and display all available models
- Cache model list in localStorage
- Manual refresh option
- Model capabilities indicator (if available)

**3. Conversation Threads**
- Create new thread (button + keyboard shortcut)
- List all threads in sidebar
- Switch between threads
- Rename thread (double-click title)
- Delete thread (with confirmation)
- Auto-save on every message
- Load thread history on selection
- Export thread as JSON/Markdown (future)

**4. Chat Messaging**
- Send text messages
- Receive streaming responses
- Display markdown with syntax highlighting
- Copy code blocks
- Message status (sending, sent, error)
- Retry failed messages
- Cancel in-progress response

**5. Voice Chat (Real-time Bidirectional)**
- **Input (Speech-to-Text):**
  - WebRTC for microphone access
  - Real-time transcription using provider's STT endpoint
  - Low-latency streaming (chunked audio)
  - Voice activity detection (VAD)
  - Push-to-talk or continuous mode

- **Output (Text-to-Speech):**
  - Stream TTS from provider
  - Web Audio API for playback
  - Low-latency chunked audio
  - Interrupt capability (stop current speech)
  - Volume control

- **Conversation Flow:**
  - Natural turn-taking (detect when AI finishes speaking)
  - Visual feedback during processing
  - Latency indicator
  - Connection quality indicator

**6. Persistence**
- SQLite database for threads and messages (via better-sqlite3)
- Settings in localStorage
- Provider credentials (encrypted in SQLite)

### User Interactions and Flows

**Flow 1: First Launch**
1. App loads with empty state
2. Prompt to configure provider
3. Open settings modal
4. Select provider, enter API key
5. Test connection → Save
6. Models load automatically
7. Ready to chat

**Flow 2: Send Text Message**
1. Type message in input
2. Press Enter or click Send
3. Message appears immediately (pending)
4. Streaming response begins
5. Message updates with AI response
6. Auto-scroll to new content
7. Save to thread

**Flow 3: Start Voice Chat**
1. Click microphone button
2. Grant microphone permission (if first time)
3. Voice indicator activates
4. Speak - real-time transcription shows
5. On pause detection, send to AI
6. AI response streams as text
7. TTS plays audio simultaneously
8. Continue conversation naturally

**Flow 4: Switch Thread**
1. Click thread in sidebar
2. Loading indicator
3. Messages populate
4. Continue conversation

### Edge Cases

- No API key configured → prompt to add
- Invalid API key → clear error message, don't save
- Network failure → retry with exponential backoff, show offline state
- Provider rate limit → notify user, queue if appropriate
- Empty model list → suggest checking provider settings
- Microphone permission denied → show instructions to enable
- Browser doesn't support WebRTC → fallback message, text-only mode

---

## Technical Architecture

### Frontend (React + Vite)
- React 18 with hooks
- React Router for navigation
- Zustand for state management
- React Query for API calls
- Web Audio API for voice
- WebRTC for microphone

### Backend (Node.js + Express)
- Express server
- better-sqlite3 for persistence
- Proxy requests to LLM providers (hide API keys)
- Handle CORS
- WebSocket for real-time voice streaming

### Data Models

**Thread**
- id (UUID)
- title
- created_at
- updated_at
- model_id

**Message**
- id (UUID)
- thread_id (FK)
- role (user/assistant)
- content
- created_at
- model_id

**Settings**
- key
- value

---

## Acceptance Criteria

1. ✓ User can configure any OpenAI-compatible provider with custom endpoint
2. ✓ Model selector shows all models from the configured provider
3. ✓ User can create, switch, rename, and delete conversation threads
4. ✓ Messages persist across browser sessions
5. ✓ Chat streaming works with OpenAI-compatible APIs
6. ✓ Voice chat activates microphone and transcribes in real-time
7. ✓ AI responses can be spoken aloud via TTS
8. ✓ Voice conversation feels natural with low latency (<500ms perception)
9. ✓ UI is responsive and works on desktop/tablet/mobile
10. ✓ Visual design matches the specified aesthetic (dark theme, orange/cyan accents)