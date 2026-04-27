// Custom entry point: patches http.createServer before Next.js starts,
// so WebSocket upgrade requests to /websockify are proxied to localhost:6080
// (noVNC/websockify) without exposing that port publicly.
import http from "node:http"
import net from "node:net"

const _createServer = http.createServer.bind(http)

function attachWebSocketProxy(server) {
  server.on("upgrade", (req, socket, head) => {
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

http.createServer = function (...args) {
  const server = _createServer(...args)
  attachWebSocketProxy(server)
  return server
}

await import("/app/server.js")
