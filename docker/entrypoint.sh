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

# The wayland and gpu display backends run sway (and the VNC server) as an
# unprivileged user — sway refuses to run as root. The backend is a per-stream
# choice, so set up render node access whenever a GPU is mapped, regardless of the
# global default (it's harmless when no stream uses it). The render node's group
# differs per host, so grant access at runtime instead of baking a GID into the image.
if ls /dev/dri/renderD* >/dev/null 2>&1; then
  for dev in /dev/dri/renderD*; do
    gid=$(stat -c %g "$dev")
    grp=$(getent group "$gid" | cut -d: -f1)
    if [ -z "$grp" ]; then
      grp="render$gid"
      groupadd -g "$gid" "$grp"
    fi
    usermod -aG "$grp" "${DISPLAY_USER:-wl}"
    echo "[entrypoint] ${DISPLAY_USER:-wl} added to group $grp (gid $gid) for $dev"
  done
elif [ "${GPU_PIPELINE,,}" = "full" ]; then
  echo "[entrypoint] WARNING: GPU_PIPELINE=full but /dev/dri is not mapped — every stream will fail to start. Map /dev/dri or unset GPU_PIPELINE on CPU-only hosts." >&2
elif [ "${DISPLAY_BACKEND,,}" = "wayland" ] || [ "${DISPLAY_BACKEND,,}" = "gpu" ]; then
  echo "[entrypoint] WARNING: DISPLAY_BACKEND=${DISPLAY_BACKEND} but /dev/dri is not mapped — ${DISPLAY_BACKEND,,} streams will fail to start" >&2
fi

# Regenerate stream configs from current image templates before supervisord reads them
node /opt/scripts/reprovision.mjs

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
