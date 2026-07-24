"use client"

import { useState, useEffect, useRef, useLayoutEffect } from "react"
import { MoreHorizontal, Play, Globe, Monitor, Circle, Video, GripVertical } from "lucide-react"
import { ExtensionsModal } from "@/components/ExtensionsModal"
import { StreamMenuContent } from "@/components/StreamMenu"
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
  onStreamUpdate?: (id: string, patch: Partial<Stream>) => void
  dragHandleListeners?: SyntheticListenerMap
  dragHandleAttributes?: DraggableAttributes
  isDragging?: boolean
  globalPrefs: { pureMode: boolean; newTab: boolean }
}

function StatusBadge({ status, localStatus, cardSize = "md" }: { status?: Record<string, string>; localStatus?: string | null; cardSize?: "mini" | "sm" | "md" | "lg" }) {
  const sc = SCALE[cardSize]
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
    <span className={cn("flex items-center gap-1.5 text-muted-foreground whitespace-nowrap", sc.meta)}>
      <Circle className={cn("fill-current shrink-0", color, sc.dot)} />
      {label}
    </span>
  )
}

const CARD_WIDTHS = { mini: "sm:max-w-[200px]", sm: "sm:max-w-[240px]", md: "sm:max-w-[300px]", lg: "sm:max-w-[380px]" }

const SCALE = {
  mini: { card: "p-2 gap-2",     name: "text-xs",  meta: "text-[10px]", btn: "text-[10px] px-2 py-1 gap-1.5",   btnIcon: "w-2.5 h-2.5", menuIcon: "w-3.5 h-3.5", dot: "w-1.5 h-1.5" },
  sm:   { card: "p-2.5 gap-2",   name: "text-xs",  meta: "text-[10px]", btn: "text-xs px-2.5 py-1.5 gap-1.5",  btnIcon: "w-2.5 h-2.5", menuIcon: "w-3.5 h-3.5", dot: "w-1.5 h-1.5" },
  md:   { card: "p-3 gap-2.5",   name: "text-sm",  meta: "text-xs",     btn: "text-xs px-3 py-2 gap-2",         btnIcon: "w-3 h-3",     menuIcon: "w-4 h-4",     dot: "w-2 h-2"     },
  lg:   { card: "p-4 gap-3",     name: "text-base", meta: "text-sm",    btn: "text-sm px-4 py-2.5 gap-2",       btnIcon: "w-4 h-4",     menuIcon: "w-4 h-4",     dot: "w-2 h-2"     },
} satisfies Record<string, { card: string; name: string; meta: string; btn: string; btnIcon: string; menuIcon: string; dot: string }>

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
          <button onClick={onCancel} className="px-4 py-1.5 rounded border border-border text-sm hover:bg-[#2a2a2a] transition-colors cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 rounded border border-destructive bg-destructive/10 text-destructive text-sm hover:bg-destructive hover:text-white transition-colors cursor-pointer">Delete</button>
        </div>
      </div>
    </div>
  )
}

