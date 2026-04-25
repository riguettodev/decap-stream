import { NextResponse } from "next/server"
import { readStreams, saveStream, allocatePorts, getStream } from "@/lib/db"
import { provisionStream, startStream, normalizeScale, captureThumb } from "@/lib/supervisor"
import { STREAM_DEFAULTS, type StreamCreate } from "@/types/stream"

export async function GET() {
  return NextResponse.json(readStreams())
}

const SLUG_RE = /^[a-z0-9-]+$/

export async function POST(req: Request) {
  const body = (await req.json()) as StreamCreate

  if (!body.id || !SLUG_RE.test(body.id))
    return NextResponse.json({ error: "invalid id: use only lowercase letters, numbers and hyphens" }, { status: 400 })

  if (!body.name || !body.url)
    return NextResponse.json({ error: "name and url are required" }, { status: 400 })

  if (getStream(body.id))
    return NextResponse.json({ error: "a stream with this id already exists" }, { status: 409 })

  const ports = allocatePorts()
  const now = new Date().toISOString()
  const existing = readStreams()
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((s) => s.order)) + 1 : 0

  const stream = {
    ...STREAM_DEFAULTS,
    ...body,
    scale: normalizeScale(body.scale ?? STREAM_DEFAULTS.scale), // #13
    ...ports,
    desiredState: "running" as const, // #19
    order: nextOrder,
    createdAt: now,
    updatedAt: now,
  }

  saveStream(stream)
  provisionStream(stream)
  startStream(stream.id)
  captureThumb(stream.id, 60)

  return NextResponse.json(stream, { status: 201 })
}
