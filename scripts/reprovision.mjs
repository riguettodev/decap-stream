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
const EXT_DIR = path.join(DATA_DIR, 'extensions')
const POLICIES_DIR = process.env.POLICIES_DIR ?? '/etc/chromium/policies/managed'
const CONF_TPL = '/opt/scripts/stream.template.conf'

const FORCELIST_ID_RE = /^[a-p]{32}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

function effectiveZoom(stream) {
  const z = stream.zoom
  if (z == null || !Number.isFinite(z) || z <= 0) return 1
  return Math.min(5, Math.max(0.25, z))
}

function buildExtensionsFlags(stream) {
  const ext = stream.extensions ?? {}
  const slugs = (ext.unpacked ?? []).filter((s) => SLUG_RE.test(s))
  const forcelist = (ext.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))
  if (slugs.length === 0 && forcelist.length === 0) return '    --disable-extensions \\\n'
  if (slugs.length === 0) return ''
  const paths = slugs.map((s) => path.join(EXT_DIR, stream.id, s)).join(',')
  return `    --load-extension=${paths} \\\n`
}

function buildBgNetFlag(stream) {
  const forcelist = (stream.extensions?.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))
  if (forcelist.length > 0) return ''
  return '    --disable-background-networking \\\n'
}

function writeForcelistPolicy(stream) {
  const ids = (stream.extensions?.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))
  const file = path.join(POLICIES_DIR, `forcelist-${stream.id}.json`)
  try {
    if (ids.length === 0) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return
    }
    fs.mkdirSync(POLICIES_DIR, { recursive: true })
    const body = {
      ExtensionInstallForcelist: ids.map(
        (id) => `${id};https://clients2.google.com/service/update2/crx`
      ),
    }
    fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
  } catch (err) {
    console.error(`[reprovision] writeForcelistPolicy failed for ${stream.id}:`, err.message)
  }
}

if (!fs.existsSync(STREAMS_FILE) || !fs.existsSync(CONF_TPL)) process.exit(0)

const streams = JSON.parse(fs.readFileSync(STREAMS_FILE, 'utf-8'))
if (streams.length === 0) process.exit(0)

const confTpl = fs.readFileSync(CONF_TPL, 'utf-8')

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))
}

const NVENC_PRESET = {
  ultrafast: 'p1', superfast: 'p1', veryfast: 'p2',
  faster: 'p3', fast: 'p3', medium: 'p4',
  slow: 'p5', slower: 'p6', veryslow: 'p7',
}

function buildEncoderFlags(stream) {
  const { preset, tune, gop, bitrate, bufsize } = stream
  const hwaccel = (process.env.FFMPEG_HWACCEL ?? '').toLowerCase().trim()
  const lines = []
  const ln = (s) => lines.push(`    ${s} \\`)

  if (hwaccel === 'nvenc') {
    ln(`-c:v h264_nvenc`)
    ln(`-preset ${NVENC_PRESET[preset] ?? 'p4'}`)
    ln(`-tune ${tune === 'zerolatency' ? 'll' : 'hq'}`)
    ln(`-profile:v high`)
    ln(`-pix_fmt yuv420p`)
    ln(`-rc cbr`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    ln(`-b:v ${bitrate}`)
    ln(`-maxrate ${bitrate}`)
    ln(`-bufsize ${bufsize}`)
  } else if (hwaccel === 'vaapi') {
    ln(`-vaapi_device /dev/dri/renderD128`)
    ln(`-vf 'format=nv12,hwupload'`)
    ln(`-c:v h264_vaapi`)
    ln(`-profile:v baseline`)
    ln(`-level 3.1`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    ln(`-b:v ${bitrate}`)
    ln(`-maxrate ${bitrate}`)
    ln(`-bufsize ${bufsize}`)
  } else if (hwaccel === 'qsv') {
    ln(`-c:v h264_qsv`)
    ln(`-preset veryfast`)
    ln(`-profile:v baseline`)
    ln(`-level 3.1`)
    ln(`-pix_fmt nv12`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    ln(`-b:v ${bitrate}`)
    ln(`-maxrate ${bitrate}`)
    ln(`-bufsize ${bufsize}`)
  } else {
    ln(`-c:v libx264`)
    ln(`-preset ${preset}`)
    ln(`-tune ${tune}`)
    ln(`-profile:v baseline`)
    ln(`-level 3.1`)
    ln(`-pix_fmt yuv420p`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    ln(`-sc_threshold 0`)
    ln(`-b:v ${bitrate}`)
    ln(`-maxrate ${bitrate}`)
    ln(`-bufsize ${bufsize}`)
  }

  return lines.join('\n')
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
    GPU_FLAGS:           stream.gpu ? '' : '    --disable-gpu \\\n',
    ZOOM_FACTOR:         parseFloat(effectiveZoom(stream).toFixed(4)).toString(),
    ENCODER_FLAGS:       buildEncoderFlags(stream),
    AUTO_RELOAD:         stream.autoReload ? 'true' : 'false',
    AUTO_RELOAD_INTERVAL: stream.autoReloadInterval ?? 3600,
    EXTENSIONS_FLAGS:    buildExtensionsFlags(stream),
    BG_NET_FLAG:         buildBgNetFlag(stream),
  }

  writeForcelistPolicy(stream)

  fs.writeFileSync(path.join(dir, 'stream.conf'), render(confTpl, vars), 'utf-8')
  fs.writeFileSync(
    path.join(VNC_TOKENS_DIR, `${stream.id}.cfg`),
    `${stream.id}: localhost:${stream.vncPort}\n`,
    'utf-8'
  )

  console.log(`[reprovision] ${stream.id}`)
}

console.log(`[reprovision] done (${streams.length} stream(s))`)
