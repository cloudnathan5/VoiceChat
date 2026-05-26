#!/usr/bin/env python3
"""
Piper TTS HTTP Server

A simple HTTP server that wraps Piper TTS for VoiceChat.
Run with: python piper-server.py --model /path/to/model.onnx

API Endpoints:
- GET  /health              - Health check
- GET  /v1/models           - List available models  
- POST /v1/audio/internal   - Synthesize speech
"""

import argparse
import io
import json
import logging
import os
import sys
import wave
from pathlib import Path

# Add piper to path
sys.path.insert(0, '/home/ubuntu/piper-venv/lib/python3.12/site-packages')

from piper import PiperVoice, SynthesisConfig
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import wave
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Piper TTS Server")

# CORS middleware for VoiceChat
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
models = {}  # model_id -> {voice, config, info}
current_model_id = None
model_dir = "/home/ubuntu/piper-models"

class SynthesizeRequest(BaseModel):
    text: str
    speaker_id: int = 0
    speaking_rate: float = 1.0
    pitch: float = 1.0

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "current_model": current_model_id,
        "available_models": list(models.keys()),
        "loaded": current_model_id is not None and current_model_id in models
    }

@app.get("/v1/models")
async def list_models():
    """List available models"""
    return {
        "models": [
            {
                "id": info["id"],
                "name": info["name"],
                "language": info.get("language", "unknown"),
                "quality": info.get("quality", "unknown"),
                "speakers": info.get("num_speakers", 0),
                "is_loaded": info.get("id") == current_model_id
            }
            for info in models.values()
        ]
    }

@app.post("/v1/audio/internal")
async def synthesize(request: SynthesizeRequest):
    """Synthesize speech and return WAV audio"""
    if not current_model_id or current_model_id not in models:
        raise HTTPException(status_code=503, detail="No model loaded")
    
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        voice = models[current_model_id]["voice"]
        num_speakers = models[current_model_id].get("num_speakers", 1)
        
        # Handle speaker selection
        speaker_id = request.speaker_id
        if speaker_id >= num_speakers:
            speaker_id = 0
        
        # Create synthesis config
        length_scale = 1.0 / request.speaking_rate if request.speaking_rate > 0 else 1.0
        syn_config = SynthesisConfig(
            speaker_id=speaker_id if speaker_id > 0 else None,
            length_scale=length_scale,
            noise_scale=0.667,
            noise_w_scale=0.8
        )
        
        # Create audio buffer in WAV format
        audio_buffer = io.BytesIO()
        
        # Synthesize with Piper using synthesize_wav
        with wave.open(audio_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit audio
            wav_file.setframerate(22050)
            
            voice.synthesize_wav(
                request.text,
                wav_file,
                syn_config=syn_config
            )
        
        # Get audio bytes
        audio_buffer.seek(0)
        audio_bytes = audio_buffer.read()
        
        return {
            "success": True,
            "audio": audio_bytes.hex(),
            "format": "wav"
        }
        
    except Exception as e:
        logger.error(f"Synthesis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Piper TTS Server",
        "version": "1.0",
        "current_model": current_model_id,
        "models": list(models.keys())
    }

def load_model_from_path(model_path: Path):
    """Load a Piper voice model from path"""
    model_id = model_path.stem  # filename without extension
    
    # Find config file
    config_path = model_path.with_suffix('.onnx.json')
    if not config_path.exists():
        config_path = model_path.with_suffix('.json')
    
    logger.info(f"Loading model: {model_path}")
    if config_path.exists():
        logger.info(f"Config: {config_path}")
    
    try:
        voice = PiperVoice.load(
            str(model_path), 
            config_path=str(config_path) if config_path.exists() else None
        )
        
        # Parse config for metadata
        config_data = {}
        if config_path.exists():
            with open(config_path) as f:
                config_data = json.load(f)
        
        # Extract info
        info = {
            "id": model_id,
            "name": model_id.replace("_", " ").replace("-", " ").title(),
            "file": str(model_path),
            "language": config_data.get("espeak", {}).get("voice", "unknown"),
            "quality": config_data.get("audio", {}).get("quality", "unknown"),
            "voice": voice,
            "num_speakers": voice.config.num_speakers
        }
        
        models[model_id] = info
        logger.info(f"Model loaded: {model_id} (speakers: {voice.config.num_speakers})")
        
        return info
    except Exception as e:
        logger.error(f"Failed to load {model_path}: {e}")
        return None

def load_models_from_directory(directory: str, default_model: str = None):
    """Load all .onnx models from a directory"""
    global current_model_id
    
    dir_path = Path(directory)
    if not dir_path.exists():
        logger.warning(f"Model directory not found: {directory}")
        return
    
    loaded_models = []
    for model_file in sorted(dir_path.glob("*.onnx")):
        info = load_model_from_path(model_file)
        if info:
            loaded_models.append(info["id"])
    
    if loaded_models:
        # Set default model
        if default_model and default_model in loaded_models:
            current_model_id = default_model
        else:
            current_model_id = loaded_models[0]  # Use first model as default
        
        logger.info(f"Loaded {len(loaded_models)} models, default: {current_model_id}")
    else:
        logger.warning("No models loaded!")

def main():
    global model_dir, current_model_id
    
    parser = argparse.ArgumentParser(description="Piper TTS HTTP Server")
    parser.add_argument('--model', '-m', help="Path to ONNX model file (or directory containing .onnx files)")
    parser.add_argument('--models-dir', '-d', default='/home/ubuntu/piper-models', help="Directory containing models")
    parser.add_argument('--host', default='0.0.0.0', help="Host to bind to")
    parser.add_argument('--port', '-p', type=int, default=5000, help="Port to bind to")
    
    args = parser.parse_args()
    
    # Load models
    if args.model:
        model_path = Path(args.model)
        if model_path.is_dir():
            load_models_from_directory(str(model_path))
        elif model_path.exists():
            info = load_model_from_path(model_path)
            if info:
                current_model_id = info["id"]
        else:
            logger.error(f"Model not found: {args.model}")
    else:
        # Load from default directory
        load_models_from_directory(args.models_dir)
    
    if not models:
        logger.error("No models available!")
        sys.exit(1)
    
    # Start server
    logger.info(f"Starting server on {args.host}:{args.port}")
    logger.info(f"Models available: {list(models.keys())}")
    logger.info(f"Current model: {current_model_id}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()