"use client"

import { useState, useEffect, useRef } from "react"
import { Play, Square, Pencil, RotateCcw, Trash2, Copy, Check, ImageUp, Wrench, RefreshCw, Maximize2, AlignLeft, AlignCenter, AlignRight, Puzzle, ZoomIn } from "lucide-react"
import { ExtensionsModal } from "@/components/ExtensionsModal"
import { cn } from "@/lib/utils"
import type { Stream } from "@/types/stream"

export interface StreamMenuProps {
  stream: Stream
  status?: Record<string, string>
  localStatus?: string | null
  onClose: () => void
  onRefresh: () => void
  onLocalStatus: (id: string, s: string | null) => void
  onStreamUpdate?: (id: string, patch: Partial<Stream>) => void
  onOpenExtensions: () => void
  /** Optional override — if provided, replaces the built-in window.confirm() flow. */
  onDelete?: () => void
}

// Chromium's discrete keyboard zoom steps. `applyzoom.sh` snaps to the nearest
// of these and presses Ctrl++ / Ctrl+- the corresponding number of times, so
// the UI exposes them directly instead of pretending arbitrary % values work.
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500] as const

function snapZoomToStep(factor: number): number {
  const pct = Math.round(factor * 100)
  return ZOOM_STEPS.reduce((best, s) =>
    Math.abs(s - pct) < Math.abs(best - pct) ? s : best
  , ZOOM_STEPS[0])
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const el = document.createElement("textarea")
  el.value = text
  el.style.position = "fixed"
  el.style.opacity = "0"
  document.body.appendChild(el)
  el.focus(); el.select()
  document.execCommand("copy")
  document.body.removeChild(el)
  return Promise.resolve()
}

/**
 * Shared menu items used by both StreamCard's 3-dot dropdown and the
 * TV Layout right-click context menu. Renders the inner content of the
 * panel — the caller is responsible for the floating wrapper/positioning.
 */
