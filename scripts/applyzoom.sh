#!/bin/bash
#
# applyzoom — applies the stream's page zoom by sending Ctrl+0 then N presses
# of Ctrl++ / Ctrl+- to the Chromium window via xdotool. This is the same path
# as a user pressing the keyboard shortcut, so it Just Works regardless of
# Chromium version / Preferences format quirks.
#
# Env:
#   ZOOM_FACTOR  — target zoom (e.g. 1.0, 1.5, 0.75)
#   DISPLAY      — Xvfb display (inherited from supervisor environment block)
#
# Chromium's discrete keyboard zoom steps (matches chrome://settings):
#   25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500
# (index 7 = 100%). We snap the requested zoom to the nearest step and press
# the delta number of times.

set -u

SLEEP_PID=""
_cleanup() { [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null; exit 0; }
trap '_cleanup' TERM INT

# Bail out cleanly when the value is the default — nothing to do.
ZOOM_FACTOR="${ZOOM_FACTOR:-1}"
case "$ZOOM_FACTOR" in
  1|1.0|1.00|1.000) exit 0 ;;
esac

# Wait for a chromium window to exist on this DISPLAY (retry up to 30s).
for i in $(seq 1 30); do
  WID="$(xdotool search --onlyvisible --class chromium 2>/dev/null | head -1)"
  if [ -n "${WID:-}" ]; then break; fi
  sleep 1 &
  SLEEP_PID=$!
  wait $SLEEP_PID
  SLEEP_PID=""
done

if [ -z "${WID:-}" ]; then
  echo "applyzoom: no chromium window found on $DISPLAY"
  exit 0
fi

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
