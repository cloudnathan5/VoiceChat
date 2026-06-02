#!/bin/bash
source /home/ubuntu/.nvm/nvm.sh
nvm use 20
node -v
cd /home/ubuntu/Projects/VoiceChat/frontend
./node_modules/.bin/vite