import fs from "fs"
import path from "path"
import { execSync, spawn } from "child_process"
import type { Stream } from "@/types/stream"

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
    // supervisorctl retorna exit 1 em alguns casos não-fatais
  }
}

// #6 — converte "1920x1080" → "1920,1080" para o Chrome
function resolutionToChrome(res: string): string {
  return res.replace("x", ",")
}

// #13 — normaliza scale: aceita "1280x720" ou "1280:720", sempre salva "1280:720"
export function normalizeScale(scale: string): string {
  return scale.replace("x", ":")
}

export function provisionStream(stream: Stream): void {
  const dir = streamDir(stream.id)
  fs.mkdirSync(path.join(dir, "chrome-profile"), { recursive: true })

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
  }

  const autologinTpl = fs.readFileSync("/opt/scripts/autologin.template.sh", "utf-8")
  const autologinPath = path.join(dir, "autologin.sh")
  fs.writeFileSync(autologinPath, render(autologinTpl, vars), "utf-8")
  fs.chmodSync(autologinPath, 0o755)

  const confTpl = fs.readFileSync("/opt/scripts/stream.template.conf", "utf-8")
  const confPath = path.join(dir, "stream.conf")
  fs.writeFileSync(confPath, render(confTpl, vars), "utf-8")

  fs.mkdirSync(VNC_TOKENS_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(VNC_TOKENS_DIR, `${stream.id}.cfg`),
    `${stream.id}: localhost:${stream.vncPort}\n`,
    "utf-8"
  )

  supervisorctl("reread")
  supervisorctl("update")
}

export function startStream(id: string): void {
  const programs = ["xvfb", "chromium", "autologin", "x11vnc", "ffmpeg"]
  for (const p of programs) supervisorctl(`start ${p}-${id}`)
}

export function stopStream(id: string): void {
  const programs = ["ffmpeg", "x11vnc", "autologin", "chromium", "xvfb"]
  for (const p of programs) supervisorctl(`stop ${p}-${id}`)
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
  const thumbPath = path.join(STREAMS_DIR, streamId, "thumb.jpg")
  const tmpPath = `${thumbPath}.tmp`
  const child = spawn("bash", ["-c",
    `sleep ${delay} && ffmpeg -y -loglevel error -i http://localhost:8888/live/${streamId}/index.m3u8 -vframes 1 -q:v 2 "${tmpPath}" && mv "${tmpPath}" "${thumbPath}"`
  ], { detached: true, stdio: "ignore" })
  child.unref()
}

export type ProgramStatus = "RUNNING" | "STOPPED" | "FATAL" | "STARTING" | "UNKNOWN"

export function getStreamStatus(id: string): Record<string, ProgramStatus> {
  const programs = ["xvfb", "chromium", "autologin", "x11vnc", "ffmpeg"]

  if (IS_DEV) {
    return Object.fromEntries(programs.map((p) => [p, "STOPPED" as ProgramStatus]))
  }

  const result: Record<string, ProgramStatus> = {}
  for (const p of programs) {
    try {
      const out = execSync(
        `supervisorctl -c /etc/supervisor/supervisord.conf status ${p}-${id}`,
        { stdio: "pipe" }
      ).toString()
      const match = out.match(/\b(RUNNING|STOPPED|FATAL|STARTING)\b/)
      result[p] = (match?.[1] as ProgramStatus) ?? "UNKNOWN"
    } catch {
      result[p] = "UNKNOWN"
    }
  }
  return result
}
