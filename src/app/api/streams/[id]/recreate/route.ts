import { NextResponse } from "next/server"
import { getStream } from "@/lib/db"
import { recreateStream } from "@/lib/supervisor"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!getStream(id)) return NextResponse.json({ error: "not found" }, { status: 404 })
  recreateStream(id)
  return NextResponse.json({ ok: true })
}
