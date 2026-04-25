"use client"

import { useState, useEffect, useRef } from "react"
import { MoreHorizontal, Play, Globe, Monitor, Pencil, RotateCcw, Square, Trash2, Circle, Copy, Check, Video, ImageUp, GripVertical, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stream } from "@/types/stream"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import type { DraggableAttributes } from "@dnd-kit/core"

interface Props {
  stream: Stream
  status?: Record<string, string>
  localStatus?: string | null
  cardSize?: "mini" | "sm" | "md" | "lg"
  onRefresh: () => void
  onLocalStatus: (id: string, s: string | null) => void
  dragHandleListeners?: SyntheticListenerMap
  dragHandleAttributes?: DraggableAttributes
  isDragging?: boolean
}

function StatusBadge({ status, localStatus }: { status?: Record<string, string>; localStatus?: string | null }) {
  const label = localStatus ?? (
    status?.ffmpeg === "RUNNING"  ? "running"  :
    status?.ffmpeg === "STARTING" ? "starting" :
    status?.ffmpeg === "FATAL"    ? "error"    :
    status?.ffmpeg === "STOPPED"  ? "stopped"  : "..."
  )
  const color =
    label === "running"    ? "bg-green-500"  :
    label === "starting"   ? "bg-yellow-500" :
    label === "restarting" ? "bg-yellow-500" :
    label === "stopping"   ? "bg-orange-500" :
    label === "error"      ? "bg-red-500"    : "bg-zinc-500"
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      <Circle className={cn("w-2 h-2 fill-current shrink-0", color)} />
      {label}
    </span>
  )
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  const el = document.createElement("textarea")
  el.value = text
  el.style.position = "fixed"
  el.style.opacity = "0"
  document.body.appendChild(el)
  el.focus()
  el.select()
  document.execCommand("copy")
  document.body.removeChild(el)
  return Promise.resolve()
}

const CARD_WIDTHS = { mini: "max-w-[200px]", sm: "max-w-[240px]", md: "max-w-[300px]", lg: "max-w-[380px]" }

function ConfirmDeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-80 rounded-xl border border-border shadow-2xl p-6 flex flex-col gap-4" style={{ background: "#1c1c1c" }}>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-sm">Delete stream</p>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="text-foreground font-medium">{name}</span>? This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded border border-border text-sm hover:bg-[#2a2a2a] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded border border-destructive bg-destructive/10 text-destructive text-sm hover:bg-destructive hover:text-white transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function StreamCard({ stream, status, localStatus, cardSize = "md", onRefresh, onLocalStatus, dragHandleListeners, dragHandleAttributes, isDragging }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [thumbKey, setThumbKey] = useState(0)
  const [thumbError, setThumbError] = useState(false)
  const [thumbCapturing, setThumbCapturing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!thumbError || thumbCapturing) return
    const interval = setInterval(() => setThumbKey((k) => k + 1), 15000)
    return () => clearInterval(interval)
  }, [thumbError, thumbCapturing])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function action(act: string, optimisticStatus: string) {
    onLocalStatus(stream.id, optimisticStatus)
    setMenuOpen(false)
    await fetch(`/api/streams/${stream.id}/${act}`, { method: "POST" })
    onRefresh()
    setTimeout(() => onLocalStatus(stream.id, null), 15000)
  }

  async function remove() {
    setMenuOpen(false)
    setConfirmDelete(true)
  }

  async function confirmRemove() {
    setConfirmDelete(false)
    await fetch(`/api/streams/${stream.id}`, { method: "DELETE" })
    onRefresh()
  }

  function openVNC() {
    const token = encodeURIComponent(`token=${stream.id}`)
    window.open(`http://${window.location.hostname}:6080/vnc.html?autoconnect=true&path=websockify%3F${token}`, "_blank")
  }

  function copyRTMP() {
    const url = `rtmp://${window.location.hostname}:1935/live/${stream.id}`
    copyToClipboard(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function refreshThumb() {
    setMenuOpen(false)
    setThumbError(false)
    setThumbCapturing(true)
    if (pollRef.current) clearInterval(pollRef.current)
    await fetch(`/api/streams/${stream.id}/thumb`, { method: "POST" })
    const deadline = Date.now() + 30000
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/streams/${stream.id}/thumb?t=${Date.now()}`, { cache: "no-store" })
      if (res.ok) {
        clearInterval(pollRef.current!); pollRef.current = null
        setThumbKey((k) => k + 1)
        setThumbCapturing(false)
      } else if (Date.now() >= deadline) {
        clearInterval(pollRef.current!); pollRef.current = null
        setThumbCapturing(false)
      }
    }, 2000)
  }

  function play(mode: string) {
    window.location.href = `/player/${stream.id}?mode=${mode}`
  }

  const playBtn = "w-full flex items-center gap-2 text-xs px-3 py-2 rounded border border-border bg-muted hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer"
  const menuItem = "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer"

  return (
    <>
    {confirmDelete && (
      <ConfirmDeleteModal
        name={stream.name}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    <div className={cn("relative rounded-lg border border-border bg-card p-3 flex flex-col gap-2.5 w-full transition-opacity", CARD_WIDTHS[cardSize], isDragging && "opacity-40")}>

      {/* Drag handle strip */}
      {(dragHandleListeners || dragHandleAttributes) && (
        <div
          {...dragHandleListeners}
          {...dragHandleAttributes}
          className="-mx-3 -mt-3 h-7 flex items-center justify-center rounded-t-lg cursor-grab active:cursor-grabbing hover:bg-white/[0.05] transition-colors border-b border-border/40 group"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/65 transition-colors" />
        </div>
      )}

      {/* Thumbnail */}
      <div className="w-full aspect-video rounded overflow-hidden bg-muted flex items-center justify-center relative">
        {thumbCapturing ? (
          <span className="text-xs text-muted-foreground animate-pulse">Capturing...</span>
        ) : (
          <>
            {thumbError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Video className="w-5 h-5 text-muted-foreground/25" />
              </div>
            )}
            <img
              key={thumbKey}
              src={`/api/streams/${stream.id}/thumb?t=${thumbKey}`}
              className={cn("w-full h-full object-cover", thumbError && "invisible")}
              onError={() => setThumbError(true)}
              onLoad={() => setThumbError(false)}
            />
          </>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{stream.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">{stream.id}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={status} localStatus={localStatus} />
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-border shadow-2xl overflow-hidden"
                     style={{ background: "#1c1c1c" }}>
                  <button onClick={() => { setMenuOpen(false); window.location.href = `/streams/${stream.id}/edit` }} className={menuItem}>
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
                  <button onClick={() => { setMenuOpen(false); copyRTMP() }} className={menuItem}>
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy RTMP"}
                  </button>
                  <div className="border-t border-border" />
                  <button onClick={refreshThumb} disabled={thumbCapturing} className={cn(menuItem, thumbCapturing && "opacity-50")}>
                    <ImageUp className="w-3.5 h-3.5" />
                    {thumbCapturing ? "Capturing..." : "Refresh thumbnail"}
                  </button>
                  <div className="border-t border-border" />
                  <button onClick={remove} className={cn(menuItem, "text-destructive")}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground truncate" title={stream.url}>{stream.url}</p>

      <div className="flex flex-col gap-1.5">
        <button onClick={() => play("hls")}  className={playBtn}><Play    className="w-3 h-3 shrink-0" /> Play Stream</button>
        <button onClick={() => play("html")} className={playBtn}><Globe   className="w-3 h-3 shrink-0" /> Run HTML</button>
        <button onClick={openVNC}            className={playBtn}><Monitor className="w-3 h-3 shrink-0" /> Open VNC</button>
      </div>
    </div>
    </>
  )
}
