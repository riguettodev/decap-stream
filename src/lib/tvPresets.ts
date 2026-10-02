import fs from "fs"
import path from "path"
import { readStreams } from "./db"
import { buildSlotsFromTvPosition, resizeSlots } from "./tvwall"
import type { TvPreset, TvPresetsFile, TvClickAction } from "@/types/tvPreset"

const DATA_DIR = process.env.DATA_DIR ?? "/app/data"
const PRESETS_FILE = path.join(DATA_DIR, "streams", "tv-presets.json")

const TV_CLICK_ACTIONS: TvClickAction[] = ["hls", "html", "vnc"]

function ensureDir() {
  const dir = path.dirname(PRESETS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function envClickAction(): TvClickAction {
  const v = process.env.DEFAULT_TV_CLICK_ACTION
  return TV_CLICK_ACTIONS.includes(v as TvClickAction) ? (v as TvClickAction) : "hls"
}

function envRows(): number {
  return Math.max(1, Math.min(20, Number(process.env.DEFAULT_TV_ROWS) || 3))
}
function envCols(): number {
  return Math.max(1, Math.min(20, Number(process.env.DEFAULT_TV_COLS) || 4))
}

function nowIso(): string {
  return new Date().toISOString()
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "preset"
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function buildDefaultPreset(): TvPreset {
  const rows = envRows()
  const cols = envCols()
  const streams = readStreams()
  const slots = buildSlotsFromTvPosition(streams, rows * cols)
  const ts = nowIso()
  return {
    id: "default",
    name: "Default",
    rows,
    cols,
    clickAction: envClickAction(),
    slots,
    order: 0,
    createdAt: ts,
    updatedAt: ts,
  }
}

function writeRaw(data: TvPresetsFile): void {
  ensureDir()
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(data, null, 2), "utf-8")
}

export function readPresetsFile(): TvPresetsFile {
  ensureDir()
  if (!fs.existsSync(PRESETS_FILE)) {
    const def = buildDefaultPreset()
    const file: TvPresetsFile = {
      version: 1,
      selectedPresetId: def.id,
      presets: [def],
    }
    writeRaw(file)
    return file
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PRESETS_FILE, "utf-8")) as TvPresetsFile
    if (!raw || !Array.isArray(raw.presets)) throw new Error("invalid")
    // sort presets by order
    raw.presets.sort((a, b) => a.order - b.order)
    return raw
  } catch {
    const def = buildDefaultPreset()
    const file: TvPresetsFile = { version: 1, selectedPresetId: def.id, presets: [def] }
    writeRaw(file)
    return file
  }
}

export function writePresetsFile(file: TvPresetsFile): void {
  writeRaw(file)
}

export function getPreset(id: string): TvPreset | undefined {
  return readPresetsFile().presets.find((p) => p.id === id)
}

export function getSelectedPreset(): TvPreset | undefined {
  const f = readPresetsFile()
  if (!f.selectedPresetId) return f.presets[0]
  return f.presets.find((p) => p.id === f.selectedPresetId) ?? f.presets[0]
}

export interface CreatePresetInput {
  name: string
  rows?: number
  cols?: number
  clickAction?: TvClickAction
  slots?: (string | null)[]
}

export function createPreset(input: CreatePresetInput): TvPreset {
  const file = readPresetsFile()
  const taken = new Set(file.presets.map((p) => p.id))
  const id = uniqueId(slugify(input.name), taken)
  const rows = Math.max(1, Math.min(20, input.rows ?? envRows()))
  const cols = Math.max(1, Math.min(20, input.cols ?? envCols()))
  const size = rows * cols
  const slots = input.slots
    ? resizeSlots(input.slots, size)
    : new Array<string | null>(size).fill(null)
  const order = file.presets.length > 0 ? Math.max(...file.presets.map((p) => p.order)) + 1 : 0
  const ts = nowIso()
  const preset: TvPreset = {
    id,
    name: input.name.trim() || id,
    rows,
    cols,
    clickAction: input.clickAction ?? envClickAction(),
    slots,
    order,
    createdAt: ts,
    updatedAt: ts,
  }
  file.presets.push(preset)
  if (!file.selectedPresetId) file.selectedPresetId = preset.id
  writeRaw(file)
  return preset
}

export interface UpdatePresetPatch {
  name?: string
  rows?: number
  cols?: number
  clickAction?: TvClickAction
  slots?: (string | null)[]
}

export function updatePreset(id: string, patch: UpdatePresetPatch): TvPreset | undefined {
  const file = readPresetsFile()
  const idx = file.presets.findIndex((p) => p.id === id)
  if (idx < 0) return undefined
  const cur = file.presets[idx]
  const rows = patch.rows !== undefined ? Math.max(1, Math.min(20, patch.rows)) : cur.rows
  const cols = patch.cols !== undefined ? Math.max(1, Math.min(20, patch.cols)) : cur.cols
  const size = rows * cols
  let slots = cur.slots
  if (patch.slots) slots = resizeSlots(patch.slots, size)
  else if (rows !== cur.rows || cols !== cur.cols) slots = resizeSlots(cur.slots, size)

  const next: TvPreset = {
    ...cur,
    name: patch.name?.trim() || cur.name,
    rows,
    cols,
    clickAction: patch.clickAction ?? cur.clickAction,
    slots,
    updatedAt: nowIso(),
  }
  file.presets[idx] = next
  writeRaw(file)
  return next
}

export function deletePreset(id: string): boolean {
  const file = readPresetsFile()
  const before = file.presets.length
  file.presets = file.presets.filter((p) => p.id !== id)
  if (file.presets.length === before) return false
  if (file.selectedPresetId === id) {
    file.selectedPresetId = file.presets[0]?.id ?? null
  }
  writeRaw(file)
  return true
}

export function selectPreset(id: string | null): boolean {
  const file = readPresetsFile()
  if (id !== null && !file.presets.some((p) => p.id === id)) return false
  file.selectedPresetId = id
  writeRaw(file)
  return true
}

export function reorderPresets(ids: string[]): void {
  const file = readPresetsFile()
  const map = new Map(file.presets.map((p) => [p.id, p]))
  const out: TvPreset[] = []
  ids.forEach((id, i) => {
    const p = map.get(id)
    if (p) { p.order = i; out.push(p); map.delete(id) }
  })
  // append any unlisted at the end
  let next = out.length
  for (const p of map.values()) { p.order = next++; out.push(p) }
  file.presets = out
  writeRaw(file)
}
