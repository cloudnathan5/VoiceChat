#!/bin/bash
# Strict port management for VoiceChat

# Kill any processes using our ports
echo "Killing processes on ports 3001, 4001, and 5002..."
pkill -f "piper-server.py" 2>/dev/null || true
sudo lsof -ti:3001,4001,5002 | xargs sudo kill -9 2>/dev/null || true

# Wait a moment for ports to be freed
sleep 2

# Start piper TTS server on port 5002
echo "Starting piper TTS server on port 5002..."
cd /home/ubuntu/Projects/VoiceChat/backend/tts
/home/ubuntu/piper-venv/bin/python piper-server.py --models-dir /home/ubuntu/piper-models --host 0.0.0.0 --port 5002 & 2>/dev/null

# Wait for piper to start
sleep 3

# Start backend on port 4001
echo "Starting backend on port 4001..."
cd /home/ubuntu/Projects/VoiceChat/backend
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend on port 3001
echo "Starting frontend on port 3001..."
cd /home/ubuntu/Projects/VoiceChat/frontend
npm run dev &
FRONTEND_PID=$!

# Save PIDs for cleanup
echo $BACKEND_PID > /tmp/voicechat_backend.pid
echo $FRONTEND_PID > /tmp/voicechat_frontend.pid

echo "VoiceChat started!"
echo "Frontend: http://localhost:3001"
echo "Backend: http://localhost:4001"
echo "TTS Server: http://localhost:5002"

# Function to cleanup on exit
cleanup() {
  echo "Stopping VoiceChat..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  pkill -f "piper-server.py" 2>/dev/null || true
  rm -f /tmp/voicechat_backend.pid /tmp/voicechat_frontend.pid
  exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
