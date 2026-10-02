// Calls onChange once the stream's thumb.jpg changes — i.e. a new capture landed —
// by polling its Last-Modified. A stream (re)start captures ~60s in (startStream),
// a manual refresh ~5s in. The first poll runs right away and sets the baseline, so
// start watching before asking for the capture. Returns a cancel function.
export function watchThumb(streamId: string, onChange: () => void, timeoutMs = 180_000): () => void {
  const deadline = Date.now() + timeoutMs
  let baseline: string | null | undefined
  let done = false
  const stop = () => { done = true; clearInterval(timer) }

  async function poll() {
    if (done) return
    if (Date.now() > deadline) { stop(); return }
    try {
      const res = await fetch(`/api/streams/${streamId}/thumb`, { method: "HEAD", cache: "no-store" })
      const lastModified = res.ok ? res.headers.get("last-modified") : null
      if (done) return
      if (baseline === undefined) { baseline = lastModified; return }
      if (lastModified && lastModified !== baseline) { stop(); onChange() }
    } catch {
      // network blip — next tick retries
    }
  }

  const timer = setInterval(poll, 5000)
  void poll()
  return stop
}
