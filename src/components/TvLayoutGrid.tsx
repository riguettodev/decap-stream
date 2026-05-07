"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { SortableContext, useSortable } from "@dnd-kit/sortable"

// No-op sorting strategy: we do explicit swap on drop, so we don't want
// neighbor slots to translate ("make room") during a drag.
const noopStrategy = () => null
import { CSS } from "@dnd-kit/utilities"
import { Video, Trash2 } from "lucide-react"
import { StreamContextMenu } from "@/components/StreamMenu"
import type { Stream } from "@/types/stream"
import type { TvPreset, TvClickAction } from "@/types/tvPreset"

export type { TvClickAction } from "@/types/tvPreset"

// Drag id conventions:
//   slot:<index>     — sortable slot in the grid (numeric-only ids confused dnd-kit when mixed with strings, so we prefix)
//   sb:<streamId>    — draggable item in the sidebar
//   trash            — droppable trash zone in the sidebar header

function useStreamThumb(streamId: string | null | undefined) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null)
  const [thumbError, setThumbError] = useState(false)
  useEffect(() => {
    if (!streamId) { setThumbSrc(null); setThumbError(false); return }
    let cancelled = false
    function refresh() {
      const url = `/api/streams/${streamId}/thumb?t=${Date.now()}`
      const img = new Image()
      img.onload = () => { if (!cancelled) { setThumbSrc(url); setThumbError(false) } }
      img.onerror = () => { if (!cancelled) setThumbError((prev) => prev || true) }
      img.src = url
    }
    refresh()
    const interval = setInterval(refresh, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [streamId])
  return { thumbSrc, thumbError }
}

function TvCell({ slotIndex, stream, clickAction, pureMode, newTab, onContextMenu }: {
  slotIndex: number
  stream: Stream | null
  clickAction: TvClickAction
  pureMode: boolean
  newTab: boolean
  onContextMenu?: (e: React.MouseEvent, stream: Stream) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `slot:${slotIndex}`,
  })
  const style = stream ? { transform: CSS.Transform.toString(transform), transition } : undefined
  const { thumbSrc, thumbError } = useStreamThumb(stream?.id)
  const dragOccurredRef = useRef(false)

  useEffect(() => {
    if (isDragging) dragOccurredRef.current = true
  }, [isDragging])

  function navigate(url: string) {
    if (newTab) window.open(url, "_blank")
    else window.location.href = url
  }

  function handleClick() {
    if (!stream) return
    if (dragOccurredRef.current) { dragOccurredRef.current = false; return }
    if (clickAction === "hls") {
      navigate(pureMode ? `/api/hls/live/${stream.id}/index.m3u8` : `/player/${stream.id}?mode=hls`)
    } else if (clickAction === "html") {
      navigate(pureMode ? `/player.html?id=${stream.id}` : `/static/${stream.id}`)
    } else {
      navigate(`/vnc/${stream.id}`)
    }
  }

  if (!stream) {
    return (
      <div
        ref={setNodeRef}
        className={`relative border transition-all duration-150 ${
          isOver
            ? "bg-white/[0.04] border-white/20 border-dashed"
            : "bg-[#080808] border-[#161616]"
        }`}
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onContextMenu={(e) => { if (stream && onContextMenu) { e.preventDefault(); onContextMenu(e, stream) } }}
      className={`relative overflow-hidden bg-[#0a0a0a] border border-[#1a1a1a] cursor-pointer group select-none${isDragging ? " opacity-40 z-50" : ""}${isOver ? " ring-1 ring-white/20" : ""}`}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : thumbError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Video className="w-8 h-8 text-white/20" />
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pointer-events-none">
        <p className="text-white text-sm font-semibold truncate px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.65)" }}>
          {stream.name}
        </p>
      </div>
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors pointer-events-none" />
    </div>
  )
}

function SidebarItemPreview({ stream }: { stream: Stream }) {
  const { thumbSrc, thumbError } = useStreamThumb(stream.id)
  return (
    <div
      className="relative w-[220px] aspect-video bg-[#0a0a0a] border border-white/30 rounded overflow-hidden select-none shadow-2xl"
      title={stream.name}
    >
      {thumbSrc ? (
        <img src={thumbSrc} className="w-full h-full object-cover" draggable={false} />
      ) : thumbError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Video className="w-6 h-6 text-white/20" />
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pointer-events-none">
        <p className="text-white text-xs truncate px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.65)" }}>
          {stream.name}
        </p>
      </div>
    </div>
  )
}

function SidebarItem({ stream }: { stream: Stream }) {
  // Don't apply transform from useDraggable — the DragOverlay (rendered in a portal at body)
  // shows the floating preview, so the original stays in place. Hiding via opacity-0 keeps
  // the slot reserved in the sidebar layout.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sb:${stream.id}`,
  })
  const { thumbSrc, thumbError } = useStreamThumb(stream.id)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative w-full aspect-video bg-[#0a0a0a] border border-[#1a1a1a] rounded overflow-hidden cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-0" : ""}`}
      title={stream.name}
    >
      {thumbSrc ? (
        <img src={thumbSrc} className="w-full h-full object-cover" draggable={false} />
      ) : thumbError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Video className="w-6 h-6 text-white/20" />
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pointer-events-none">
        <p className="text-white text-xs truncate px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.65)" }}>
          {stream.name}
        </p>
      </div>
    </div>
  )
}

function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "trash" })
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-2 text-xs py-2 px-2 rounded border border-dashed transition-colors ${
        isOver ? "border-red-400 text-red-300 bg-red-500/10" : "border-[#2a2a2a] text-muted-foreground"
      }`}
    >
      <Trash2 className="w-3.5 h-3.5" />
      <span>Drop to remove</span>
    </div>
  )
}

async function saveSlots(presetId: string, slots: (string | null)[]): Promise<void> {
  await fetch(`/api/tv-presets/${presetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots }),
  })
}

