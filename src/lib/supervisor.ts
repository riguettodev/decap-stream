import fs from "fs"
import path from "path"
import { execSync, spawn } from "child_process"
import type { Stream } from "@/types/stream"
import { getStream } from "./db"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
const STREAMS_DIR = path.join(DATA_DIR, "streams")
const VNC_TOKENS_DIR = path.join(DATA_DIR, "vnc-tokens")
const IS_DEV = process.env.NODE_ENV !== "production"

function streamDir(id: string) {
  return path.join(STREAMS_DIR, id)
}

function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""))
}

function supervisorctl(cmd: string) {
  if (IS_DEV) {
    console.log(`[supervisor mock] supervisorctl ${cmd}`)
    return
  }
  try {
    execSync(`supervisorctl -c /etc/supervisor/supervisord.conf ${cmd}`, { stdio: "pipe" })
  } catch {
    // supervisorctl returns exit 1 in some non-fatal cases
  }
}

const NVENC_PRESET: Record<string, string> = {
  ultrafast: "p1", superfast: "p1", veryfast: "p2",
  faster: "p3", fast: "p3", medium: "p4",
  slow: "p5", slower: "p6", veryslow: "p7",
}

function buildEncoderFlags(stream: Stream): string {
  const { preset, tune, gop, bitrate, bufsize } = stream
  const hwaccel = (process.env.FFMPEG_HWACCEL ?? "").toLowerCase().trim()
  const lines: string[] = []
  const ln = (s: string) => lines.push(`    ${s} \\`)

  if (hwaccel === "nvenc") {
    ln(`-c:v h264_nvenc`)
    ln(`-preset ${NVENC_PRESET[preset] ?? "p4"}`)
    ln(`-tune ${tune === "zerolatency" ? "ll" : "hq"}`)
    ln(`-profile:v high`)
    ln(`-pix_fmt yuv420p`)
    ln(`-rc cbr`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    ln(`-b:v ${bitrate}`)
    ln(`-maxrate ${bitrate}`)
    ln(`-bufsize ${bufsize}`)
  } else if (hwaccel === "vaapi") {
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
  } else if (hwaccel === "qsv") {
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

  return lines.join("\n")
}

// converts "1920x1080" → "1920,1080" for Chrome --window-size flag
function resolutionToChrome(res: string): string {
  return res.replace("x", ",")
}

// normalizes scale: accepts "1280x720" or "1280:720", always saves as "1280:720"
export function normalizeScale(scale: string): string {
  return scale.replace("x", ":")
}

export function provisionStream(stream: Stream): void {
  const dir = streamDir(stream.id)
  fs.mkdirSync(path.join(dir, "chrome-profile"), { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, "logs", stream.id), { recursive: true })

  const vars: Record<string, string | number> = {
    STREAM_ID:    stream.id,
    DISPLAY:      stream.display,
    RESOLUTION:   stream.resolution,
    CHROME_SIZE:  resolutionToChrome(stream.resolution),
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
    SCALE:        normalizeScale(stream.scale),
    THREADS:      stream.threads ?? 0,
    USER:         stream.user ?? "",
    PASS:         stream.pass ?? "",
    GPU_FLAGS:            stream.gpu ? "" : "    --disable-gpu \\\n",
    ENCODER_FLAGS:        buildEncoderFlags(stream),
    AUTO_RELOAD:          stream.autoReload ? "true" : "false",
    AUTO_RELOAD_INTERVAL: stream.autoReloadInterval ?? 3600,
  }

  const confTpl = fs.readFileSync("/opt/scripts/stream.template.conf", "utf-8")
  fs.writeFileSync(path.join(dir, "stream.conf"), render(confTpl, vars), "utf-8")

  fs.mkdirSync(VNC_TOKENS_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(VNC_TOKENS_DIR, `${stream.id}.cfg`),
    `${stream.id}: localhost:${stream.vncPort}\n`,
    "utf-8"
  )

  supervisorctl("reread")
  supervisorctl("update")
}

export function recreateStream(id: string): void {
  const stream = getStream(id)
  if (!stream) return
  stopStream(id)
  const dir = streamDir(id)
  fs.rmSync(path.join(dir, "chrome-profile"), { recursive: true, force: true })
  provisionStream(stream)
  startStream(id)
}

export function startStream(id: string): void {
  const programs = ["xvfb", "chromium", "autologin", "autoreload", "x11vnc", "ffmpeg"]
  for (const p of programs) supervisorctl(`start ${p}-${id}`)
  captureThumb(id, 60)
}

export function stopStream(id: string): void {
  const programs = ["ffmpeg", "x11vnc", "autoreload", "autologin", "chromium", "xvfb"]
  for (const p of programs) supervisorctl(`stop ${p}-${id}`)
}

export function applyAutoReload(id: string): void {
  const stream = getStream(id)
  if (!stream) return
  supervisorctl(`stop autoreload-${id}`)
  if (stream.autoReload) supervisorctl(`start autoreload-${id}`)
}

export function restartStream(id: string): void {
  stopStream(id)
  startStream(id)
}

export function removeStream(id: string): void {
  stopStream(id)
  const confPath = path.join(streamDir(id), "stream.conf")
  if (fs.existsSync(confPath)) fs.unlinkSync(confPath)
  const tokenPath = path.join(VNC_TOKENS_DIR, `${id}.cfg`)
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath)
  supervisorctl("reread")
  supervisorctl("update")
  fs.rmSync(streamDir(id), { recursive: true, force: true })
}

export function captureThumb(streamId: string, delay = 60): void {
  if (IS_DEV) { console.log(`[thumb mock] captureThumb ${streamId} delay=${delay}s`); return }
  const stream = getStream(streamId)
  if (!stream) return
  const thumbPath = path.join(STREAMS_DIR, streamId, "thumb.jpg")
  const tmpPath = path.join(STREAMS_DIR, streamId, "thumb.tmp.jpg")
  // capture directly from Xvfb — doesn't depend on RTMP/HLS being up
  const child = spawn("bash", ["-c",
    `sleep ${delay} && ffmpeg -y -loglevel error -f x11grab -video_size ${stream.resolution} -i ${stream.display} -vframes 1 -q:v 2 "${tmpPath}" && mv "${tmpPath}" "${thumbPath}"`
  ], { detached: true, stdio: "ignore" })
  child.unref()
}

export type ProgramStatus = "RUNNING" | "STOPPED" | "FATAL" | "STARTING" | "UNKNOWN"

// Cache for supervisorctl status — refreshed at most once every 3 seconds across all callers
let _statusCache: Record<string, Record<string, ProgramStatus>> | null = null
let _statusCacheAt = 0
const STATUS_CACHE_TTL = 3000

function fetchAllStatuses(): Record<string, Record<string, ProgramStatus>> {
  const now = Date.now()
  if (_statusCache && now - _statusCacheAt < STATUS_CACHE_TTL) return _statusCache

  const result: Record<string, Record<string, ProgramStatus>> = {}
  try {
    // One call for all programs — avoid N×5 blocking execSync calls per poll cycle
    // supervisorctl exits 3 when any process is EXITED/STOPPED — || true keeps execSync from throwing
    const out = execSync(
      `supervisorctl -c /etc/supervisor/supervisord.conf status || true`,
      { stdio: "pipe", shell: "/bin/sh" }
    ).toString()
    for (const line of out.split("\n")) {
      // e.g. "ffmpeg-abc123          RUNNING   pid 42, uptime 0:01:00"
      const m = line.match(/^(xvfb|chromium|autologin|autoreload|x11vnc|ffmpeg)-(\S+)\s+(RUNNING|STOPPED|FATAL|STARTING)/)
      if (!m) continue
      const [, program, id, status] = m
      if (!result[id]) result[id] = {}
      result[id][program] = status as ProgramStatus
    }
  } catch {
    // fallback: supervisorctl completely unavailable
  }

  _statusCache = result
  _statusCacheAt = now
  return result
}

export function getStreamStatus(id: string): Record<string, ProgramStatus> {
  const programs = ["xvfb", "chromium", "autologin", "x11vnc", "ffmpeg"]
  if (IS_DEV) return Object.fromEntries(programs.map((p) => [p, "STOPPED" as ProgramStatus]))
  const all = fetchAllStatuses()
  return all[id] ?? Object.fromEntries(programs.map((p) => [p, "UNKNOWN" as ProgramStatus]))
}

export function getAllStreamStatuses(): Record<string, Record<string, ProgramStatus>> {
  const programs = ["xvfb", "chromium", "autologin", "x11vnc", "ffmpeg"]
  if (IS_DEV) {
    const { readStreams } = require("./db") as typeof import("./db")
    return Object.fromEntries(readStreams().map((s) => [s.id, Object.fromEntries(programs.map((p) => [p, "STOPPED" as ProgramStatus]))]))
  }
  return fetchAllStatuses()
}
