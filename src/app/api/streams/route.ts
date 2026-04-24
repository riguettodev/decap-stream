import { NextResponse } from "next/server"
import { readStreams, saveStream, allocatePorts, getStream } from "@/lib/db"
import { provisionStream, startStream } from "@/lib/supervisor"
import { STREAM_DEFAULTS, type StreamCreate } from "@/types/stream"

export async function GET() {
  return NextResponse.json(readStreams())
}

const SLUG_RE = /^[a-z0-9-]+$/

export async function POST(req: Request) {
  const body = (await req.json()) as StreamCreate

  if (!body.id || !SLUG_RE.test(body.id))
    return NextResponse.json({ error: "id inválido: use apenas letras minúsculas, números e hífen" }, { status: 400 })

  if (!body.name || !body.url)
    return NextResponse.json({ error: "name e url são obrigatórios" }, { status: 400 })

  if (getStream(body.id))
    return NextResponse.json({ error: "já existe uma stream com esse id" }, { status: 409 })

  const ports = allocatePorts()
  const now = new Date().toISOString()

  const stream = {
    ...STREAM_DEFAULTS,
    ...body,
    ...ports,
    createdAt: now,
    updatedAt: now,
  }

  saveStream(stream)
  provisionStream(stream)
  startStream(stream.id)

  return NextResponse.json(stream, { status: 201 })
}