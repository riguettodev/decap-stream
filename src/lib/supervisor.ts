import fs from "fs"
import path from "path"
import { execSync, spawn } from "child_process"
import type { Stream } from "@/types/stream"
import { getStream } from "./db"
import { buildExtensionsFlags, buildBgNetFlag, writeForcelistPolicy, removeStreamExtensions } from "./extensions"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
const STREAMS_DIR = path.join(DATA_DIR, "streams")
const VNC_TOKENS_DIR = path.join(DATA_DIR, "vnc-tokens")
const IS_DEV = process.env.NODE_ENV !== "production"

function streamDir(id: string) {
  return path.join(STREAMS_DIR, id)
}

function render(template: string, vars: Record<string, string | number>): string {
  // supervisord interpola valores de config com %(VAR)s, então todo % literal
  // num valor injetado (ex.: %2F na URL do Grafana) precisa virar %% ou o parser
  // do conf falha com "must be real number, not dict"
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? "").replace(/%/g, "%%"))
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

const VAAPI_RC_MODES = ["cbr", "vbr", "cqp"]

// rate-control do VAAPI: drivers antigos (i965, gallium) muitas vezes só expõem CQP.
// O sintoma de escolher um modo não suportado é o encoder abortar com
// "Driver does not support any RC mode compatible with selected options".
function vaapiRcMode(): string {
  const rc = (process.env.FFMPEG_VAAPI_RC ?? "").toLowerCase().trim()
  return VAAPI_RC_MODES.includes(rc) ? rc : "cbr"
}

function vaapiQpValue(): number {
  const qp = parseInt(process.env.FFMPEG_VAAPI_QP ?? "", 10)
  return Number.isFinite(qp) && qp >= 0 && qp <= 51 ? qp : 24
}

function buildEncoderFlags(stream: Stream): string {
  const { preset, tune, gop, bitrate, bufsize } = stream
  const hwaccel = (process.env.FFMPEG_HWACCEL ?? "").toLowerCase().trim()
  const vaapiRc = vaapiRcMode()
  const vaapiQp = vaapiQpValue()
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
    // h264_vaapi só aceita constrained_baseline | main | high — "baseline" aborta o encoder
    ln(`-profile:v constrained_baseline`)
    ln(`-level 3.1`)
    ln(`-g ${gop}`)
    ln(`-keyint_min ${gop}`)
    // nem todo driver VAAPI suporta CBR/VBR; alguns só expõem CQP (ver FFMPEG_VAAPI_RC)
    if (vaapiRc === "cqp") {
      ln(`-rc_mode CQP`)
      ln(`-qp ${vaapiQp}`)
    } else {
      ln(`-rc_mode ${vaapiRc.toUpperCase()}`)
      ln(`-b:v ${bitrate}`)
      ln(`-maxrate ${bitrate}`)
      ln(`-bufsize ${bufsize}`)
    }
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

// Returns the clamped zoom factor (default 1.0), e.g. 0.5, 1, 1.5, 2.
function effectiveZoom(stream: Stream): number {
  const z = stream.zoom
  if (z == null || !Number.isFinite(z) || z <= 0) return 1
  return Math.min(5, Math.max(0.25, z))
}

// Builds the {{GPU_FLAGS}} block for the Chromium command (3-way rendering mode).
//   "off"      → --disable-gpu (default; lowest CPU; WebGL/maps don't render)
//   "software" → SwiftShader CPU WebGL. --disable-gpu MUST be absent (ANGLE/SwiftShader
//                run inside the GPU process). --enable-unsafe-swiftshader is mandatory on
//                Chromium ≥137 (M147 here) — without it WebGL stays Disabled. SwiftShader
//                ships in Debian chromium-common, so no extra apt package is required.
//   "hardware" → no flag; only useful when a real GPU is exposed to the container.
// Legacy streams without gpuMode are derived from the deprecated `gpu` boolean.
function effectiveGpuMode(stream: Stream): "off" | "software" | "hardware" {
  return stream.gpuMode ?? (stream.gpu ? "hardware" : "off")
}

// VA-API *decode* is a different path from rendering: it talks to /dev/dri directly
// and does not need DRI3, so it works even on Xvfb (where all rendering falls back
// to software). Worth it for pages playing video — a camera portal decoding H.264
// in software costs a full core. Requires the GPU process to exist, so --disable-gpu
// is dropped; --disable-gpu-compositing keeps compositing on Skia/CPU instead of
// paying for llvmpipe.
function hwDecodeEnabled(): boolean {
  return (process.env.CHROMIUM_HWDECODE ?? "").toLowerCase().trim() === "true"
}

const HWDECODE_FLAGS =
  "    --disable-gpu-compositing \\\n" +
  "    --ignore-gpu-blocklist \\\n" +
  "    --enable-features=VaapiVideoDecoder,VaapiVideoDecodeLinuxGL \\\n"

function buildGpuFlags(stream: Stream): string {
  const mode = effectiveGpuMode(stream)
  const decode = hwDecodeEnabled() ? HWDECODE_FLAGS : ""
  switch (mode) {
    case "hardware":
      // Only actually hardware under DISPLAY_BACKEND=wayland: on Xvfb there is no
      // DRI3, so Chromium silently falls back to llvmpipe (software) instead.
      return (
        "    --ignore-gpu-blocklist \\\n" +
        "    --enable-gpu-rasterization \\\n" +
        decode
      )
    case "software":
      return (
        "    --use-gl=angle \\\n" +
        "    --use-angle=swiftshader \\\n" +
        "    --enable-unsafe-swiftshader \\\n" +
        "    --ignore-gpu-blocklist \\\n" +
        decode
      )
    case "off":
    default:
      // --disable-gpu kills the GPU process, and with it VA-API decode
      return decode || "    --disable-gpu \\\n"
  }
}


// converts "1920x1080" → "1920,1080" for Chrome --window-size flag
function resolutionToChrome(res: string): string {
  return res.replace("x", ",")
}

// Display backend. "wayland" runs sway + rootful Xwayland, which gives the X
// server DRI3 and therefore real GPU rendering; "xvfb" (default) is the legacy
// software-only path. Decided per stream (stream.displayBackend), falling back to
// the DISPLAY_BACKEND env for streams that don't set it. See scripts/display.sh.
export function displayBackend(stream?: Stream): "wayland" | "xvfb" {
  const perStream = stream?.displayBackend
  if (perStream === "wayland" || perStream === "xvfb") return perStream
  return (process.env.DISPLAY_BACKEND ?? "").toLowerCase().trim() === "wayland" ? "wayland" : "xvfb"
}

// sway refuses to run as root, so the wayland backend needs a dedicated user — and
// so does x11vnc, whose MIT-SHM screen grab is denied cross-uid against a wl-owned
// Xwayland (BadAccess). Both programs get this line ({{DISPLAY_USER}} in the
// template); it's empty on xvfb.
function displayUserLine(stream: Stream): string {
  return displayBackend(stream) === "wayland" ? `user=${process.env.DISPLAY_USER ?? "wl"}\n` : ""
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
    DISPLAY_BACKEND: displayBackend(stream),
    DISPLAY_USER: displayUserLine(stream),
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
    GPU_FLAGS:            buildGpuFlags(stream),
    ZOOM_FACTOR:          parseFloat(effectiveZoom(stream).toFixed(4)).toString(),
    ENCODER_FLAGS:        buildEncoderFlags(stream),
    AUTO_RELOAD:          stream.autoReload ? "true" : "false",
    AUTO_RELOAD_INTERVAL: stream.autoReloadInterval ?? 3600,
    EXTENSIONS_FLAGS:     buildExtensionsFlags(stream),
    BG_NET_FLAG:          buildBgNetFlag(stream),
  }

  writeForcelistPolicy(stream)

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
  const programs = ["xvfb", "chromium", "autologin", "applyzoom", "autoreload", "x11vnc", "ffmpeg"]
  for (const p of programs) supervisorctl(`start ${p}-${id}`)
  captureThumb(id, 60, { force: true })
}

