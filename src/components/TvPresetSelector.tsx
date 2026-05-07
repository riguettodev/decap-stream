"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react"
import type { TvPreset, TvPresetsFile, TvClickAction } from "@/types/tvPreset"

const CLICK_ACTIONS: { value: TvClickAction; label: string; desc: string }[] = [
  { value: "hls", label: "Player", desc: "HLS stream" },
  { value: "html", label: "HTML", desc: "Embedded page" },
  { value: "vnc", label: "VNC", desc: "Remote screen" },
]

export function TvPresetSelector({
  presetsFile,
  onChanged,
}: {
  presetsFile: TvPresetsFile | null
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TvPreset | null>(null)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (!presetsFile) return null
  const { presets, selectedPresetId } = presetsFile
  const selected = presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null

  async function selectPreset(id: string) {
    await fetch("/api/tv-presets/select", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setOpen(false)
    onChanged()
  }

  async function deletePreset(id: string) {
    if (!confirm("Delete this preset?")) return
    await fetch(`/api/tv-presets/${id}`, { method: "DELETE" })
    setOpen(false)
    onChanged()
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 rounded border border-border hover:bg-[#2a2a2a] transition-colors cursor-pointer max-w-[180px]"
          title="TV Wall preset"
        >
          <span className="truncate">{selected?.name ?? "(no preset)"}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </button>

        {open && (
          <div
            className="absolute top-full right-0 mt-1 z-50 w-64 rounded-lg border border-border shadow-2xl py-1.5 flex flex-col"
            style={{ background: "#1c1c1c" }}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Presets</div>
            <div className="max-h-64 overflow-y-auto">
              {presets.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No presets</div>
              )}
              {presets.map((p) => (
                <div key={p.id} className="group flex items-center hover:bg-[#2a2a2a] cursor-pointer">
                  <button
                    onClick={() => selectPreset(p.id)}
                    className="flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-left cursor-pointer min-w-0"
                  >
                    <span className="w-3.5 h-3.5 shrink-0">
                      {p.id === selected?.id && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{p.cols}×{p.rows}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(p); setOpen(false) }}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:text-white text-muted-foreground cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}
                    className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => { setCreating(true); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#2a2a2a] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New preset
              </button>
            </div>
          </div>
        )}
      </div>

      {(editing || creating) && (
        <PresetEditor
          preset={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); onChanged() }}
        />
      )}
    </>
  )
}

function PresetEditor({ preset, onClose, onSaved }: {
  preset: TvPreset | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(preset?.name ?? "")
  const [rows, setRows] = useState(preset?.rows ?? 3)
  const [cols, setCols] = useState(preset?.cols ?? 4)
  const [clickAction, setClickAction] = useState<TvClickAction>(preset?.clickAction ?? "hls")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (preset) {
        await fetch(`/api/tv-presets/${preset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, rows, cols, clickAction }),
        })
      } else {
        const res = await fetch("/api/tv-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, rows, cols, clickAction }),
        })
        const created = await res.json()
        // auto-select the new preset
        if (created?.id) {
          await fetch("/api/tv-presets/select", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: created.id }),
          })
        }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed top-16 right-6 z-50 w-72 rounded-lg border border-border shadow-2xl p-4 flex flex-col gap-3" style={{ background: "#1c1c1c" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{preset ? "Edit preset" : "New preset"}</p>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2a2a2a] cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-border bg-muted"
            autoFocus
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Grid</span>
          <input
            type="number" min={1} max={20}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 text-xs rounded border border-border bg-muted text-center"
          />
          <span className="text-xs text-muted-foreground">×</span>
          <input
            type="number" min={1} max={20}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 text-xs rounded border border-border bg-muted text-center"
          />
          <span className="text-xs text-muted-foreground">= {rows * cols}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Clicking a stream opens</span>
          <div className="grid grid-cols-3 gap-1.5">
            {CLICK_ACTIONS.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setClickAction(value)}
                className="flex flex-col items-center gap-0.5 px-2 py-2 rounded border text-xs transition-colors cursor-pointer"
                style={clickAction === value
                  ? { background: "#ededed", color: "#0a0a0a", borderColor: "#ededed" }
                  : {}}
              >
                <span className="font-medium">{label}</span>
                <span className={`text-[10px] ${clickAction === value ? "text-[#777]" : "text-muted-foreground"}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {preset && (rows !== preset.rows || cols !== preset.cols) && (
          <p className="text-[11px] text-amber-400">
            Resizing will preserve placements that still fit; overflow slots are dropped.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border hover:bg-[#2a2a2a] cursor-pointer">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="px-3 py-1.5 text-sm rounded border border-primary bg-primary text-primary-foreground hover:bg-[#2a2a2a] hover:text-foreground hover:border-border disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : preset ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </>
  )
}
