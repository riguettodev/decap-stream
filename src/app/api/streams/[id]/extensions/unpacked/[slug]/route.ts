import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { getStream, saveStream } from "@/lib/db"
import { streamExtDir, listUnpackedSlugs, SLUG_RE } from "@/lib/extensions"

type Ctx = { params: Promise<{ id: string; slug: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, slug } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 })

  const root = streamExtDir(id)
  const target = path.join(root, slug)
  const resolved = path.resolve(target)
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 })
  }
  fs.rmSync(target, { recursive: true, force: true })

  const remaining = listUnpackedSlugs(id)
  const updated = {
    ...stream,
    extensions: { ...(stream.extensions ?? {}), unpacked: remaining },
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)
  return NextResponse.json({ unpacked: remaining })
}
