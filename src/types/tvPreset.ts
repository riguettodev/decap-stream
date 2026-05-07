export type TvClickAction = "hls" | "html" | "vnc"

export interface TvPreset {
  id: string                  // slug, ex: "default", "tarde", "mosaico-12"
  name: string                // exibição
  rows: number                // 1..20
  cols: number                // 1..20
  clickAction: TvClickAction
  slots: (string | null)[]    // length = rows*cols, valores = streamId | null
  order: number
  createdAt: string
  updatedAt: string
}

export interface TvPresetsFile {
  version: 1
  selectedPresetId: string | null
  presets: TvPreset[]
}
