import type { NextRequest } from "next/server"
import type { ViewerMode, ViewerSession } from "@/types/stream"

const HLS_TTL_MS = 3 * 60 * 1000

const hlsViewers = new Map<string, ViewerSession>()

export function extractIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

export function touchHlsViewer(streamId: string, ip: string, mode: ViewerMode, presetId?: string): void {
  // presetId is only meaningful for `wall` — including it in the key keeps
  // viewers of different presets as distinct sessions.
  const key = `${streamId}:${ip}:${mode}:${presetId ?? ""}`
  const existing = hlsViewers.get(key)
  const now = Date.now()
  hlsViewers.set(key, {
    ip,
    streamId,
    mode,
    presetId,
    connectedAt: existing?.connectedAt ?? now,
    lastSeenAt: now,
  })
}

export function getActiveHlsViewers(): ViewerSession[] {
  const now = Date.now()
  const active: ViewerSession[] = []
  for (const [key, session] of hlsViewers) {
    if (now - session.lastSeenAt > HLS_TTL_MS) {
      hlsViewers.delete(key)
    } else {
      active.push(session)
    }
  }
  return active
}
