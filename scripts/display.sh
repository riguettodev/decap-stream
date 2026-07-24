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
# NB: WAYLAND_DISPLAY is deliberately NOT set here. sway creates its socket with
# wl_display_add_socket_auto(), which ignores WAYLAND_DISPLAY and always takes the
# first free "wayland-N" name — so forcing "wayland-${DISPLAY_N}" never worked and
# left us waiting for a socket that was never created. We let sway choose and
# discover the name afterwards (see below). The X display number ($DISPLAY_NUM) is a
# separate namespace set on the Xwayland command line; the two need not match.
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
# Clear any stale compositor sockets from a previous crashed run in this stream's
# private runtime dir, so the discovery below cannot latch onto a dead socket.
rm -f "$XDG_RUNTIME_DIR"/wayland-*

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

# Discover the socket sway actually created (it names it "wayland-N" itself, see the
# note above). This runtime dir is private to this stream, so there is exactly one
# socket to find. Bail out early if sway dies while we are waiting.
WAYLAND_DISPLAY=""
for _ in $(seq 1 50); do
  for s in "$XDG_RUNTIME_DIR"/wayland-*; do
    case "$s" in *.lock) continue ;; esac
    [ -S "$s" ] && WAYLAND_DISPLAY="${s##*/}" && break
  done
  [ -n "$WAYLAND_DISPLAY" ] && break
  kill -0 "$SWAY_PID" 2>/dev/null || break
  sleep 0.2
done

if [ -z "$WAYLAND_DISPLAY" ]; then
  echo "[display] ${STREAM_ID}: sway created no wayland socket in $XDG_RUNTIME_DIR — is /dev/dri mapped and is $(id -un) in the render node's group?" >&2
  kill "$SWAY_PID" 2>/dev/null
  exit 1
fi
export WAYLAND_DISPLAY
echo "[display] ${STREAM_ID}: compositor up on $WAYLAND_DISPLAY, starting Xwayland on $DISPLAY_NUM" >&2

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
