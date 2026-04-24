import { NextResponse } from "next/server"
import { getStream } from "@/lib/db"
import { startStream, stopStream, restartStream } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string; action: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id, action } = await params

  if (!getStream(id)) return NextResponse.json({ error: "não encontrado" }, { status: 404 })

  switch (action) {
    case "start":   startStream(id);   break
    case "stop":    stopStream(id);    break
    case "restart": restartStream(id); break
    default:
      return NextResponse.json({ error: "ação inválida" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
