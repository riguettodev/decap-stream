#!/bin/bash
# VNC for the gpu display backend: wayvnc + output refresh that follows VNC clients.
#
# display.sh runs the compositor output at the stream's FPS, which is what keeps
# Chromium and the capture cheap. VNC can only show a new frame when the output
# repaints, though, so at 5 Hz every mouse move, scroll or key press shows up in
# 200 ms steps. This script runs wayvnc and listens to its client events: while at
# least one VNC client is connected the output runs at VNC_REFRESH_HZ, and it goes
# back to FPS when the last one leaves. The published stream keeps its FPS either
# way — capture-gpu.sh passes -r FPS to wf-recorder, which drops the extra frames.
#
# Env (stream.conf): STREAM_ID, VNC_PORT, RESOLUTION, FPS
# Env (container):   VNC_REFRESH_HZ — output refresh while a client is connected
#                                     (default 30; 0 = never change it)
#                    WAYVNC_GPU     — wayvnc --gpu: dmabuf capture and H.264 encoding
#                                     on the GPU for clients that decode it (noVNC 1.6
#                                     on Chrome/Edge/Firefox; others fall back to Tight).
#                                     Default true — measured on the HD 630 at 30 Hz with
#                                     mouse/scroll on a Grafana dashboard: same ~26-28
#                                     updates/s and same text sharpness as without it,
#                                     0.36 vs 4.3 Mbit/s to the browser, less CPU in the
#                                     websockify/Next.js hops. false = CPU encoding.

set -u

. /opt/scripts/wlenv.sh || exit 1

# supervisord keeps HOME=/root for the display user, and wayvnc exits on "Permission
# denied" reading /root/.config — look for a config in the runtime dir instead, where
# none exists (defaults, no auth, like x11vnc)
export XDG_CONFIG_HOME="$XDG_RUNTIME_DIR"

WAYVNC_ARGS=()
[ "$(echo "${WAYVNC_GPU:-true}" | tr '[:upper:]' '[:lower:]')" != "false" ] && WAYVNC_ARGS+=(--gpu)

BASE_HZ="${FPS:-30}"
VNC_HZ="${VNC_REFRESH_HZ:-30}"
case "$VNC_HZ" in ''|*[!0-9.]*) VNC_HZ=30 ;; esac

# nothing to follow: disabled, or the stream already runs at least that fast
if [ "$VNC_HZ" = "0" ] || awk -v b="$BASE_HZ" -v v="$VNC_HZ" 'BEGIN { exit !(b >= v) }'; then
  exec wayvnc "${WAYVNC_ARGS[@]}" 0.0.0.0 "$VNC_PORT"
fi

CTL_SOCK="$XDG_RUNTIME_DIR/wayvnc-ctl.sock"
rm -f "$CTL_SOCK"

set_refresh() {
  [ -n "${SWAYSOCK:-}" ] || { echo "[vnc] ${STREAM_ID}: no sway IPC socket, can't set refresh" >&2; return 1; }
  swaymsg -s "$SWAYSOCK" output HEADLESS-1 mode "${RESOLUTION}@${1}Hz" >/dev/null || return 1
  echo "[vnc] ${STREAM_ID}: output refresh ${1}Hz"
}

wayvnc "${WAYVNC_ARGS[@]}" -S "$CTL_SOCK" 0.0.0.0 "$VNC_PORT" &
WAYVNC_PID=$!

# No --reconnect: when wayvnc exits the event stream ends, the loop below returns and
# supervisord restarts this whole program (wayvnc included).
exec 3< <(wayvncctl -S "$CTL_SOCK" --wait --json event-receive 2>/dev/null)
EVENTS_PID=$!

cleanup() {
  kill "$EVENTS_PID" "$WAYVNC_PID" 2>/dev/null
  set_refresh "$BASE_HZ"
  exit 0
}
trap cleanup TERM INT

current=""
while read -r line <&3; do
  case "$line" in
    *'"wayvnc-startup"'*) count=0 ;;
    *'"client-connected"'*|*'"client-disconnected"'*)
      count="${line##*\"connection_count\":}"
      count="${count%%[!0-9]*}"
      ;;
    *) continue ;;
  esac
  want="$BASE_HZ"
  [ "${count:-0}" -gt 0 ] && want="$VNC_HZ"
  if [ "$want" != "$current" ] && set_refresh "$want"; then
    current="$want"
  fi
done

cleanup
