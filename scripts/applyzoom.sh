#!/bin/bash
#
# applyzoom — applies the stream's page zoom by sending Ctrl+0 then N presses
# of Ctrl++ / Ctrl+- to Chromium. This is the same path as a user pressing the
# keyboard shortcut, so it Just Works regardless of Chromium version /
# Preferences format quirks.
#
# X backends (xvfb, wayland): keys go through xdotool on $DISPLAY.
# gpu backend (no X server): keys go through the stream's own wayvnc (see
# vnckeys.py for why not wtype).
#
# Env:
#   ZOOM_FACTOR      — target zoom (e.g. 1.0, 1.5, 0.75)
#   DISPLAY          — X display (inherited from supervisor environment block)
#   DISPLAY_BACKEND  — xvfb | wayland | gpu
#   VNC_PORT, DEBUG_PORT — gpu backend only
#
# Chromium's discrete keyboard zoom steps (matches chrome://settings):
#   25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500
# (index 7 = 100%). We snap the requested zoom to the nearest step and press
# the delta number of times.

set -u

SLEEP_PID=""
_cleanup() { [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null; exit 0; }
trap '_cleanup' TERM INT

interruptible_sleep() {
  sleep "$1" &
  SLEEP_PID=$!
  wait $SLEEP_PID
  SLEEP_PID=""
}

# Bail out cleanly when the value is the default — nothing to do.
ZOOM_FACTOR="${ZOOM_FACTOR:-1}"
case "$ZOOM_FACTOR" in
  1|1.0|1.00|1.000) exit 0 ;;
esac

# Compute step delta from 100% using Python (already in the image).
STEPS="$(python3 - "$ZOOM_FACTOR" <<'PY'
import sys
target = float(sys.argv[1])
steps = [0.25, 0.333, 0.50, 0.667, 0.75, 0.80, 0.90, 1.00,
         1.10, 1.25, 1.50, 1.75, 2.00, 2.50, 3.00, 4.00, 5.00]
idx = min(range(len(steps)), key=lambda i: abs(steps[i] - target))
print(idx - 7)  # 7 = index of 1.00
PY
)"

if [ "${DISPLAY_BACKEND:-xvfb}" = "gpu" ]; then
  port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

  # Wait for Chromium (DevTools port) and wayvnc (VNC port), up to 60s.
  READY=""
  for i in $(seq 1 60); do
    if port_open "$DEBUG_PORT" && port_open "$VNC_PORT"; then READY=1; break; fi
    interruptible_sleep 1
  done
  if [ -z "$READY" ]; then
    echo "applyzoom: chromium/wayvnc not up (debug port $DEBUG_PORT, vnc port $VNC_PORT)"
    exit 0
  fi
  # let the first page settle — zoom is stored per host, so it has to land on the
  # stream's page, not on a blank tab
  interruptible_sleep 3

  KEYS=(ctrl+0)
  if [ "$STEPS" -gt 0 ]; then
    for _ in $(seq 1 "$STEPS"); do KEYS+=(ctrl+KP_Add); done
  elif [ "$STEPS" -lt 0 ]; then
    for _ in $(seq 1 $(( -STEPS ))); do KEYS+=(ctrl+KP_Subtract); done
  fi

  echo "applyzoom: backend=gpu factor=$ZOOM_FACTOR steps=$STEPS"
  python3 /opt/scripts/vnckeys.py "$VNC_PORT" "${KEYS[@]}"
  echo "applyzoom: done"
  exit 0
fi

# Wait for a chromium window to exist on this DISPLAY (retry up to 30s).
for i in $(seq 1 30); do
  WID="$(xdotool search --onlyvisible --class chromium 2>/dev/null | head -1)"
  if [ -n "${WID:-}" ]; then break; fi
  interruptible_sleep 1
done

if [ -z "${WID:-}" ]; then
  echo "applyzoom: no chromium window found on $DISPLAY"
  exit 0
fi

echo "applyzoom: window=$WID factor=$ZOOM_FACTOR steps=$STEPS"

# Reset to 100% first (Ctrl+0) so we have a known baseline.
xdotool key --window "$WID" ctrl+0
sleep 0.2

if [ "$STEPS" -gt 0 ]; then
  for _ in $(seq 1 "$STEPS"); do
    # KP_Add / KP_Subtract (numpad) are the most reliable keysyms — `ctrl+minus`
    # alone doesn't always fire Chromium's zoom-out accelerator on Xvfb keymaps.
    xdotool key --window "$WID" ctrl+KP_Add
    sleep 0.05
  done
elif [ "$STEPS" -lt 0 ]; then
  N=$(( -STEPS ))
  for _ in $(seq 1 "$N"); do
    xdotool key --window "$WID" ctrl+KP_Subtract
    sleep 0.05
  done
fi

echo "applyzoom: done"
exit 0
