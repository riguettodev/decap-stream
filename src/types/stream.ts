export type StreamStatus = "running" | "stopped" | "error" | "starting" | "restarting" | "stopping"

export interface Stream {
  id: string
  name: string
  url: string
  user?: string
  pass?: string

  delay: number        // segundos antes do ffmpeg iniciar (delay de boot da stream)
  resolution: string   // tamanho do Xvfb/Chrome: "1920x1080"
  scale: string        // scale do ffmpeg output: "1280x720" (convertido para "1280:720" internamente)
  fps: number
  bitrate: string
  bufsize: string
  preset: string
  tune: string
  gop: number
  threads: number

  display: string
  vncPort: number
  debugPort: number

  desiredState: "running" | "stopped"  // #19 — estado desejado persistente

  order: number

  createdAt: string
  updatedAt: string
}

export type StreamCreate = Omit<Stream, "display" | "vncPort" | "debugPort" | "createdAt" | "updatedAt" | "desiredState" | "order">
export type StreamUpdate = Partial<StreamCreate>

export const STREAM_DEFAULTS: Omit<StreamCreate, "id" | "name" | "url"> = {
  delay: 15,
  resolution: "1920x1080",
  scale: "1280x720",
  fps: 30,
  bitrate: "1500k",
  bufsize: "3000k",
  preset: "ultrafast",
  tune: "stillimage",
  gop: 60,
  threads: 0,
}
