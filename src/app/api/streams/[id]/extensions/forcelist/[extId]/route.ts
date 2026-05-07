import { NextResponse } from "next/server"
import { getStream, saveStream } from "@/lib/db"

type Ctx = { params: Promise<{ id: string; extId: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, extId } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const current = stream.extensions?.forcelist ?? []
  const next = current.filter((x) => x !== extId)
  const updated = {
    ...stream,
    extensions: { ...(stream.extensions ?? {}), forcelist: next },
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)
  return NextResponse.json({ forcelist: next })
}
