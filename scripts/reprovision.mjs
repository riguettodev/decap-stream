#!/usr/bin/env node
// Regenerates stream.conf and VNC token files from current image templates.
// Runs at container startup (before supervisord) so configs always match the image.

import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const STREAMS_FILE = path.join(DATA_DIR, 'streams', 'streams.json')
const STREAMS_DIR = path.join(DATA_DIR, 'streams')
const VNC_TOKENS_DIR = path.join(DATA_DIR, 'vnc-tokens')
const LOGS_DIR = path.join(DATA_DIR, 'logs')
const CONF_TPL = '/opt/scripts/stream.template.conf'

if (!fs.existsSync(STREAMS_FILE) || !fs.existsSync(CONF_TPL)) process.exit(0)

const streams = JSON.parse(fs.readFileSync(STREAMS_FILE, 'utf-8'))
if (streams.length === 0) process.exit(0)

const confTpl = fs.readFileSync(CONF_TPL, 'utf-8')

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))
}

for (const stream of streams) {
  const dir = path.join(STREAMS_DIR, stream.id)
  fs.mkdirSync(path.join(dir, 'chrome-profile'), { recursive: true })
  fs.mkdirSync(path.join(LOGS_DIR, stream.id), { recursive: true })
  fs.mkdirSync(VNC_TOKENS_DIR, { recursive: true })

  const vars = {
    STREAM_ID:    stream.id,
    DISPLAY:      stream.display,
    RESOLUTION:   stream.resolution,
    CHROME_SIZE:  stream.resolution.replace('x', ','),
    STREAM_URL:   stream.url,
    DEBUG_PORT:   stream.debugPort,
    VNC_PORT:     stream.vncPort,
    STREAM_DELAY: stream.delay,
    FPS:          stream.fps,
    PRESET:       stream.preset,
    TUNE:         stream.tune,
    GOP:          stream.gop,
    BITRATE:      stream.bitrate,
    BUFSIZE:      stream.bufsize,
    SCALE:        String(stream.scale).replace('x', ':'),
    THREADS:      stream.threads ?? 0,
    USER:         stream.user ?? '',
    PASS:         stream.pass ?? '',
  }

  fs.writeFileSync(path.join(dir, 'stream.conf'), render(confTpl, vars), 'utf-8')
  fs.writeFileSync(
    path.join(VNC_TOKENS_DIR, `${stream.id}.cfg`),
    `${stream.id}: localhost:${stream.vncPort}\n`,
    'utf-8'
  )

  console.log(`[reprovision] ${stream.id}`)
}

console.log(`[reprovision] done (${streams.length} stream(s))`)
