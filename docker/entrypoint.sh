#!/bin/bash
set -e

mkdir -p /app/data/streams
mkdir -p /app/data/logs
mkdir -p /app/data/vnc-tokens

# Migrate streams.json from old location (/app/data/streams.json → /app/data/streams/streams.json)
if [ -f /app/data/streams.json ] && [ ! -f /app/data/streams/streams.json ]; then
  mv /app/data/streams.json /app/data/streams/streams.json
  echo "[entrypoint] migrated streams.json to /app/data/streams/streams.json"
fi

# Regenerate stream configs from current image templates before supervisord reads them
node /opt/scripts/reprovision.mjs

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
