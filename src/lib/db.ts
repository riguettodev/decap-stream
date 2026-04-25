import fs from "fs"
import path from "path"
import type { Stream } from "@/types/stream"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
const STREAMS_FILE = path.join(DATA_DIR, "streams.json")

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(STREAMS_FILE)) fs.writeFileSync(STREAMS_FILE, "[]", "utf-8")
}

export function readStreams(): Stream[] {
  ensureFile()
  const streams = JSON.parse(fs.readFileSync(STREAMS_FILE, "utf-8")) as Stream[]
  // migrate: assign order to streams that don't have it yet
  let dirty = false
  streams.forEach((s, i) => {
    if (s.order === undefined) { s.order = i; dirty = true }
  })
  if (dirty) fs.writeFileSync(STREAMS_FILE, JSON.stringify(streams, null, 2), "utf-8")
  return streams.sort((a, b) => a.order - b.order)
}

export function writeStreams(streams: Stream[]): void {
  ensureFile()
  fs.writeFileSync(STREAMS_FILE, JSON.stringify(streams, null, 2), "utf-8")
}

export function getStream(id: string): Stream | undefined {
  return readStreams().find((s) => s.id === id)
}

export function saveStream(stream: Stream): void {
  const streams = readStreams()
  const idx = streams.findIndex((s) => s.id === stream.id)
  if (idx >= 0) streams[idx] = stream
  else streams.push(stream)
  writeStreams(streams)
}

export function deleteStream(id: string): void {
  writeStreams(readStreams().filter((s) => s.id !== id))
}

// Aloca display, portas VNC, noVNC e debug sem conflito com streams existentes
export function allocatePorts(): {
  display: string
  vncPort: number
  debugPort: number
} {
  const streams = readStreams()
  const usedDisplays = new Set(streams.map((s) => s.display))

  let n = 1
  while (usedDisplays.has(`:${n}`)) n++

  return {
    display: `:${n}`,
    vncPort: 5900 + n,
    debugPort: 9221 + n,
  }
}