export function StreamMenuContent(props: StreamMenuProps) {
  const { stream, status, localStatus, onClose, onRefresh, onLocalStatus, onStreamUpdate, onOpenExtensions } = props
  const [copied, setCopied] = useState(false)
  const [thumbCapturing, setThumbCapturing] = useState(false)
  const [autoReload, setAutoReload] = useState(stream.autoReload ?? false)
  const [autoReloadMins, setAutoReloadMins] = useState(Math.round((stream.autoReloadInterval ?? 3600) / 60))
  const [zoom, setZoom] = useState<number>(stream.zoom ?? 1)
  // Sync from props when the parent's stream object updates (e.g. after onRefresh
  // following a save), so closing+reopening the menu shows the persisted value.
  useEffect(() => { setZoom(stream.zoom ?? 1) }, [stream.zoom])
  const [tvFill, setTvFill] = useState(stream.tvFill ?? false)
  const [tvAlign, setTvAlign] = useState<"left" | "center" | "right">(stream.tvAlign ?? "center")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const menuItem = "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer"

  async function action(act: string, optimisticStatus: string) {
    onLocalStatus(stream.id, optimisticStatus)
    onClose()
    await fetch(`/api/streams/${stream.id}/${act}`, { method: "POST" })
    onRefresh()
    setTimeout(() => onLocalStatus(stream.id, null), 15000)
  }

  function copyRTMP() {
    const url = `rtmp://${window.location.hostname}:1935/live/${stream.id}`
    copyToClipboard(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function toggleAutoReload() {
    const next = !autoReload
    setAutoReload(next)
    await fetch(`/api/streams/${stream.id}/autoreload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next, interval: autoReloadMins * 60 }),
    })
  }

  async function saveTvDisplay(next: { fill?: boolean; align?: "left" | "center" | "right" }) {
    await fetch(`/api/streams/${stream.id}/tv-display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
  }

  function toggleTvFill() {
    const next = !tvFill
    setTvFill(next)
    saveTvDisplay({ fill: next })
  }

  function setAlign(a: "left" | "center" | "right") {
    setTvAlign(a)
    saveTvDisplay({ align: a })
  }

  const zoomSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingZoomRef = useRef<number | null>(null)
  function commitZoom(value: number) {
    pendingZoomRef.current = null
    // Optimistically update the parent's stream object so reopening the menu
    // immediately (before the POST + refetch round-trip) shows the new value.
    onStreamUpdate?.(stream.id, { zoom: value })
    void fetch(`/api/streams/${stream.id}/zoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoom: value }),
    }).then(() => onRefresh())
  }
  function scheduleSaveZoom(next: number) {
    const clamped = Math.min(5, Math.max(0.25, next))
    setZoom(clamped)
    pendingZoomRef.current = clamped
    if (zoomSaveTimer.current) clearTimeout(zoomSaveTimer.current)
    zoomSaveTimer.current = setTimeout(() => {
      zoomSaveTimer.current = null
      commitZoom(clamped)
    }, 500)
  }
  // On unmount: if there's a pending save, FLUSH it (don't cancel).
  // Closing the menu before debounce fires still persists the change.
  useEffect(() => () => {
    if (zoomSaveTimer.current) {
      clearTimeout(zoomSaveTimer.current)
      zoomSaveTimer.current = null
      if (pendingZoomRef.current != null) commitZoom(pendingZoomRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAutoReloadInterval(mins: number) {
    await fetch(`/api/streams/${stream.id}/autoreload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: autoReload, interval: mins * 60 }),
    })
  }

  async function refreshThumb() {
    onClose()
    setThumbCapturing(true)
    if (pollRef.current) clearInterval(pollRef.current)
    await fetch(`/api/streams/${stream.id}/thumb`, { method: "POST" })
    const deadline = Date.now() + 30000
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/streams/${stream.id}/thumb?t=${Date.now()}`, { cache: "no-store" })
      if (res.ok) {
        clearInterval(pollRef.current!); pollRef.current = null
        setThumbCapturing(false)
        onRefresh()
      } else if (Date.now() >= deadline) {
        clearInterval(pollRef.current!); pollRef.current = null
        setThumbCapturing(false)
      }
    }, 2000)
  }

  async function confirmRemove() {
    if (props.onDelete) { onClose(); props.onDelete(); return }
    if (!confirm(`Delete stream "${stream.name}"? This action cannot be undone.`)) return
    onClose()
    await fetch(`/api/streams/${stream.id}`, { method: "DELETE" })
    onRefresh()
  }

  return (
    <>
      <button onClick={() => { onClose(); window.location.href = `/streams/${stream.id}/edit` }} className={menuItem}>
        <Pencil className="w-3.5 h-3.5" /> Edit
      </button>
      <button onClick={() => action("restart", "restarting")} className={menuItem}>
        <RotateCcw className="w-3.5 h-3.5" /> Restart
      </button>
      <button onClick={() => action("recreate", "restarting")} className={menuItem}>
        <Wrench className="w-3.5 h-3.5" /> Recreate
      </button>
      {status?.ffmpeg === "RUNNING" || localStatus === "restarting" ? (
        <button onClick={() => action("stop", "stopping")} className={menuItem}>
          <Square className="w-3.5 h-3.5" /> Stop
        </button>
      ) : (
        <button onClick={() => action("start", "starting")} className={menuItem}>
          <Play className="w-3.5 h-3.5" /> Start
        </button>
      )}
      <button onClick={() => { onClose(); copyRTMP() }} className={menuItem}>
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied!" : "Copy RTMP"}
      </button>
      <div className="border-t border-border" />
      <button onClick={refreshThumb} disabled={thumbCapturing} className={cn(menuItem, thumbCapturing && "opacity-50")}>
        <ImageUp className="w-3.5 h-3.5" />
        {thumbCapturing ? "Capturing..." : "Refresh thumbnail"}
      </button>
      <button onClick={() => { onClose(); onOpenExtensions() }} className={cn(menuItem, "justify-between")}>
        <span className="flex items-center gap-2">
          <Puzzle className="w-3.5 h-3.5" /> Extensions...
        </span>
        {(() => {
          const count = (stream.extensions?.unpacked?.length ?? 0) + (stream.extensions?.forcelist?.length ?? 0)
          return count > 0 ? (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-600/40">
              {count}
            </span>
          ) : null
        })()}
      </button>
      <div className="border-t border-border" />
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Auto-reload
          </span>
          <button
            onClick={toggleAutoReload}
            className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0 overflow-hidden", autoReload ? "bg-blue-600" : "bg-zinc-600")}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", autoReload ? "left-[18px]" : "left-0.5")} />
          </button>
        </div>
        {autoReload && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Every</span>
            <input
              type="number"
              min={1}
              value={autoReloadMins}
              onChange={e => setAutoReloadMins(Math.max(1, Number(e.target.value) || 1))}
              onBlur={() => saveAutoReloadInterval(autoReloadMins)}
              onKeyDown={e => { if (e.key === "Enter") saveAutoReloadInterval(autoReloadMins) }}
              className="w-16 text-xs bg-[#2a2a2a] border border-border rounded px-2 py-0.5 text-center"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">min</span>
          </div>
        )}
      </div>
      <div className="border-t border-border" />
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        <span className="text-sm flex items-center gap-2">
          <ZoomIn className="w-3.5 h-3.5 shrink-0" /> Zoom
        </span>
        <select
          value={snapZoomToStep(zoom)}
          onChange={(e) => scheduleSaveZoom(Number(e.target.value) / 100)}
          title="Applying restarts this stream's Chromium"
          className="text-xs bg-[#2a2a2a] border border-border rounded px-2 py-0.5 cursor-pointer"
        >
          {ZOOM_STEPS.map((pct) => (
            <option key={pct} value={pct}>{pct}%</option>
          ))}
        </select>
      </div>
      <div className="border-t border-border" />
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm flex items-center gap-2">
            <Maximize2 className="w-3.5 h-3.5 shrink-0" /> TV fill
          </span>
          <button
            onClick={toggleTvFill}
            className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0 overflow-hidden", tvFill ? "bg-blue-600" : "bg-zinc-600")}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", tvFill ? "left-[18px]" : "left-0.5")} />
          </button>
        </div>
        {tvFill && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAlign("left")}
              className={cn("flex-1 flex items-center justify-center py-1 rounded border text-xs transition-colors cursor-pointer", tvAlign === "left" ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:bg-[#2a2a2a]")}
              title="Align left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setAlign("center")}
              className={cn("flex-1 flex items-center justify-center py-1 rounded border text-xs transition-colors cursor-pointer", tvAlign === "center" ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:bg-[#2a2a2a]")}
              title="Align center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setAlign("right")}
              className={cn("flex-1 flex items-center justify-center py-1 rounded border text-xs transition-colors cursor-pointer", tvAlign === "right" ? "bg-blue-600 border-blue-600 text-white" : "border-border hover:bg-[#2a2a2a]")}
              title="Align right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="border-t border-border" />
      <button onClick={confirmRemove} className={cn(menuItem, "text-destructive")}>
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
    </>
  )
}

/**
 * Floating context menu positioned at (x, y) viewport coords. Used for
 * right-click on TV Layout cells. Click-outside and ESC dismiss.
 */
export function StreamContextMenu({ x, y, ...menuProps }: Omit<StreamMenuProps, "onOpenExtensions"> & { x: number; y: number }) {
  const [extOpen, setExtOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Clamp to viewport once mounted (so menu doesn't overflow on right/bottom edges).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 4
    const maxY = window.innerHeight - rect.height - 4
    setPos({ x: Math.min(x, Math.max(0, maxX)), y: Math.min(y, Math.max(0, maxY)) })
  }, [x, y])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") menuProps.onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuProps])

  return (
    <>
      {extOpen && (
        <ExtensionsModal streamId={menuProps.stream.id} streamName={menuProps.stream.name} onClose={() => setExtOpen(false)} />
      )}
      <div className="fixed inset-0 z-[100]" onClick={menuProps.onClose} onContextMenu={(e) => { e.preventDefault(); menuProps.onClose() }} />
      <div
        ref={ref}
        style={{ left: pos.x, top: pos.y, background: "#1c1c1c" }}
        className="fixed z-[101] min-w-[200px] rounded-lg border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <StreamMenuContent {...menuProps} onOpenExtensions={() => setExtOpen(true)} />
      </div>
    </>
  )
}
