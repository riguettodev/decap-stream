import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { getStream } from "@/lib/db"
import { captureThumb } from "@/lib/supervisor"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const thumbPath = path.join(DATA_DIR, "streams", id, "thumb.jpg")
  if (!fs.existsSync(thumbPath)) return new Response("not found", { status: 404 })
  const buffer = fs.readFileSync(thumbPath)
  return new Response(buffer, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-cache, no-store" },
  })
}

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!getStream(id)) return NextResponse.json({ error: "not found" }, { status: 404 })
  captureThumb(id, 5)
  return NextResponse.json({ ok: true })
}
