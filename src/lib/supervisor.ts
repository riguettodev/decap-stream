import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import type { Stream } from "@/types/stream"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
const STREAMS_DIR = path.join(DATA_DIR, "streams")

function streamDir(id: string) {
  return path.join(STREAMS_DIR, id)
}

function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""))
}

const IS_DEV = process.env.NODE_ENV !== "production"

function supervisorctl(cmd: string) {
  if (IS_DEV) {
    console.log(`[supervisor mock] supervisorctl ${cmd}`)
    return
  }
  try {
    execSync(`supervisorctl -c /etc/supervisor/supervisord.conf ${cmd}`, { stdio: "pipe" })
  } catch {
    // supervisorctl retorna exit 1 em alguns casos não-fatais (ex: já parado)
  }
}

export function provisionStream(stream: Stream): void {
  const dir = streamDir(stream.id)
  fs.mkdirSync(path.join(dir, "chrome-profile"), { recursive: true })

  const vars: Record<string, string | number> = {
    STREAM_ID:   stream.id,
    DISPLAY:     stream.display,
    RESOLUTION:  stream.resolution,
    STREAM_URL:  stream.url,
    DEBUG_PORT:  stream.debugPort,
    VNC_PORT:    stream.vncPort,
    NOVNC_PORT:  stream.novncPort,
    STREAM_DELAY: stream.delay,
    FPS:         stream.fps,
    PRESET:      stream.preset,
    TUNE:        stream.tune,
    GOP:         stream.gop,
    BITRATE:     stream.bitrate,
    BUFSIZE:     stream.bufsize,
    USER:        stream.user ?? "",
    PASS:        stream.pass ?? "",
  }

  // autologin.sh
  const autologinTpl = fs.readFileSync("/opt/scripts/autologin.template.sh", "utf-8")
  const autologinPath = path.join(dir, "autologin.sh")
  fs.writeFileSync(autologinPath, render(autologinTpl, vars), "utf-8")
  fs.chmodSync(autologinPath, 0o755)

  // stream.conf
  const confTpl = fs.readFileSync("/opt/scripts/stream.template.conf", "utf-8")
  const confPath = path.join(dir, "stream.conf")
  fs.writeFileSync(confPath, render(confTpl, vars), "utf-8")

  // Recarrega supervisord para reconhecer o novo conf
  supervisorctl("reread")
  supervisorctl("update")
}

export function startStream(id: string): void {
  const programs = ["xvfb", "chrome", "autologin", "x11vnc", "novnc", "ffmpeg"]
  for (const p of programs) {
    supervisorctl(`start ${p}-${id}`)
  }
}

export function stopStream(id: string): void {
  const programs = ["ffmpeg", "novnc", "x11vnc", "autologin", "chrome", "xvfb"]
  for (const p of programs) {
    supervisorctl(`stop ${p}-${id}`)
  }
}

export function restartStream(id: string): void {
  stopStream(id)
  startStream(id)
}

export function removeStream(id: string): void {
  stopStream(id)

  const confPath = path.join(streamDir(id), "stream.conf")
  if (fs.existsSync(confPath)) fs.unlinkSync(confPath)

  supervisorctl("reread")
  supervisorctl("update")

  // Remove pasta da stream
  fs.rmSync(streamDir(id), { recursive: true, force: true })
}

export type ProgramStatus = "RUNNING" | "STOPPED" | "FATAL" | "STARTING" | "UNKNOWN"

export function getStreamStatus(id: string): Record<string, ProgramStatus> {
  const programs = ["xvfb", "chrome", "autologin", "x11vnc", "novnc", "ffmpeg"]

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