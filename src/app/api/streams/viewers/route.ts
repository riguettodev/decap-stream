import { NextResponse } from "next/server"
import { getActiveHlsViewers } from "@/lib/viewers"
import type { ViewerSession, ViewersResponse } from "@/types/stream"

export async function GET() {
  const now = Date.now()
  const all: ViewerSession[] = [
    ...getActiveHlsViewers(),
    ...(globalThis.__vncViewers?.values() ?? []),
  ]

  const streams: ViewersResponse["streams"] = {}
  for (const session of all) {
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

  const total = all.length
  return NextResponse.json({ total, streams } satisfies ViewersResponse)
}
