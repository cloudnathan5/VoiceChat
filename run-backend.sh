#!/bin/bash
source /home/ubuntu/.nvm/nvm.sh
nvm use 20
cd /home/ubuntu/Projects/VoiceChat/backend
node --watch server.js