// Custom entry point: patches http.createServer before Next.js starts, so that
//  - WebSocket upgrade requests to /websockify are proxied to localhost:6080
//    (noVNC/websockify) without exposing that port publicly;
//  - HLS requests (/api/hls/*) are answered by a plain Node proxy to MediaMTX,
//    before they reach Next.js.
import http from "node:http"
import net from "node:net"
import crypto from "node:crypto"

const _createServer = http.createServer.bind(http)

function attachWebSocketProxy(server) {
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost")
    const token = url.searchParams.get("token")
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
      req.headers["x-real-ip"] ??
      req.socket?.remoteAddress ??
      "unknown"
    if (token) {
      globalThis.__vncViewers ??= new Map()
      const key = `${token}:${ip}`
      const now = Date.now()
      globalThis.__vncViewers.set(key, { ip, streamId: token, mode: "vnc", connectedAt: now, lastSeenAt: now })
      socket.on("close", () => { globalThis.__vncViewers?.delete(key) })
    }

    const upstream = net.connect({ host: "127.0.0.1", port: 6080 })

    upstream.once("connect", () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
      for (const [k, v] of Object.entries(req.headers)) {
        raw += `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`
      }
      raw += "\r\n"
      upstream.write(raw)
      if (head?.length) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })

    upstream.on("error", () => { try { socket.destroy() } catch {} })
    socket.on("error", () => { try { upstream.destroy() } catch {} })
    socket.on("close", () => { try { upstream.destroy() } catch {} })
    upstream.on("close", () => { try { socket.destroy() } catch {} })
  })
}

// ── HLS fast path ────────────────────────────────────────────────────────────
// Every TV pulls a playlist + a segment every couple of seconds per stream, and
// through Next.js each of those paid for middleware, the App Router and a
// fetch()→Web Stream→Node stream conversion. This answers them with a raw
// keep-alive pipe instead. Behaviour mirrors src/middleware.ts (auth) and
// src/app/api/hls/[...path]/route.ts (viewer tracking, headers) — keep in sync.
// HLS_FAST_PROXY=false sends them back through the Next.js route.
const HLS_PREFIX = "/api/hls/"
const HLS_FAST_PROXY = (process.env.HLS_FAST_PROXY ?? "true").toLowerCase().trim() !== "false"

// mirror of src/lib/auth.ts: HMAC-SHA256(user, key=pass), hex
const AUTH_ENABLED = !!(process.env.AUTH_USER && process.env.AUTH_PASS)
const COOKIE_NAME = "ds_session"
const SESSION_TOKEN = AUTH_ENABLED
  ? crypto.createHmac("sha256", process.env.AUTH_PASS).update(process.env.AUTH_USER).digest("hex")
  : ""

const hlsAgent = new http.Agent({ keepAlive: true, maxSockets: 256 })

function readCookie(header, name) {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

// mirror of touchHlsViewer (src/lib/viewers.ts) + the mode detection in the route
function trackHlsViewer(req, parts) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
    req.headers["x-real-ip"] ??
    "unknown"
  const referer = req.headers.referer ?? ""
  const mode = referer.includes("/api/tv-wall") ? "wall"
    : referer.includes("/static/") ? "html"
    : "hls"
  const streamId = parts[0] === "live" ? parts[1] : parts[0]
  if (!streamId) return
  let presetId
  if (mode === "wall") {
    try { presetId = new URL(referer).searchParams.get("preset") ?? undefined } catch {}
  }
  globalThis.__hlsViewers ??= new Map()
  const key = `${streamId}:${ip}:${mode}:${presetId ?? ""}`
  const existing = globalThis.__hlsViewers.get(key)
  const now = Date.now()
  globalThis.__hlsViewers.set(key, {
    ip, streamId, mode, presetId,
    connectedAt: existing?.connectedAt ?? now,
    lastSeenAt: now,
  })
}

function handleHls(req, res) {
  const url = new URL(req.url, "http://localhost")

  if (AUTH_ENABLED && readCookie(req.headers.cookie, COOKIE_NAME) !== SESSION_TOKEN) {
    res.writeHead(307, { location: `/login?from=${encodeURIComponent(url.pathname)}` })
    res.end()
    return
  }

  const rel = url.pathname.slice(HLS_PREFIX.length)
  const parts = rel.split("/").filter(Boolean)
  if (parts.at(-1)?.endsWith(".m3u8")) trackHlsViewer(req, parts)

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: 8888,
      path: "/" + parts.join("/"),
      method: req.method,
      agent: hlsAgent,
      headers: { accept: req.headers.accept ?? "*/*" },
    },
    (up) => {
      if (!up.statusCode || up.statusCode < 200 || up.statusCode >= 300) {
        up.resume()
        res.writeHead(up.statusCode ?? 502)
        res.end()
        return
      }
      const headers = {}
      for (const h of ["content-type", "content-length", "accept-ranges"]) {
        if (up.headers[h]) headers[h] = up.headers[h]
      }
      // segments are immutable — cache them; playlists must stay fresh
      const isSegment = /\.(ts|mp4|m4s)$/.test(parts.at(-1) ?? "")
      headers["cache-control"] = isSegment ? "public, max-age=300, immutable" : "no-cache, no-store"
      res.writeHead(200, headers)
      up.pipe(res)
    },
  )
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  // client went away mid-transfer — drop the upstream too (but not after a normal
  // finish, or the keep-alive socket would be destroyed instead of reused)
  res.on("close", () => { if (!res.writableFinished) upstream.destroy() })
  upstream.end()
}

function withHlsFastPath(listener) {
  return function (req, res) {
    if (
      HLS_FAST_PROXY &&
      (req.method === "GET" || req.method === "HEAD") &&
      req.url?.startsWith(HLS_PREFIX)
    ) {
      handleHls(req, res)
      return
    }
    return listener.call(this, req, res)
  }
}

http.createServer = function (...args) {
  const i = args.findIndex((a) => typeof a === "function")
  if (i !== -1) args[i] = withHlsFastPath(args[i])
  const server = _createServer(...args)
  attachWebSocketProxy(server)
  return server
}

await import("/app/server.js")