export function stopStream(id: string): void {
  const programs = ["ffmpeg", "x11vnc", "autoreload", "applyzoom", "autologin", "chromium", "xvfb"]
  for (const p of programs) supervisorctl(`stop ${p}-${id}`)
}

export function applyExtensions(id: string): void {
  const stream = getStream(id)
  if (!stream) return
  provisionStream(stream)
  // provisionStream already wrote the forcelist policy + new conf
  // restart only chromium + autologin (ffmpeg keeps running on Xvfb)
  supervisorctl(`stop autologin-${id}`)
  supervisorctl(`stop chromium-${id}`)
  supervisorctl(`start chromium-${id}`)
  supervisorctl(`start autologin-${id}`)
}

export function applyZoom(id: string): void {
  const stream = getStream(id)
  if (!stream) return
  provisionStream(stream)
  // applyzoom.sh always sends Ctrl+0 first to reset to 100%, then steps to
  // the target — so we DON'T need to restart Chromium. Just bounce applyzoom
  // so it picks up the new ZOOM_FACTOR env and re-applies on the live tab.
  supervisorctl(`stop applyzoom-${id}`)
  supervisorctl(`start applyzoom-${id}`)
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
  removeStreamExtensions(id)
}

// Guard against thumbnail stampede: the tmp file only shows up *after* the sleep,
// so the on-disk check alone lets every request inside that window spawn another
// 1080p x11grab. Track attempts in-process instead.
const _lastThumbAttempt = new Map<string, number>()
const THUMB_MIN_INTERVAL = 90_000

export function captureThumb(streamId: string, delay = 60, opts: { force?: boolean } = {}): void {
  if (IS_DEV) { console.log(`[thumb mock] captureThumb ${streamId} delay=${delay}s`); return }
  const now = Date.now()
  if (!opts.force && now - (_lastThumbAttempt.get(streamId) ?? 0) < THUMB_MIN_INTERVAL) return
  _lastThumbAttempt.set(streamId, now)
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
