#!/bin/bash
# Provides the virtual display for one stream.
#
# Two backends, selected by DISPLAY_BACKEND:
#
#   xvfb     (default) — Xvfb, pure software. No DRI3, so Chromium always
#                        rasterizes on the CPU (llvmpipe/SwiftShader).
#   wayland            — sway (headless, wlroots on GBM) + rootful Xwayland.
#                        Xwayland is a full X server *with DRI3*, so Chromium,
#                        x11grab and x11vnc keep using DISPLAY=:N exactly as
#                        before, but rendering goes to the real GPU.
#
# Required env: DISPLAY_NUM (":5"), RESOLUTION ("1920x1080"), STREAM_ID.
# The wayland backend additionally needs /dev/dri and must NOT run as root
# (sway refuses to start as root).

set -u

DISPLAY_NUM="${DISPLAY_NUM:?}"
RESOLUTION="${RESOLUTION:?}"
STREAM_ID="${STREAM_ID:?}"
BACKEND="$(echo "${DISPLAY_BACKEND:-xvfb}" | tr '[:upper:]' '[:lower:]')"

DISPLAY_N="${DISPLAY_NUM#:}"

if [ "$BACKEND" != "wayland" ]; then
  exec Xvfb "$DISPLAY_NUM" -screen 0 "${RESOLUTION}x24" -ac
fi

# --- wayland backend -------------------------------------------------------

export XDG_RUNTIME_DIR="/tmp/xdg-${STREAM_ID}"
export WAYLAND_DISPLAY="wayland-${DISPLAY_N}"
export WLR_BACKENDS=headless
export WLR_RENDERER=gles2
# wlroots needs no seat manager on the headless backend
export LIBSEAT_BACKEND=noop
# supervisord keeps its own HOME (/root) even with user=, so the unprivileged user
# inherits a directory it cannot write — fontconfig then fails with "No writable
# cache directories". Resolve the real home of whoever we are running as.
HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
export HOME="${HOME:-/tmp}"
export XDG_CACHE_HOME="$XDG_RUNTIME_DIR/cache"
mkdir -p "$XDG_CACHE_HOME"

mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
rm -f "$XDG_RUNTIME_DIR/${WAYLAND_DISPLAY}" "$XDG_RUNTIME_DIR/${WAYLAND_DISPLAY}.lock"

SWAY_CFG="$XDG_RUNTIME_DIR/sway.conf"
{
  echo "output HEADLESS-1 mode ${RESOLUTION}@60Hz"
  # MUST stay disabled: sway would otherwise launch its own Xwayland on the first
  # free display number, which then collides with the rootful one we start below
  # ("Server is already active for display N"). We want exactly one X server, on
  # the display number this stream owns.
  echo "xwayland disable"
} > "$SWAY_CFG"

sway -c "$SWAY_CFG" &
SWAY_PID=$!

cleanup() {
  kill "$XWAYLAND_PID" 2>/dev/null
  kill "$SWAY_PID" 2>/dev/null
  wait "$SWAY_PID" 2>/dev/null
  exit 0
}
trap cleanup TERM INT

# wait for the compositor socket before starting Xwayland
for _ in $(seq 1 50); do
  [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] && break
  sleep 0.2
done

if [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ]; then
  echo "[display] sway failed to create $WAYLAND_DISPLAY — check that /dev/dri is mapped" >&2
  kill "$SWAY_PID" 2>/dev/null
  exit 1
fi

# A hard restart can leave the lock/socket behind, and Xwayland refuses to start
# on a display that looks taken ("Server is already active for display N"). The
# display number belongs to this stream alone, so clearing it here is safe.
rm -f "/tmp/.X${DISPLAY_N}-lock" "/tmp/.X11-unix/X${DISPLAY_N}"

# Rootful Xwayland: a complete X server (with DRI3) living inside the compositor.
# -ac keeps it open to the other stream processes, which still run as root.
# The screen size comes from the compositor output (see `output ... mode` above) —
# Xwayland 22.1 has no -geometry. x11grab captures a fixed -video_size, so if the
# screen ever comes up at another size the ffmpeg of this stream is what breaks.
Xwayland "$DISPLAY_NUM" -ac -noreset &
XWAYLAND_PID=$!

# if either half dies, exit so supervisord restarts the whole display
wait -n "$SWAY_PID" "$XWAYLAND_PID"
cleanup
