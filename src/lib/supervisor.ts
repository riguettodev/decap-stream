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

function vaapiDevice(): string {
  return process.env.VAAPI_DEVICE?.trim() || "/dev/dri/renderD128"
}

// Does the VAAPI driver do video processing (VAEntrypointVideoProc)? Without it
// scale_vaapi can't convert RGB→NV12 on the GPU. Asked once per process.
let _vaapiVideoProc: boolean | null = null
function vaapiHasVideoProc(): boolean {
  if (_vaapiVideoProc !== null) return _vaapiVideoProc
  try {
    const out = execSync(`vainfo --display drm --device ${vaapiDevice()} 2>&1`, {
      stdio: "pipe", shell: "/bin/sh", timeout: 10_000,
    }).toString()
    _vaapiVideoProc = out.includes("VAEntrypointVideoProc")
  } catch {
    _vaapiVideoProc = false
  }
  return _vaapiVideoProc
}

// Where the x11grab frame (BGRX) becomes NV12 before the VAAPI encoder.
//   gpu  → hwupload,scale_vaapi=format=nv12 — measured on an i5-7400/HD 630: ffmpeg
//          −26% CPU at 1080p 5fps and −35% at 1080p 25fps vs. the swscale path
//   cpu  → format=nv12,hwupload (swscale)
//   auto (default) → gpu when the driver exposes VAEntrypointVideoProc
function vaapiCscOnGpu(): boolean {
  const mode = (process.env.FFMPEG_VAAPI_CSC ?? "auto").toLowerCase().trim()
  if (mode === "gpu") return true
  if (mode === "cpu") return false
  return vaapiHasVideoProc()
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
    ln(`-vaapi_device ${vaapiDevice()}`)
    ln(vaapiCscOnGpu() ? `-vf 'hwupload,scale_vaapi=format=nv12'` : `-vf 'format=nv12,hwupload'`)
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

// gpu backend: Chromium is a native Wayland client of the stream's sway, rasterizes
// and composites on the GPU and decodes <video> with VA-API. gpuMode and
// CHROMIUM_HWDECODE don't apply — there is no software path on this backend.
// Only one --enable-features may appear on the command line (Chromium keeps the
// last one), so everything goes in this single flag.
const GPU_BACKEND_FLAGS =
  "    --ozone-platform=wayland \\\n" +
  "    --ignore-gpu-blocklist \\\n" +
  "    --enable-gpu-rasterization \\\n" +
  "    --enable-zero-copy \\\n" +
  "    --enable-features=AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL,VaapiVideoDecoder,VaapiIgnoreDriverChecks \\\n"

function buildGpuFlags(stream: Stream): string {
  if (displayBackend(stream) === "gpu") return GPU_BACKEND_FLAGS
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

// GPU_PIPELINE=full puts every stream on the gpu display backend, overriding the
// per-stream choice. Leave it unset on hosts without a VAAPI GPU (e.g. CPU-only
// Xeons): everything then stays on Xvfb + the FFMPEG_HWACCEL encoder.
export function gpuPipelineForced(): boolean {
  return (process.env.GPU_PIPELINE ?? "").toLowerCase().trim() === "full"
}

// Display backend (see scripts/display.sh):
//   "xvfb"    (default) — software X; Chromium on the CPU; ffmpeg x11grab
//   "wayland" — sway + rootful Xwayland: GPU rendering, but capture is still
//               x11grab, which reads every frame back from the GPU
//   "gpu"     — sway alone: GPU rendering, dmabuf capture and VAAPI encode, the
//               frame never touches the CPU. Measured on an i5-7400/HD 630: a
//               Grafana dashboard at 1080p 5fps went from ~63% to ~12% of a core,
//               a 4-camera page at 1080p 25fps from ~140% to ~63%.
// GPU_PIPELINE=full forces "gpu"; otherwise per stream (stream.displayBackend),
// falling back to the DISPLAY_BACKEND env for streams that don't set it.
export function displayBackend(stream?: Stream): "xvfb" | "wayland" | "gpu" {
  if (gpuPipelineForced()) return "gpu"
  const perStream = stream?.displayBackend
  if (perStream === "wayland" || perStream === "xvfb" || perStream === "gpu") return perStream
  const env = (process.env.DISPLAY_BACKEND ?? "").toLowerCase().trim()
  return env === "wayland" || env === "gpu" ? env : "xvfb"
}

// sway refuses to run as root, so the wayland/gpu backends need a dedicated user —
// and so does x11vnc, whose MIT-SHM screen grab is denied cross-uid against a
// wl-owned Xwayland (BadAccess). Both programs get this line ({{DISPLAY_USER}} in
// the template); it's empty on xvfb.
function displayUserLine(stream: Stream): string {
  return displayBackend(stream) !== "xvfb" ? `user=${process.env.DISPLAY_USER ?? "wl"}\n` : ""
}

function rtmpUrl(stream: Stream): string {
  return `rtmp://localhost:1935/live/${stream.id}`
}

// {{CHROMIUM_PRELUDE}}: on gpu, Chromium needs the compositor's socket first
function chromiumPrelude(stream: Stream): string {
  return displayBackend(stream) === "gpu" ? ". /opt/scripts/wlenv.sh && " : ""
}

// {{VNC_COMMAND}}: x11vnc on the X backends; on gpu (no X server) vnc-gpu.sh runs
// wayvnc and raises the output refresh while a VNC client is connected — see there.
function buildVncCommand(stream: Stream): string {
  if (displayBackend(stream) === "gpu") return "/opt/scripts/vnc-gpu.sh"
  return `bash -c "while [ ! -e /tmp/.X11-unix/X$(echo $DISPLAY | cut -d: -f2 | cut -d. -f1) ]; do sleep 0.2; done; exec x11vnc -nopw -listen 0.0.0.0 -rfbport ${stream.vncPort} -xkb -forever -shared -threads"`
}

// "-p key=value" pairs for wf-recorder's h264_vaapi, mirroring the ffmpeg vaapi flags
function buildWfRecorderParams(stream: Stream): string {
  // no level: the x11grab path's "-level 3.1" undersells 1080p; let the driver pick
  const params = [
    "profile=constrained_baseline",
    `g=${stream.gop}`,
  ]
  const rc = vaapiRcMode()
  if (rc === "cqp") {
    params.push("rc_mode=CQP", `qp=${vaapiQpValue()}`)
  } else {
    params.push(`rc_mode=${rc.toUpperCase()}`, `b=${stream.bitrate}`, `maxrate=${stream.bitrate}`, `bufsize=${stream.bufsize}`)
  }
  return params.map((p) => `-p ${p}`).join(" ")
}

// {{CAPTURE_COMMAND}} / {{CAPTURE_ENV}} for the ffmpeg-{id} program
function buildCapture(stream: Stream): { command: string; env: string } {
  if (displayBackend(stream) === "gpu") {
    const env: Record<string, string | number> = {
      STREAM_ID: stream.id,
      STREAM_DELAY: stream.delay,
      FPS: stream.fps,
      VAAPI_DEVICE: vaapiDevice(),
      WFR_PARAMS: buildWfRecorderParams(stream),
      RTMP_URL: rtmpUrl(stream),
    }
    return {
      command: "/opt/scripts/capture-gpu.sh",
      env: Object.entries(env).map(([k, v]) => `${k}="${v}"`).join(","),
    }
  }
  // No -shortest: on ffmpeg 7.1 it stalls an RTMP publish from x11grab + anullsrc
  // after ~10s (mediamtx then drops it on read timeout, in a restart loop). Its job —
  // exit when the display goes away — is done by -xerror: x11grab errors out as soon
  // as the X server dies, and supervisord restarts the capture.
  const command =
    `bash -c "sleep ${stream.delay} && exec ffmpeg \\\n` +
    `    -loglevel warning \\\n` +
    `    -xerror \\\n` +
    `    -threads ${stream.threads ?? 0} \\\n` +
    `    -f x11grab \\\n` +
    `    -video_size ${stream.resolution} \\\n` +
    `    -framerate ${stream.fps} \\\n` +
    `    -i ${stream.display} \\\n` +
    `    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\\n` +
    `${buildEncoderFlags(stream)}\n` +
    `    -c:a aac \\\n` +
    `    -b:a 128k \\\n` +
    `    -ar 44100 \\\n` +
    `    -ac 2 \\\n` +
    `    -fps_mode cfr \\\n` +
    `    -f flv ${rtmpUrl(stream)}"`
  return { command, env: `STREAM_ID="${stream.id}"` }
}

// normalizes scale: accepts "1280x720" or "1280:720", always saves as "1280:720"
export function normalizeScale(scale: string): string {
  return scale.replace("x", ":")
}

export function provisionStream(stream: Stream): void {
  const dir = streamDir(stream.id)
  fs.mkdirSync(path.join(dir, "chrome-profile"), { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, "logs", stream.id), { recursive: true })

  const capture = buildCapture(stream)
  const vars: Record<string, string | number> = {
    STREAM_ID:    stream.id,
    DISPLAY:      stream.display,
    RESOLUTION:   stream.resolution,
    DISPLAY_BACKEND: displayBackend(stream),
    DISPLAY_USER: displayUserLine(stream),
    VAAPI_DEVICE: vaapiDevice(),
    CHROMIUM_PRELUDE: chromiumPrelude(stream),
    VNC_COMMAND:  buildVncCommand(stream),
    CAPTURE_COMMAND: capture.command,
    CAPTURE_ENV:  capture.env,
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
  // capture directly from the display — doesn't depend on RTMP/HLS being up.
  // gpu backend has no X server: grim screenshots the compositor (as PPM — Debian's
  // grim is built without JPEG) and ffmpeg encodes the JPEG.
  const grab = displayBackend(stream) === "gpu"
    ? `STREAM_ID=${streamId} . /opt/scripts/wlenv.sh && grim -t ppm - | ffmpeg -y -loglevel error -f image2pipe -i - -frames:v 1 -q:v 2 "${tmpPath}"`
    : `ffmpeg -y -loglevel error -f x11grab -video_size ${stream.resolution} -i ${stream.display} -vframes 1 -q:v 2 "${tmpPath}"`
  const child = spawn("bash", ["-c",
    `sleep ${delay} && ${grab} && mv "${tmpPath}" "${thumbPath}"`
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
