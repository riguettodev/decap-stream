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

# The wayland display backend runs sway as an unprivileged user (sway refuses root).
# The render node's group differs per host, so grant access at runtime instead of
# baking a GID into the image.
if [ "${DISPLAY_BACKEND,,}" = "wayland" ]; then
  for dev in /dev/dri/renderD*; do
    [ -e "$dev" ] || continue
    gid=$(stat -c %g "$dev")
    grp=$(getent group "$gid" | cut -d: -f1)
    if [ -z "$grp" ]; then
      grp="render$gid"
      groupadd -g "$gid" "$grp"
    fi
    usermod -aG "$grp" "${DISPLAY_USER:-wl}"
    echo "[entrypoint] ${DISPLAY_USER:-wl} added to group $grp (gid $gid) for $dev"
  done
  if [ ! -e /dev/dri/renderD128 ]; then
    echo "[entrypoint] WARNING: DISPLAY_BACKEND=wayland but /dev/dri is not mapped — streams will fail to start" >&2
  fi
fi

# Regenerate stream configs from current image templates before supervisord reads them
node /opt/scripts/reprovision.mjs

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
