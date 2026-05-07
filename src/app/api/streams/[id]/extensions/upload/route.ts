import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import AdmZip from "adm-zip"
import { getStream, saveStream } from "@/lib/db"
import { sanitizeSlug, streamExtDir, listUnpackedSlugs, SLUG_RE } from "@/lib/extensions"

type Ctx = { params: Promise<{ id: string }> }

export const runtime = "nodejs"

const MAX_ZIP_BYTES = 50 * 1024 * 1024          // 50 MB compressed
const MAX_FILES = 1000
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024 // 200 MB

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 })

  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 })

  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: `zip exceeds ${MAX_ZIP_BYTES} bytes` }, { status: 413 })
  }

  // Slug from optional form field, falling back to filename
  const rawSlug = (form.get("slug") as string | null) ?? file.name
  const slug = sanitizeSlug(rawSlug)
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 })
  }

  // Read zip into memory
  const buf = Buffer.from(await file.arrayBuffer())

  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch {
    return NextResponse.json({ error: "invalid zip file" }, { status: 400 })
  }

  const entries = zip.getEntries()
  if (entries.length === 0) {
    return NextResponse.json({ error: "empty zip" }, { status: 400 })
  }
  if (entries.length > MAX_FILES) {
    return NextResponse.json({ error: `zip exceeds ${MAX_FILES} files` }, { status: 413 })
  }

  // Detect a single top-level dir wrapper (common for ZIPs from GitHub, Web Store CRX→zip)
  const tops = new Set<string>()
  for (const e of entries) {
    const top = e.entryName.split("/")[0]
    if (top) tops.add(top)
  }
  const hasWrapper = tops.size === 1
  const wrapper = hasWrapper ? Array.from(tops)[0] + "/" : ""

  // Validate: total size, paths, manifest.json present
  let totalSize = 0
  let manifestSeen = false
  for (const e of entries) {
    if (e.isDirectory) continue
    totalSize += e.header.size
    if (totalSize > MAX_TOTAL_UNCOMPRESSED) {
      return NextResponse.json({ error: "zip uncompressed size exceeds limit" }, { status: 413 })
    }
    const rel = hasWrapper ? e.entryName.slice(wrapper.length) : e.entryName
    // Path traversal / absolute path / NUL guards
    if (
      rel.includes("..") ||
      rel.startsWith("/") ||
      rel.startsWith("\\") ||
      rel.includes("\0") ||
      /^[a-zA-Z]:/.test(rel)
    ) {
      return NextResponse.json({ error: `unsafe path in zip: ${e.entryName}` }, { status: 400 })
    }
    if (rel === "manifest.json") manifestSeen = true
  }

  if (!manifestSeen) {
    return NextResponse.json({ error: "manifest.json not found at extension root" }, { status: 400 })
  }

  // Resolve target dir; ensure final resolved path stays inside streamExtDir
  const targetRoot = streamExtDir(id)
  fs.mkdirSync(targetRoot, { recursive: true })
  const targetDir = path.join(targetRoot, slug)
  const resolvedTarget = path.resolve(targetDir)
  if (!resolvedTarget.startsWith(path.resolve(targetRoot) + path.sep) && resolvedTarget !== path.resolve(targetRoot)) {
    return NextResponse.json({ error: "invalid target path" }, { status: 400 })
  }

  // Extract; replace any existing slug dir
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })

  for (const e of entries) {
    const rel = hasWrapper ? e.entryName.slice(wrapper.length) : e.entryName
    if (!rel) continue
    const outPath = path.join(targetDir, rel)
    const resolvedOut = path.resolve(outPath)
    if (!resolvedOut.startsWith(path.resolve(targetDir) + path.sep) && resolvedOut !== path.resolve(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      return NextResponse.json({ error: "path traversal detected" }, { status: 400 })
    }
    if (e.isDirectory) {
      fs.mkdirSync(outPath, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, e.getData())
    }
  }

  // Persist slug list (filesystem is source of truth)
  const allSlugs = listUnpackedSlugs(id)
  const updated = {
    ...stream,
    extensions: { ...(stream.extensions ?? {}), unpacked: allSlugs },
    updatedAt: new Date().toISOString(),
  }
  saveStream(updated)

  return NextResponse.json({ slug, unpacked: allSlugs })
}
