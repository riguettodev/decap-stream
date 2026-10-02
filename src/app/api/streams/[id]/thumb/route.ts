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
  const tmpPath = path.join(DATA_DIR, "streams", id, "thumb.tmp.jpg")

  if (fs.existsSync(thumbPath)) {
    const buffer = fs.readFileSync(thumbPath)
    return new Response(buffer, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-cache, no-store" },
    })
  }

  // Auto-trigger capture when no thumb exists and no capture is already in progress
  if (!fs.existsSync(tmpPath) && getStream(id)) {
    captureThumb(id, 5)
  }

  return new Response("not found", { status: 404 })
}

// Just the Last-Modified of thumb.jpg — the UI polls it (watchThumb) to know when a
// new capture landed without downloading the image, and never triggers a capture.
export async function HEAD(_req: Request, { params }: Ctx) {
  const { id } = await params
  const thumbPath = path.join(DATA_DIR, "streams", id, "thumb.jpg")
  if (!fs.existsSync(thumbPath)) return new Response(null, { status: 404 })
  return new Response(null, {
    headers: {
      "Last-Modified": fs.statSync(thumbPath).mtime.toUTCString(),
      "Cache-Control": "no-cache, no-store",
    },
  })
}

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!getStream(id)) return NextResponse.json({ error: "not found" }, { status: 404 })
  captureThumb(id, 5, { force: true })   // explicit user action — bypass the poll throttle
  return NextResponse.json({ ok: true })
}
