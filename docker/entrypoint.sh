#!/bin/bash
set -e

mkdir -p /app/data/streams
mkdir -p /app/data/logs
mkdir -p /app/data/vnc-tokens

find /app/data/streams -name "*.sh" -exec chmod +x {} \;

# #19 — restaura streams para o desiredState após restart do container
NODE_PATH=/app/node_modules node -e "
const fs = require('fs');
const { execSync } = require('child_process');
const streamsFile = '/app/data/streams.json';
if (!fs.existsSync(streamsFile)) process.exit(0);
const streams = JSON.parse(fs.readFileSync(streamsFile, 'utf-8'));
// Apenas aguarda o supervisord estar pronto, o restore ocorre via script separado
fs.writeFileSync('/app/data/.pending-restore', JSON.stringify(streams.map(s => ({ id: s.id, desiredState: s.desiredState }))));
" 2>/dev/null || true

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
