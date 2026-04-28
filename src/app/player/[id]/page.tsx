"use client"

import { Suspense } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useCallback } from "react"
import { ArrowLeft } from "lucide-react"

type Mode = "hls" | "html"

declare global {
  interface Window { Hls: any }
}

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
    window.addEventListener("touchstart", show)
    return () => {
      window.removeEventListener("mousemove", show)
      window.removeEventListener("touchstart", show)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show])

  return (
    <button
      onClick={onClick}
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s" }}
      className="absolute top-4 left-4 z-20 flex items-center gap-2 sm:gap-1.5 text-[1.1rem] sm:text-sm text-white bg-black/40 px-5 py-3 sm:px-3 sm:py-1.5 rounded-[10px] sm:rounded-lg cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  )
}

// HLS.js loaded inline via script tag injection to avoid SSR issues with next/script
function VideoPlayer({ src, controls }: { src: string; controls?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)
  const [msg, setMsg] = useState("")

  function showMsg(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(""), 4000)
  }

  const load = useCallback((Hls: any) => {
    const v = videoRef.current
    if (!v) return
    if (hlsRef.current) hlsRef.current.destroy()
    const hls = new Hls({
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 20,
      manifestLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 10,
    })
    hlsRef.current = hls
    hls.loadSource(src)
    hls.attachMedia(v)
    hls.on(Hls.Events.MANIFEST_PARSED, () => v.play())
    hls.on(Hls.Events.ERROR, (_: any, d: any) => {
      if (d.fatal) { showMsg(`Error: ${d.type} — reconnecting...`); setTimeout(() => load(Hls), 3000) }
    })
  }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // dynamically inject HLS.js to avoid issues with next/script in client components
    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js"
    script.onload = () => {
      const Hls = window.Hls
      if (Hls.isSupported()) {
        load(Hls)
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        // iOS Safari native HLS
        v.src = src
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}) })
      }
    }
    document.head.appendChild(script)

    // stall detection — only fires after video has actually played once
    let last = 0
    let started = false
    const interval = setInterval(() => {
      if (!v) return
      if (!started && v.currentTime > 0) started = true
      if (started && v.currentTime === last && !v.paused) {
        showMsg("Stream stalled — reloading...")
        if (hlsRef.current) load(window.Hls)
        else { const s = v.src; v.src = ""; v.src = s; v.play().catch(() => {}) }
      }
      last = v.currentTime
    }, 10000)

    return () => {
      clearInterval(interval)
      hlsRef.current?.destroy()
      document.head.removeChild(script)
    }
  }, [load, src])

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline controls={controls} className="w-screen h-screen object-contain bg-black" style={{ height: "100dvh" }} />
      {msg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/75 text-white px-5 py-2 rounded-lg text-sm z-10">{msg}</div>
      )}
    </>
  )
}

function PlayerInner() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const mode = (searchParams.get("mode") ?? "hls") as Mode
  const streamSrc = `/api/hls/live/${id}/index.m3u8`

  useEffect(() => {
    try {
      const gp = JSON.parse(localStorage.getItem("global-prefs") ?? "{}")
      if (gp.autoReload) {
        const ms = Math.max(1, gp.reloadInterval ?? 2) * 60 * 1000
        const t = setTimeout(() => location.reload(), ms)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  return (
    <div className="relative bg-black w-screen h-screen overflow-hidden" style={{ height: "100dvh" }}>
      <BackButton onClick={() => router.push("/")} />
      {mode === "hls"  && <VideoPlayer src={streamSrc} controls />}
      {mode === "html" && <iframe src={`/static/${id}`} className="w-screen border-0" style={{ height: "100dvh" }} allowFullScreen />}
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="bg-black w-screen h-screen" />}>
      <PlayerInner />
    </Suspense>
  )
}