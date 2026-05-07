import { NextResponse } from "next/server"
import { getActiveHlsViewers } from "@/lib/viewers"
import type { ViewerSession, ViewersResponse } from "@/types/stream"

export const WALL_KEY = "__wall"
// Per-preset wall keys look like `__wall:<presetId>`. Legacy/unknown preset
// falls back to plain `__wall`.

export async function GET() {
  const now = Date.now()
  const all: ViewerSession[] = [
    ...getActiveHlsViewers(),
    ...(globalThis.__vncViewers?.values() ?? []),
  ]

  const streams: ViewersResponse["streams"] = {}
  // Dedup wall viewers by (ip, presetId): one person watching a wall counts as
  // 1 viewer per preset, regardless of how many cells the wall has.
  const wallByIpPreset = new Map<string, ViewerSession>()

  for (const session of all) {
    if (session.mode === "wall") {
      const k = `${session.ip}|${session.presetId ?? ""}`
      const existing = wallByIpPreset.get(k)
      if (!existing || session.connectedAt < existing.connectedAt) {
        wallByIpPreset.set(k, session)
      } else if (session.lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = session.lastSeenAt
      }
      continue
    }
    if (!streams[session.streamId]) {
      streams[session.streamId] = { count: 0, viewers: [] }
    }
    streams[session.streamId].count++
    streams[session.streamId].viewers.push({
      ip: session.ip,
      mode: session.mode,
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
      durationMs: now - session.connectedAt,
    })
  }

  for (const session of wallByIpPreset.values()) {
    const key = session.presetId ? `${WALL_KEY}:${session.presetId}` : WALL_KEY
    if (!streams[key]) streams[key] = { count: 0, viewers: [] }
    streams[key].count++
    streams[key].viewers.push({
      ip: session.ip,
      mode: "wall",
      presetId: session.presetId,
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
      durationMs: now - session.connectedAt,
    })
  }

  const total = (all.length - [...all].filter((s) => s.mode === "wall").length) + wallByIpPreset.size
  return NextResponse.json({ total, streams } satisfies ViewersResponse)
}
