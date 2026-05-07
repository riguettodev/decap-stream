import type { Stream } from "@/types/stream"

/**
 * Build a slots array (length = maxCells) from streams' tvPosition field.
 * Streams with a valid tvPosition are placed at that index.
 * Streams without (or with out-of-range) tvPosition are auto-filled into the first empty slots.
 *
 * Used only by the one-shot migration from `tvPosition` -> tv-presets default.
 */
export function buildSlotsFromTvPosition(streams: Stream[], maxCells: number): (string | null)[] {
  const slots = new Array<string | null>(maxCells).fill(null)
  const placed = new Set<string>()

  for (const s of streams) {
    const pos = s.tvPosition
    if (typeof pos === "number" && pos >= 0 && pos < maxCells && slots[pos] === null) {
      slots[pos] = s.id
      placed.add(s.id)
    }
  }

  let fill = 0
  for (const s of streams) {
    if (placed.has(s.id)) continue
    while (fill < maxCells && slots[fill] !== null) fill++
    if (fill >= maxCells) break
    slots[fill] = s.id
    fill++
  }
  return slots
}

/**
 * Resize a slots array, preserving placements that still fit.
 * Slots that overflow the new size are dropped.
 */
export function resizeSlots(prev: (string | null)[], newSize: number): (string | null)[] {
  const out = new Array<string | null>(newSize).fill(null)
  for (let i = 0; i < Math.min(prev.length, newSize); i++) out[i] = prev[i]
  return out
}
