import fs from "fs"
import path from "path"
import type { Stream } from "@/types/stream"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
export const EXT_DIR = path.join(DATA_DIR, "extensions")
export const POLICIES_DIR = process.env.POLICIES_DIR ?? "/etc/chromium/policies/managed"
const IS_DEV = process.env.NODE_ENV !== "production"

// Web Store ID: 32 chars [a-p]
export const FORCELIST_ID_RE = /^[a-p]{32}$/
// Slug: lowercase alphanumeric and dashes; no leading/trailing dash
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export function sanitizeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\.zip$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
  return base || "ext"
}

export function streamExtDir(streamId: string): string {
  return path.join(EXT_DIR, streamId)
}

export function listUnpackedSlugs(streamId: string): string[] {
  const d = streamExtDir(streamId)
  if (!fs.existsSync(d)) return []
  return fs
    .readdirSync(d, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => SLUG_RE.test(n))
}

/**
 * Builds the EXTENSIONS_FLAGS template variable.
 * - No extensions:  "    --disable-extensions \\\n"
 * - Unpacked only: "    --load-extension=<paths> \\\n"
 * - Forcelist only: "" (managed policy handles install)
 * - Both: "    --load-extension=<paths> \\\n"
 */
export function buildExtensionsFlags(stream: Stream): string {
  const ext = stream.extensions ?? {}
  const slugs = (ext.unpacked ?? []).filter((s) => SLUG_RE.test(s))
  const forcelist = (ext.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))

  if (slugs.length === 0 && forcelist.length === 0) {
    return "    --disable-extensions \\\n"
  }
  if (slugs.length === 0) {
    // forcelist only — policy installs into the profile, no flag needed
    return ""
  }
  const paths = slugs.map((s) => path.join(streamExtDir(stream.id), s)).join(",")
  return `    --load-extension=${paths} \\\n`
}

/**
 * Builds the BG_NET_FLAG template variable.
 * Forcelist installs use Chromium's component updater, which is gated by
 * --disable-background-networking. So we must omit that flag when the stream
 * has any forcelist entries; otherwise we keep it for the noise/CPU benefit.
 */
export function buildBgNetFlag(stream: Stream): string {
  const forcelist = (stream.extensions?.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))
  if (forcelist.length > 0) return ""
  return "    --disable-background-networking \\\n"
}

export function forcelistPolicyPath(streamId: string): string {
  return path.join(POLICIES_DIR, `forcelist-${streamId}.json`)
}

/**
 * Writes (or removes) the per-stream Chromium managed forcelist policy.
 * Skipped in dev or when POLICIES_DIR is not writable.
 */
export function writeForcelistPolicy(stream: Stream): void {
  const ids = (stream.extensions?.forcelist ?? []).filter((id) => FORCELIST_ID_RE.test(id))
  const file = forcelistPolicyPath(stream.id)

  if (IS_DEV) {
    console.log(`[ext mock] writeForcelistPolicy ${stream.id} ids=${ids.length}`)
    return
  }

  try {
    if (ids.length === 0) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return
    }
    fs.mkdirSync(POLICIES_DIR, { recursive: true })
    const body = {
      ExtensionInstallForcelist: ids.map(
        (id) => `${id};https://clients2.google.com/service/update2/crx`
      ),
    }
    fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf-8")
  } catch (err) {
    console.error(`[ext] writeForcelistPolicy failed for ${stream.id}:`, err)
  }
}

export function removeForcelistPolicy(streamId: string): void {
  const file = forcelistPolicyPath(streamId)
  if (IS_DEV) {
    console.log(`[ext mock] removeForcelistPolicy ${streamId}`)
    return
  }
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch (err) {
    console.error(`[ext] removeForcelistPolicy failed for ${streamId}:`, err)
  }
}

export function removeStreamExtensions(streamId: string): void {
  fs.rmSync(streamExtDir(streamId), { recursive: true, force: true })
  removeForcelistPolicy(streamId)
}
