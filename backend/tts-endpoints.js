// TTS REST Endpoints for Server
// Supports both Browser Web Speech API (client-side) and Piper TTS (server-side)

import { piperService } from './tts/server.js';

// Piper server connection config (will be loaded from DB)
let piperServerUrl = 'http://localhost:5002';

/**
 * Adds TTS endpoints to the Express app
 * @param {import('express').Express} app - Express application
 * @param {import('./database.js').default} db - Database instance
 */
export function addTtsEndpoints(app, db) {
  // Helper to get current piper URL
  const getPiperUrl = () => {
    const host = db.getSetting('tts_piper_host') || 'localhost';
    const port = db.getSetting('tts_piper_port') || '5002';
    return `http://${host}:${port}`;
  };

  // TTS Configuration endpoints for settings storage
  app.get('/api/tts/settings', (req, res) => {
    try {
      const enabled = db.getSetting('tts_enabled') === 'true';
      const muted = db.getSetting('tts_muted') === 'true';
      const preferredVoice = db.getSetting('tts_preferred_voice') || null;
      const voiceProvider = db.getSetting('tts_voice_provider') || 'browser';
      const piperHost = db.getSetting('tts_piper_host') || 'localhost';
      const piperPort = db.getSetting('tts_piper_port') || '5002';
      const piperEnabled = db.getSetting('tts_piper_enabled') === 'true';
      const piperModel = db.getSetting('tts_piper_model') || 'en_US-lessac-medium';

      piperServerUrl = getPiperUrl();

      res.json({
        enabled,
        muted,
        preferred_voice: preferredVoice,
        voice_provider: voiceProvider,
        piper: {
          enabled: piperEnabled,
          host: piperHost,
          port: parseInt(piperPort),
          model: piperModel,
          url: piperServerUrl
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/tts/settings', (req, res) => {
    try {
      const { enabled, muted, preferred_voice, voice_provider, piper } = req.body;

      if (enabled !== undefined) {
        db.setSetting('tts_enabled', String(enabled));
      }
      if (muted !== undefined) {
        db.setSetting('tts_muted', String(muted));
      }
      if (preferred_voice !== undefined) {
        db.setSetting('tts_preferred_voice', preferred_voice || '');
      }
      if (voice_provider !== undefined) {
        db.setSetting('tts_voice_provider', voice_provider);
      }

      // Piper-specific settings
      if (piper) {
        if (piper.enabled !== undefined) {
          db.setSetting('tts_piper_enabled', String(piper.enabled));
        }
        if (piper.host) {
          db.setSetting('tts_piper_host', piper.host);
        }
        if (piper.port) {
          db.setSetting('tts_piper_port', String(piper.port));
        }
        if (piper.model) {
          db.setSetting('tts_piper_model', piper.model);
        }
        piperServerUrl = getPiperUrl();
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // TTS capabilities check
  app.get('/api/tts/capabilities', async (req, res) => {
    const piperAvailable = await piperService.isServerAvailable(piperServerUrl);

    res.json({
      providers: {
        browser: {
          supported: true,
          name: 'Browser Web Speech',
          description: 'Uses your browser/OS built-in TTS voices',
          voices: 'dynamic'
        },
        piper: {
          supported: true,
          name: 'Piper TTS',
          description: 'Neural TTS running locally via Piper server',
          available: piperAvailable,
          requires: 'Piper TTS server running locally'
        }
      },
      default: 'browser'
    });
  });

  // TTS test endpoint
  app.post('/api/tts/test', async (req, res) => {
    const { voice_provider, voice_id, text } = req.body;
    const testText = text || "Hello! This is a test of the text-to-speech system.";

    if (voice_provider === 'piper') {
      try {
        const result = await piperService.speak(testText, piperServerUrl);
        res.json({
          success: true,
          provider: 'piper',
          audio: result.audio
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          message: 'Piper server may not be running.'
        });
      }
    } else {
      res.json({
        success: true,
        provider: 'browser',
        message: 'Browser TTS test - client will handle playback',
        voice_id
      });
    }
  });

  // Piper TTS synthesis endpoint - returns audio
  app.post('/api/tts/synthesize', async (req, res) => {
    const { text, model } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    try {
      // Use model from request or default from DB
      const piperModel = model || db.getSetting('tts_piper_model') || 'en_US-lessac-medium';
      
      // Call Piper server directly
      const response = await fetch(`${piperServerUrl}/v1/audio/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`Piper returned ${response.status}`);
      }

      const result = await response.json();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
        message: 'Failed to synthesize speech. Make sure Piper server is running.'
      });
    }
  });

  // Piper server health check
  app.get('/api/tts/piper/health', async (req, res) => {
    try {
      const response = await fetch(`${piperServerUrl}/health`, {
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        res.json({
          available: true,
          ...data
        });
      } else {
        res.json({
          available: false,
          message: 'Piper server responded with error'
        });
      }
    } catch (error) {
      res.json({
        available: false,
        message: 'Piper server is not available. Make sure it is running on port 5002.'
      });
    }
  });

  // List available Piper models
  app.get('/api/tts/piper/models', async (req, res) => {
    try {
      const response = await fetch(`${piperServerUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        res.json(data);
      } else {
        res.json({ models: [] });
      }
    } catch (error) {
      res.json({ models: [] });
    }
  });

  console.log('[TTS] Endpoints registered (Browser + Piper)');
}

// Export piper service for use elsewhere
export { piperService };