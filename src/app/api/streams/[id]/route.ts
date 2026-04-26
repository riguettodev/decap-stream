import { NextResponse } from "next/server"
import { getStream, saveStream, deleteStream } from "@/lib/db"
import { provisionStream, restartStream, removeStream } from "@/lib/supervisor"
import type { StreamUpdate } from "@/types/stream"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(stream)
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = (await req.json()) as StreamUpdate
  // id and ports are immutable — strip them from PATCH body
  const { id: _id, ...safe } = body as StreamUpdate & { id?: string }
  void _id

  const updated = { ...stream, ...safe, updatedAt: new Date().toISOString() }
  saveStream(updated)
  provisionStream(updated)
  restartStream(id)

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!getStream(id)) return NextResponse.json({ error: "not found" }, { status: 404 })

  removeStream(id)
  deleteStream(id)

  return NextResponse.json({ ok: true })
}