export function TvLayoutGrid({ streams, preset, pureMode, newTab, onSlotsSaved, statuses, localStatuses, onRefresh, onLocalStatus, onStreamUpdate }: {
  streams: Stream[]
  preset: TvPreset
  pureMode: boolean
  newTab: boolean
  onSlotsSaved?: () => void
  statuses?: Record<string, Record<string, string>>
  localStatuses?: Record<string, string | null>
  onRefresh?: () => void
  onLocalStatus?: (id: string, s: string | null) => void
  onStreamUpdate?: (id: string, patch: Partial<Stream>) => void
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; stream: Stream } | null>(null)
  const { rows, cols, clickAction } = preset
  const maxCells = rows * cols
  const streamMap = Object.fromEntries(streams.map((s) => [s.id, s]))
  const [slots, setSlots] = useState<(string | null)[]>(() => normalize(preset.slots, maxCells))
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const onSlotsSavedRef = useRef(onSlotsSaved)
  onSlotsSavedRef.current = onSlotsSaved

  useEffect(() => {
    setSlots(normalize(preset.slots, maxCells))
  }, [preset.id, preset.slots, maxCells])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const persist = useCallback(async (newSlots: (string | null)[]) => {
    setSlots(newSlots)
    await saveSlots(preset.id, newSlots)
    onSlotsSavedRef.current?.()
  }, [preset.id])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    // Sidebar item dropped
    if (activeId.startsWith("sb:")) {
      const streamId = activeId.slice(3)
      if (overId.startsWith("slot:")) {
        const destIdx = Number(overId.slice(5))
        // Replace whatever was in the slot (it returns to sidebar implicitly).
        // If the same stream is somehow already placed elsewhere, clear that slot to avoid duplicates.
        const newSlots = slots.map((v) => (v === streamId ? null : v))
        newSlots[destIdx] = streamId
        await persist(newSlots)
      }
      return
    }

    // Slot drag
    if (activeId.startsWith("slot:")) {
      const sourceIdx = Number(activeId.slice(5))
      if (slots[sourceIdx] === null) return

      // Drop on trash zone → remove
      if (overId === "trash") {
        const newSlots = [...slots]
        newSlots[sourceIdx] = null
        await persist(newSlots)
        return
      }

      // Slot ↔ slot swap (existing behavior)
      if (overId.startsWith("slot:")) {
        const destIdx = Number(overId.slice(5))
        const newSlots = [...slots]
        ;[newSlots[sourceIdx], newSlots[destIdx]] = [newSlots[destIdx], newSlots[sourceIdx]]
        await persist(newSlots)
        return
      }
    }
  }, [slots, persist])

  const slotIds = Array.from({ length: maxCells }, (_, i) => `slot:${i}`)

  // Streams not currently placed in any slot, ordered by stream.order (streams prop is already sorted).
  const placedSet = new Set(slots.filter((v): v is string => v !== null))
  const availableStreams = streams.filter((s) => !placedSet.has(s.id))

  // DragOverlay only for sidebar items — the floating preview escapes the sidebar's
  // overflow-y-auto (which was clipping the dragged item). Slot drags use the existing
  // useSortable transform which is fine since the grid has no overflow ancestor.
  const dragPreviewStream: Stream | null = activeDragId?.startsWith("sb:")
    ? (streamMap[activeDragId.slice(3)] ?? null)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="h-full flex overflow-hidden">
        {/* Grid (left) */}
        <div className="flex-1 min-w-0 h-full">
          <SortableContext items={slotIds} strategy={noopStrategy}>
            <div
              className="h-full"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {slotIds.map((id, i) => (
                <TvCell
                  key={id}
                  slotIndex={i}
                  stream={slots[i] ? (streamMap[slots[i]!] ?? null) : null}
                  clickAction={clickAction}
                  pureMode={pureMode}
                  newTab={newTab}
                  onContextMenu={(e, s) => setCtxMenu({ x: e.clientX, y: e.clientY, stream: s })}
                />
              ))}
            </div>
          </SortableContext>
        </div>

        {/* Sidebar (right) — hidden on mobile */}
        <aside className="hidden sm:flex flex-col gap-2 w-[220px] shrink-0 border-l border-[#161616] bg-[#080808] p-3 overflow-y-auto">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Available streams</p>
            <p className="text-[10px] text-muted-foreground/70">Drag into a cell</p>
          </div>
          <TrashZone />
          {availableStreams.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 px-1 py-4 text-center">All streams in preset</p>
          ) : (
            <div className="flex flex-col gap-2">
              {availableStreams.map((s) => (
                <SidebarItem key={s.id} stream={s} />
              ))}
            </div>
          )}
        </aside>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragPreviewStream ? <SidebarItemPreview stream={dragPreviewStream} /> : null}
      </DragOverlay>
      {ctxMenu && (
        <StreamContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          stream={ctxMenu.stream}
          status={statuses?.[ctxMenu.stream.id]}
          localStatus={localStatuses?.[ctxMenu.stream.id] ?? null}
          onClose={() => setCtxMenu(null)}
          onRefresh={() => { onRefresh?.() }}
          onLocalStatus={(id, s) => onLocalStatus?.(id, s)}
          onStreamUpdate={(id, patch) => onStreamUpdate?.(id, patch)}
        />
      )}
    </DndContext>
  )
}

function normalize(slots: (string | null)[], size: number): (string | null)[] {
  const out = new Array<string | null>(size).fill(null)
  for (let i = 0; i < Math.min(slots.length, size); i++) out[i] = slots[i] ?? null
  return out
}
