import { NextResponse } from "next/server"
import { getActiveHlsViewers } from "@/lib/viewers"
import type { ViewerSession, ViewersResponse } from "@/types/stream"

export const WALL_KEY = "__wall"

export async function GET() {
  const now = Date.now()
  const all: ViewerSession[] = [
    ...getActiveHlsViewers(),
    ...(globalThis.__vncViewers?.values() ?? []),
  ]

  const streams: ViewersResponse["streams"] = {}
  const wallByIp = new Map<string, ViewerSession>()

  for (const session of all) {
    if (session.mode === "wall") {
      const existing = wallByIp.get(session.ip)
      if (!existing || session.connectedAt < existing.connectedAt) {
        wallByIp.set(session.ip, session)
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

  if (wallByIp.size > 0) {
    streams[WALL_KEY] = {
      count: wallByIp.size,
      viewers: [...wallByIp.values()].map((s) => ({
        ip: s.ip,
        mode: "wall",
        connectedAt: s.connectedAt,
        lastSeenAt: s.lastSeenAt,
        durationMs: now - s.connectedAt,
      })),
    }
  }

  const total = (all.length - [...all].filter((s) => s.mode === "wall").length) + wallByIp.size
  return NextResponse.json({ total, streams } satisfies ViewersResponse)
}
