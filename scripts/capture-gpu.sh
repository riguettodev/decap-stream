#!/bin/bash
# Capture + encode for the gpu display backend — the frame never touches the CPU:
#
#   sway (renders on the GPU) ──dmabuf──▶ wf-recorder ──VAAPI──▶ scale_vaapi (RGB→NV12)
#       ──▶ h264_vaapi ──mpegts pipe──▶ ffmpeg (copies video, adds silent AAC) ──▶ RTMP
#
# wf-recorder -D captures on every compositor frame instead of only on damage. The
# compositor output runs at the stream's FPS (display.sh), so that is exactly FPS
# captures per second — a static dashboard still produces a steady stream, which HLS
# needs to cut segments. -r FPS keeps the timestamps constant-rate.
#
# Env (from stream.conf): STREAM_ID, STREAM_DELAY, FPS, VAAPI_DEVICE, WFR_PARAMS, RTMP_URL

set -uo pipefail

sleep "${STREAM_DELAY:-0}"
. /opt/scripts/wlenv.sh || exit 1

# WFR_PARAMS is a list of "-p key=value" pairs built by supervisor.ts — word
# splitting is intended.
# shellcheck disable=SC2086
wf-recorder -y \
    -c h264_vaapi \
    -d "${VAAPI_DEVICE:-/dev/dri/renderD128}" \
    -D \
    -r "$FPS" \
    $WFR_PARAMS \
    -m mpegts \
    -f pipe:1 \
  | ffmpeg \
    -loglevel warning \
    -f mpegts -i pipe:0 \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -map 0:v -map 1:a \
    -c:v copy \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -shortest \
    -f flv "$RTMP_URL"
