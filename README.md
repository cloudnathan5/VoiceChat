# VoiceChat

Aesthetic AI chat interface with real-time bidirectional voice capabilities. Supports configurable providers including custom OpenAI-compatible endpoints.

## Features

- 🎨 **Aesthetic Interface**: Dark theme with orange/cyan accents
- 🗣️ **Voice Chat**: Real-time bidirectional voice communication
- 🔧 **Configurable Providers**: Support for OpenAI, Anthropic, Google, and custom endpoints
- 📚 **Persistent Threads**: SQLite-backed conversation history
- ⚡ **Low Latency**: WebRTC and Web Audio API for responsive voice
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile

## Architecture

```
VoiceChat/
├── backend/           # Node.js + Express + Socket.io
│   ├── server.js     # Main server
│   ├── database.js    # SQLite database manager
│   └── package.json
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   ├── index.html
│   └── package.json
└── package.json       # Root package with scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

### Running the Application

Start both frontend and backend:
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:4001
- Frontend development server on http://localhost:3001

### Manual Start

If you want to run them separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

## Configuration

### Adding AI Providers

1. Click the settings button (bottom-right gear icon)
2. Click "Add Provider"
3. Fill in:
   - **Name**: Provider name (e.g., "OpenAI", "Custom Endpoint")
   - **Base URL**: API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your provider API key

### Supported Providers

- **OpenAI**: `https://api.openai.com/v1`
- **Anthropic Claude**: `https://api.anthropic.com/v1`
- **Google Gemini**: `https://generativelanguage.googleapis.com/v1`
- **Custom**: Any OpenAI-compatible endpoint

## Voice Chat Features

### Current Implementation

- Microphone access and basic recording
- Voice activity visualization
- Push-to-talk mode

### Planned Features

- Real-time speech-to-text streaming
- Text-to-speech with natural voice
- Low-latency WebRTC communication
- Voice activity detection
- Conversation turn-taking

## Development

### Project Structure

- `backend/`: Node.js server with Express and Socket.io
- `frontend/`: React application with Vite
- Uses SQLite for persistence
- Zustand for state management
- React Query for API calls

### Adding New Features

1. **Backend API**: Add routes to `backend/server.js`
2. **Frontend Store**: Update `frontend/src/stores/chatStore.ts`
3. **Components**: Create new components in `frontend/src/components/`
4. **Types**: Define TypeScript interfaces in `frontend/src/types/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.