export function StreamCard({ stream, status, localStatus, cardSize = "md", onRefresh, onLocalStatus, onStreamUpdate, dragHandleListeners, dragHandleAttributes, isDragging, globalPrefs }: Props) {
  const sc = SCALE[cardSize]
  const [menuOpen, setMenuOpen] = useState(false)
  const [thumbKey, setThumbKey] = useState(0)
  const [thumbError, setThumbError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [extOpen, setExtOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)

  // When the menu opens, position it under the 3-dot button (right-aligned),
  // then clamp to the viewport — flipping above the button if there isn't
  // enough space below (covers cards on the second row of the kanban).
  useLayoutEffect(() => {
    if (!menuOpen) { setMenuPos(null); return }
    const btn = menuButtonRef.current
    const el = menuRef.current
    if (!btn || !el) return
    function reposition() {
      if (!btn || !el) return
      const btnRect = btn.getBoundingClientRect()
      const menuRect = el.getBoundingClientRect()
      const gap = 4
      const margin = 8
      let left = btnRect.right - menuRect.width
      let top = btnRect.bottom + gap
      if (top + menuRect.height > window.innerHeight - margin) {
        const flipped = btnRect.top - gap - menuRect.height
        top = flipped >= margin ? flipped : Math.max(margin, window.innerHeight - menuRect.height - margin)
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin))
      setMenuPos({ left, top })
    }
    reposition()
    const ro = new ResizeObserver(reposition)
    ro.observe(el)
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [menuOpen])

  // Exponential backoff: a stream whose thumb never lands (display down, capture
  // failing) would otherwise re-request every 15s forever, and each miss asks the
  // server for a fresh 1080p x11grab.
  const thumbRetries = useRef(0)
  useEffect(() => {
    if (!thumbError) { thumbRetries.current = 0; return }
    const delay = Math.min(15000 * 2 ** thumbRetries.current, 300000)
    const timer = setTimeout(() => {
      thumbRetries.current += 1
      setThumbKey((k) => k + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [thumbError, thumbKey])

  function navigate(url: string) {
    if (globalPrefs.newTab) window.open(url, "_blank")
    else window.location.href = url
  }

  async function confirmRemove() {
    setConfirmDelete(false)
    await fetch(`/api/streams/${stream.id}`, { method: "DELETE" })
    onRefresh()
  }

  function openVNC() {
    navigate(`/vnc/${stream.id}`)
  }

  function handlePlayStream() {
    navigate(globalPrefs.pureMode
      ? `/api/hls/live/${stream.id}/index.m3u8`
      : `/player/${stream.id}?mode=hls`)
  }

  function handleRunHtml() {
    navigate(globalPrefs.pureMode
      ? `/player.html?id=${stream.id}`
      : `/static/${stream.id}`)
  }

  // Force thumbnail re-fetch (used after the shared menu refreshes thumb / restarts stream).
  function bumpThumbAndRefresh() {
    setThumbKey((k) => k + 1)
    setThumbError(false)
    onRefresh()
  }

  const playBtn = `w-full flex items-center rounded border border-border bg-muted hover:bg-[#2a2a2a] active:bg-[#333] transition-colors cursor-pointer ${sc.btn}`

  return (
    <>
      {confirmDelete && (
        <ConfirmDeleteModal
          name={stream.name}
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {extOpen && (
        <ExtensionsModal
          streamId={stream.id}
          streamName={stream.name}
          onClose={() => setExtOpen(false)}
        />
      )}
      <div className={cn("relative rounded-lg border border-border bg-card flex flex-col w-full transition-opacity", sc.card, CARD_WIDTHS[cardSize], isDragging && "opacity-40")}>

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
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("font-semibold truncate", sc.name)}>{stream.name}</p>
            <p className={cn("text-muted-foreground font-mono truncate", sc.meta)}>{stream.id}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={status} localStatus={localStatus} cardSize={cardSize} />
            <div className="relative">
              <button ref={menuButtonRef} onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded hover:bg-[#2a2a2a] transition-colors cursor-pointer">
                <MoreHorizontal className={sc.menuIcon} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div ref={menuRef}
                       className="fixed z-50 min-w-[200px] rounded-lg border border-border shadow-2xl overflow-hidden"
                       style={{
                         background: "#1c1c1c",
                         left: menuPos?.left ?? -9999,
                         top: menuPos?.top ?? -9999,
                         visibility: menuPos ? "visible" : "hidden",
                       }}>
                    <StreamMenuContent
                      stream={stream}
                      status={status}
                      localStatus={localStatus}
                      onClose={() => setMenuOpen(false)}
                      onRefresh={bumpThumbAndRefresh}
                      onLocalStatus={onLocalStatus}
                      onStreamUpdate={onStreamUpdate}
                      onOpenExtensions={() => setExtOpen(true)}
                      onDelete={() => setConfirmDelete(true)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <p className={cn("text-muted-foreground truncate", sc.meta)} title={stream.url}>{stream.url}</p>

        <div className="flex flex-col gap-1.5">
          <button onClick={handlePlayStream} className={playBtn}><Play    className={cn("shrink-0", sc.btnIcon)} /> Play Stream</button>
          <button onClick={handleRunHtml}   className={playBtn}><Globe   className={cn("shrink-0", sc.btnIcon)} /> Run HTML</button>
          <button onClick={openVNC}         className={playBtn}><Monitor className={cn("shrink-0", sc.btnIcon)} /> Open VNC</button>
        </div>
      </div>
    </>
  )
}
