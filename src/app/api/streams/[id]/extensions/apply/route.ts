import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { getStream } from "@/lib/db"
import { applyExtensions } from "@/lib/supervisor"
import { forcelistPolicyPath, POLICIES_DIR } from "@/lib/extensions"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  const stream = getStream(id)
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404 })

  // Capture diagnostic info so the UI can show what actually happened server-side.
  const diag: Record<string, unknown> = {
    streamId: id,
    forcelistInDb: stream.extensions?.forcelist ?? [],
    unpackedInDb: stream.extensions?.unpacked ?? [],
    policiesDir: POLICIES_DIR,
    policiesDirExists: fs.existsSync(POLICIES_DIR),
    policiesDirWritable: false,
    confPath: path.join(process.env.DATA_DIR ?? "/app/data", "streams", id, "stream.conf"),
  }
  try { fs.accessSync(POLICIES_DIR, fs.constants.W_OK); diag.policiesDirWritable = true }
  catch { /* not writable */ }

  try {
    applyExtensions(id)
  } catch (err) {
    diag.applyError = err instanceof Error ? err.message : String(err)
  }

  // Snapshot policy file after apply
  const policyFile = forcelistPolicyPath(id)
  diag.policyFile = policyFile
  diag.policyFileExists = fs.existsSync(policyFile)
  if (diag.policyFileExists) {
    try { diag.policyFileContents = fs.readFileSync(policyFile, "utf-8") }
    catch (err) { diag.policyFileReadError = err instanceof Error ? err.message : String(err) }
  }

  // Snapshot stream.conf so we can confirm EXTENSIONS_FLAGS got rendered
  try {
    const conf = fs.readFileSync(diag.confPath as string, "utf-8")
    const m = conf.match(/--load-extension=[^\s\\]+|--disable-extensions/)
    diag.confExtensionLine = m ? m[0] : "(neither --load-extension nor --disable-extensions found — OK for forcelist-only)"
    diag.confHasDisableBgNet = /--disable-background-networking/.test(conf)
  } catch (err) {
    diag.confReadError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({ ok: !diag.applyError, diag })
}
