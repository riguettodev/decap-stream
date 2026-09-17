#!/bin/bash
# Sourced (". /opt/scripts/wlenv.sh") by every process that talks to a stream's
# compositor on the wayland/gpu backends: Chromium, capture, VNC, thumbnails.
#
# display.sh owns the compositor and writes the name of the socket sway actually
# created to $XDG_RUNTIME_DIR/wayland-display (sway ignores WAYLAND_DISPLAY and
# picks the first free wayland-N itself). This waits for that file and for the
# socket, then exports XDG_RUNTIME_DIR + WAYLAND_DISPLAY.
#
# Required env: STREAM_ID. Returns non-zero after ~60s without a compositor, so
# supervisord restarts the caller instead of it hanging forever.

export XDG_RUNTIME_DIR="/tmp/xdg-${STREAM_ID:?STREAM_ID is required}"

WAYLAND_DISPLAY=""
for _ in $(seq 1 300); do
  if [ -s "$XDG_RUNTIME_DIR/wayland-display" ]; then
    WAYLAND_DISPLAY="$(cat "$XDG_RUNTIME_DIR/wayland-display")"
    [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] && break
  fi
  WAYLAND_DISPLAY=""
  sleep 0.2
done

if [ -z "$WAYLAND_DISPLAY" ]; then
  echo "[wlenv] ${STREAM_ID}: no compositor socket in $XDG_RUNTIME_DIR after 60s" >&2
  return 1 2>/dev/null || exit 1
fi
export WAYLAND_DISPLAY
