Fix the VoiceChat demo (demo/app.js) to match the actual webapp's dark-mode styling exactly. The webapp uses:

**Backgrounds:**
- Root: bg-gray-950 (not bg-black)
- Sidebar: bg-gray-900 (not bg-gray-900 - this matches)
- Messages area: bg-gray-900 (not bg-gray-50)
- Input area: bg-gray-900 (not bg-white)
- Header: bg-gray-900 (not bg-white)
- Active thread in sidebar: bg-gray-800 (matches)

**Interactive elements (dark mode):**
- Dropdowns: bg-gray-800 border-gray-700 text-white (not white)
- Textarea: bg-gray-800 border-gray-700 (not white)
- Voice status bar: bg-orange-600/20 (not bg-orange-100)
- TTS status bar: bg-cyan-600/20 (not bg-cyan-100)
- Voice mode buttons: bg-gray-800 (not bg-gray-100)
- Voice chat button: bg-gray-800 (not bg-gray-100)
- TTS button: bg-gray-800 (not bg-gray-100)
- Collapse mode: shows "+N more" when threads > 5
- Message bubble: bg-blue-600 for user, bg-gray-800 for AI (matches)
- AI message header text: text-gray-400 (not text-gray-300)
- User message header: text-white (not text-gray-300)

**Other differences:**
- Sidebar collapse mode shows a "+N more" indicator when threads > 5
- The "Thinking..." text color in streaming AI messages
- The sidebar collapse mode shows the message square icon, and the active thread has blue-400 text

Key changes needed:
1. Change root bg to bg-gray-950
2. Change messages area bg to bg-gray-900
3. Change input area bg to bg-gray-900
4. Change header bg to bg-gray-900
5. Change dropdown bg to bg-gray-800 border-gray-700
6. Change textarea bg to bg-gray-800 border-gray-700
7. Change voice status bar to bg-orange-600/20
8. Change TTS status bar to bg-cyan-600/20
9. Change voice mode buttons to bg-gray-800
10. Change voice chat button to bg-gray-800
11. Change TTS button to bg-gray-800
12. Add "+N more" indicator in collapsed sidebar
13. Fix header text colors (AI=gray-400, User=white)
14. Fix thinking indicator colors

Write the complete new app.js file.