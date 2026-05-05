"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Video } from "lucide-react"
import type { Stream } from "@/types/stream"

export type TvClickAction = "hls" | "html" | "vnc"

// Build a slots array (length = maxCells) from streams' tvPosition field.
// Streams with a valid tvPosition are placed at that index.
// Streams without (or with out-of-range) tvPosition are auto-filled into the first empty slots.
function buildSlots(streams: Stream[], maxCells: number): (string | null)[] {
  const slots = new Array<string | null>(maxCells).fill(null)
  const placed = new Set<string>()

  for (const stream of streams) {
    const pos = stream.tvPosition
    if (typeof pos === "number" && pos >= 0 && pos < maxCells && slots[pos] === null) {
      slots[pos] = stream.id
      placed.add(stream.id)
    }
  }

  let fillIdx = 0
  for (const stream of streams) {
    if (placed.has(stream.id)) continue
    while (fillIdx < maxCells && slots[fillIdx] !== null) fillIdx++
    if (fillIdx >= maxCells) break
    slots[fillIdx] = stream.id
    fillIdx++
  }

  return slots
}

function TvCell({ slotIndex, stream, clickAction, pureMode, newTab }: {
  slotIndex: number
  stream: Stream | null
  clickAction: TvClickAction
  pureMode: boolean
  newTab: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: slotIndex,
  })
  const style = stream ? { transform: CSS.Transform.toString(transform), transition } : undefined
  const [thumbSrc, setThumbSrc] = useState<string | null>(null)
  const [thumbError, setThumbError] = useState(false)
  const dragOccurredRef = useRef(false)

  useEffect(() => {
    if (isDragging) dragOccurredRef.current = true
  }, [isDragging])

  useEffect(() => {
    if (!stream) { setThumbSrc(null); return }
    let cancelled = false
    function refresh() {
      const url = `/api/streams/${stream!.id}/thumb?t=${Date.now()}`
      const img = new Image()
      img.onload = () => { if (!cancelled) { setThumbSrc(url); setThumbError(false) } }
      img.onerror = () => { if (!cancelled && thumbSrc === null) setThumbError(true) }
      img.src = url
    }
    refresh()
    const interval = setInterval(refresh, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id])

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

async function saveSlots(slots: (string | null)[]): Promise<void> {
  await fetch("/api/streams/tv-slots", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots }),
  })
}

export function TvLayoutGrid({ streams, rows, cols, clickAction, pureMode, newTab, onPositionsSaved }: {
  streams: Stream[]
  rows: number
  cols: number
  clickAction: TvClickAction
  pureMode: boolean
  newTab: boolean
  onPositionsSaved?: () => void
}) {
  const maxCells = rows * cols
  const streamMap = Object.fromEntries(streams.map((s) => [s.id, s]))
  const [slots, setSlots] = useState(() => buildSlots(streams, maxCells))
  const onPositionsSavedRef = useRef(onPositionsSaved)
  onPositionsSavedRef.current = onPositionsSaved

  // On mount: if any stream has no tvPosition, save the auto-filled layout immediately
  useEffect(() => {
    if (streams.length === 0) return
    const hasUnpositioned = streams.some(s => typeof s.tvPosition !== "number")
    if (!hasUnpositioned) return
    const builtSlots = buildSlots(streams, maxCells)
    saveSlots(builtSlots).then(() => onPositionsSavedRef.current?.())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rebuild slots when streams are refreshed from server (positions now persisted)
  useEffect(() => {
    setSlots(buildSlots(streams, maxCells))
  }, [streams, maxCells])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const sourceIdx = Number(active.id)
    const destIdx = Number(over.id)
    if (slots[sourceIdx] === null) return

    const newSlots = [...slots]
    ;[newSlots[sourceIdx], newSlots[destIdx]] = [newSlots[destIdx], newSlots[sourceIdx]]
    setSlots(newSlots)

    await saveSlots(newSlots)
    onPositionsSavedRef.current?.()
  }, [slots])

  const slotIds = Array.from({ length: maxCells }, (_, i) => i)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={slotIds} strategy={rectSortingStrategy}>
        <div
          className="h-full"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {slotIds.map((i) => (
            <TvCell
              key={i}
              slotIndex={i}
              stream={slots[i] ? (streamMap[slots[i]!] ?? null) : null}
              clickAction={clickAction}
              pureMode={pureMode}
              newTab={newTab}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
