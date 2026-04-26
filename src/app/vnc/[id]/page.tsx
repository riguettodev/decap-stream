"use client"

import { Suspense } from "react"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useCallback } from "react"
import { ArrowLeft } from "lucide-react"

function BackButton({ onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 5000)
  }, [])

  useEffect(() => {
    show()
    window.addEventListener("mousemove", show)
    return () => {
      window.removeEventListener("mousemove", show)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show])

  return (
    <button
      onClick={onClick}
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s" }}
      className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-sm text-white bg-black/40 px-3 py-1.5 rounded-lg cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  )
}

function VncInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost"
  const token = encodeURIComponent(`token=${id}`)
  const vncUrl = `http://${host}:6080/vnc.html?autoconnect=true&path=websockify%3F${token}`

  return (
    <div className="relative bg-black w-screen h-screen overflow-hidden">
      <BackButton onClick={() => router.push("/")} />
      <iframe src={vncUrl} className="w-screen h-screen border-0" allowFullScreen />
    </div>
  )
}

export default function VncPage() {
  return (
    <Suspense fallback={<div className="bg-black w-screen h-screen" />}>
      <VncInner />
    </Suspense>
  )
}
