#!/bin/bash
# Gerado automaticamente pela API — não editar manualmente
# Stream: {{STREAM_ID}}

DISPLAY={{DISPLAY}} xdotool type --clearmodifiers --delay 50 "{{USER}}"
DISPLAY={{DISPLAY}} xdotool key Tab
sleep 0.3
DISPLAY={{DISPLAY}} xdotool type --clearmodifiers --delay 50 "{{PASS}}"
DISPLAY={{DISPLAY}} xdotool key Return
sleep 3
DISPLAY={{DISPLAY}} xdotool key F11