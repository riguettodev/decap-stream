import { NextResponse } from "next/server"
import { readPresetsFile } from "@/lib/tvPresets"

const TV_CLICK_ACTIONS = ["hls", "html", "vnc"] as const
type TvClickAction = typeof TV_CLICK_ACTIONS[number]

function parseTvClickAction(v: string | undefined): TvClickAction | undefined {
  return TV_CLICK_ACTIONS.includes(v as TvClickAction) ? (v as TvClickAction) : undefined
}

export async function GET() {
  let selectedPresetId: string | null = null
  try { selectedPresetId = readPresetsFile().selectedPresetId } catch {}

  return NextResponse.json({
    pureMode: process.env.DEFAULT_PURE_MODE === "true",
    newTab: process.env.DEFAULT_OPEN_NEW_TAB === "true",
    autoReload: process.env.DEFAULT_RELOAD_CLIENT === "true",
    reloadInterval: Math.max(1, Number(process.env.DEFAULT_RELOAD_CLIENT_TIME) || 2),
    tvLayout: process.env.DEFAULT_TV_LAYOUT === "true",
    tvRows: Math.max(1, Math.min(10, Number(process.env.DEFAULT_TV_ROWS) || 3)),
    tvCols: Math.max(1, Math.min(10, Number(process.env.DEFAULT_TV_COLS) || 4)),
    tvClickAction: parseTvClickAction(process.env.DEFAULT_TV_CLICK_ACTION) ?? "hls",
    selectedPresetId,
  })
}
