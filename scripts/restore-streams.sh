#!/bin/bash
# #19 — aguarda supervisord e restaura streams para o desiredState salvo
sleep 5

STREAMS_FILE="/app/data/streams.json"
[ -f "$STREAMS_FILE" ] || exit 0

node -e "
const fs = require('fs');
const { execSync } = require('child_process');
const streams = JSON.parse(fs.readFileSync('$STREAMS_FILE', 'utf-8'));
const ctl = (cmd) => { try { execSync('supervisorctl -c /etc/supervisor/supervisord.conf ' + cmd, { stdio: 'pipe' }); } catch {} };

for (const s of streams) {
  if (s.desiredState === 'running') {
    console.log('[restore] starting', s.id);
    ['xvfb','chromium','autologin','x11vnc','ffmpeg'].forEach(p => ctl('start ' + p + '-' + s.id));
  } else {
    console.log('[restore] keeping stopped', s.id);
  }
}
"
