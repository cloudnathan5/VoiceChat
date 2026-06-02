## Goal: Add VAD + Live Transcription for Real-Time Voice Conversation

The current `useVoiceChat.js` hook has basic VAD (audio level checking) and browser SpeechRecognition, but it's not a true real-time conversational flow. We need to build a proper push-to-talk / continuous mode where:
1. User speaks → VAD detects speech → live transcription appears in input → silence detected → auto-send to AI → AI response streams as text + TTS audio → wait for next user turn
2. Visual waveform visualization during listening
3. Proper interrupt handling (user can interrupt AI speech by speaking)

### Files to create/modify:

1. **`frontend/src/hooks/useVoiceChat.js`** — Major refactor:
   - Implement proper VAD with visual feedback (audio level meter)
   - Use browser SpeechRecognition for live transcription (already partially there)
   - Add push-to-talk mode toggle
   - On silence detection after speech → auto-send message to AI
   - Integrate with TTS to auto-speak AI responses
   - Auto-interrupt TTS when user starts speaking again
   - Visual waveform bars during listening

2. **`frontend/src/components/ChatArea.jsx`** — Update to use new hook:
   - Add waveform visualization in the voice indicator area
   - Show live transcript in input while listening
   - Add push-to-talk button (hold to talk)
   - Add mode toggle (continuous vs push-to-talk)
   - Better visual feedback for the conversation flow states

3. **`frontend/src/stores/chatStore.ts`** — Add voice mode state:
   - `voiceMode: 'continuous' | 'push-to-talk'`
   - `audioLevel: number` (for waveform visualization)

### Implementation checklist:
- [ ] Add `audioLevel` state to `useVoiceChat` hook for waveform visualization
- [ ] Refactor VAD to provide real-time audio level readings
- [ ] Wire up SpeechRecognition for live interim + final transcripts
- [ ] Implement silence detection timeout (1.5s of no speech = send message)
- [ ] Auto-send transcript to AI when silence detected
- [ ] Auto-speak AI response via TTS when streaming completes
- [ ] Auto-interrupt TTS when user starts speaking again
- [ ] Add waveform visualization bars in ChatArea UI
- [ ] Add push-to-talk mode (hold mic button to record, release to send)
- [ ] Add continuous mode (auto-detect speech/silence, auto-send)
- [ ] Add mode toggle in the voice controls area
- [ ] Clean up audio resources when stopping voice chat
- [ ] Ensure interrupt works both ways (user interrupts AI, AI finishes cleanly)