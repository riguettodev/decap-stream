# Changelog

## Decap Stream v1.0.0

Turn any web page into an RTMP/HLS stream. Chromium renders the page in a virtual display, ffmpeg captures it, and MediaMTX publishes it, all managed through a web UI.

### What's included

- **Dashboard with live thumbnails and drag-and-drop ordering**
- **Per-stream configuration** — resolution, scale, FPS, bitrate, x264 preset/tune, GPU flag
- **Scalable card sizes** — mini / sm / md / lg with proportional scaling across all elements
- **Inline VNC** — inspect any stream's virtual display without leaving the UI
- **Autologin with CDP detection** — skips login if the session is still alive on container restart
- **Built-in HLS player** — with controls; static standalone page optimized for TV browsers (`/player/<id>.html`)
- **Pure mode** — global toggle in Settings to open streams as a raw `.m3u8` link or a zero-dependency `.html` page, usable in VLC or any HLS-capable player
- **Open in new tab** — global toggle in Settings to open any action button in a new tab; saved in the browser
- **Optional UI authentication** — set `AUTH_USER` + `AUTH_PASS` to password-protect the entire UI
- **Persistent desired state** — streams restore automatically on container restart

### Quick start

```yaml
services:
  decap-stream:
    image: ghcr.io/riguettodev/decap-stream:latest
    restart: unless-stopped
    shm_size: "2gb"
    security_opt:
      - seccomp:unconfined
    ports:
      - "3000:3000"
      - "127.0.0.1:6080:6080"
    volumes:
      - streams:/app/data/streams

volumes:
  streams:
```

```bash
docker compose up -d
```

See the [README](README.md) for the full configuration reference.
