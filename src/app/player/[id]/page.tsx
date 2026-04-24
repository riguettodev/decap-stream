"use client"

import { Suspense } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import Script from "next/script"
import { ArrowLeft } from "lucide-react"

type Mode = "hls" | "m3u8" | "html"

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Hls: any
  }
}

function HLSPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<unknown>(null)
  const [msg, setMsg] = useState("")

  function showMsg(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(""), 4000)
  }

  function load() {
    if (!videoRef.current || !window.Hls) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Hls = window.Hls as any
    if (hlsRef.current) (hlsRef.current as { destroy: () => void }).destroy()
    const hls = new Hls({
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 4,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 10,
      fragLoadingTimeOut: 10000,
      fragLoadingMaxRetry: 10,
    })
    hlsRef.current = hls
    hls.loadSource(src)
    hls.attachMedia(videoRef.current)
    hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play())
    hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal: boolean; type: string }) => {
      if (d.fatal) {
        showMsg(`Erro: ${d.type} — reconectando...`)
        setTimeout(load, 3000)
      }
    })
  }

  useEffect(() => {
    let last = 0
    const interval = setInterval(() => {
      const v = videoRef.current
      if (!v) return
      if (v.currentTime === last && !v.paused) {
        showMsg("Stream travada — recarregando...")
        load()
      }
      last = v.currentTime
    }, 10000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js" onLoad={load} />
      <video ref={videoRef} autoPlay muted playsInline className="w-screen h-screen object-contain bg-black" />
      {msg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/75 text-white px-5 py-2 rounded-lg text-sm z-10">
          {msg}
        </div>
      )}
    </>
  )
}

function M3U8Player({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src
      v.play()
    }
  }, [src])
  return (
    <video ref={videoRef} src={src} autoPlay muted playsInline controls className="w-screen h-screen object-contain bg-black" />
  )
}

// Componente interno que usa useSearchParams — precisa estar dentro de Suspense
function PlayerInner() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const mode = (searchParams.get("mode") ?? "hls") as Mode

  const host = typeof window !== "undefined" ? window.location.hostname : "localhost"
  const hlsSrc = `http://${host}:8888/live/${id}/index.m3u8`

  return (
    <div className="relative bg-black w-screen h-screen overflow-hidden">
      <button
        onClick={() => router.push("/")}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-sm text-white/70 hover:text-white bg-black/50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      {mode === "hls"  && <HLSPlayer src={hlsSrc} />}
      {mode === "m3u8" && <M3U8Player src={hlsSrc} />}
      {mode === "html" && (
        <iframe
          src={`/player-static/${id}`}
          className="w-screen h-screen border-0"
          allowFullScreen
        />
      )}
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