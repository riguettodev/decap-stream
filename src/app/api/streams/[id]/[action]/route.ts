import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"
import { startStream, stopStream, restartStream } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string; action: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id, action } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  switch (action) {
    case "start":
      saveStream({ ...stream, desiredState: "running", updatedAt: new Date().toISOString() }) // #19
      startStream(id)
      break
    case "stop":
      saveStream({ ...stream, desiredState: "stopped", updatedAt: new Date().toISOString() }) // #19
      stopStream(id)
      break
    case "restart":
      saveStream({ ...stream, desiredState: "running", updatedAt: new Date().toISOString() }) // #19
      restartStream(id)
      break
    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
