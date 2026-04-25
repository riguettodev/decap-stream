# DecapStream

Turn any web page into an RTMP/HLS stream. Chromium renders the page, ffmpeg captures it, MediaMTX publishes it. Built for NOC environments and digital signage.

## How it works

Each stream runs its own isolated stack inside the container:

```
Xvfb (virtual display)
  └── Chromium (opens the URL)
        └── ffmpeg (x11grab → libx264 → RTMP → MediaMTX → HLS)
        └── x11vnc (live VNC access via noVNC)
```

All processes are managed by Supervisord. The web UI is a Next.js app that controls everything via a REST API.

## Features

- **Stream any URL** — if it loads in a browser, it streams
- **Dashboard with live thumbnails** — captured from the HLS output, refreshable on demand
- **VNC access** — inspect any stream's virtual display from the browser via unified noVNC (single port, token routing)
- **Autologin with CDP detection** — configure credentials per stream; on restart, queries Chrome DevTools Protocol to skip login if the session is still alive
- **Persistent desired state** — streams remember if they were running or stopped and restore automatically on container restart
- **Fully configurable encoding** — resolution, scale, FPS, bitrate, preset, tune, GOP, threads, all per stream
- **Built-in HLS player** — watch any stream in the browser; also serves a standalone embeddable HTML page per stream

## Quick Start

```yaml
# docker-compose.yml
services:
  decap-stream:
    image: ghcr.io/riguettodev/decap-stream:latest
    container_name: decap-stream
    restart: unless-stopped
    shm_size: "2gb"
    security_opt:
      - seccomp:unconfined   # required for Chromium syscalls
    environment:
      TZ: America/Sao_Paulo
    ports:
      - "3000:3000"   # Web UI
      - "1935:1935"   # RTMP input
      - "8888:8888"   # HLS output
      - "6080:6080"   # noVNC
    volumes:
      - decap-stream:/app/data

volumes:
  decap-stream:
```

```bash
docker compose up -d
```

Open **http://localhost:3000** and add your first stream.

> `seccomp:unconfined` is required because Chromium uses syscalls blocked by Docker's default seccomp profile.

> `shm_size: 2gb` prevents Chromium from crashing on `/dev/shm` exhaustion under load.

## Ports

| Port | Service |
|------|---------|
| `3000` | Web UI (Next.js) |
| `1935` | RTMP ingest (MediaMTX) |
| `8888` | HLS output (MediaMTX) |
| `6080` | noVNC unified (token-based routing to all streams) |

## RTMP & HLS URLs

Each stream gets a slug ID you define (e.g. `grafana-prod`):

| Protocol | URL |
|----------|-----|
| RTMP ingest | `rtmp://<host>:1935/live/<id>` |
| HLS manifest | `http://<host>:8888/live/<id>/index.m3u8` |
| VNC | `http://<host>:6080/vnc.html?autoconnect=true&path=websockify%3Ftoken%3D<id>` |

## Stream Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `id` | | Unique slug (lowercase, numbers, hyphens) |
| `name` | | Display name |
| `url` | | URL to open in Chromium |
| `user` / `pass` | | Credentials for autologin (optional) |
| `delay` | `15s` | Seconds before ffmpeg starts (allows page to load) |
| `resolution` | `1920x1080` | Virtual display and capture size |
| `scale` | `1280x720` | Output video resolution |
| `fps` | `30` | Capture framerate |
| `bitrate` | `1500k` | Video bitrate |
| `bufsize` | `3000k` | Encoder buffer size |
| `preset` | `ultrafast` | x264 preset |
| `tune` | `stillimage` | x264 tune (`stillimage` for dashboards, `zerolatency` for dynamic content) |
| `gop` | `60` | Keyframe interval (auto-calculated as 2× FPS in the UI) |
| `threads` | `0` | ffmpeg encoding threads (`0` = auto-detect) |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Container                                                   │
│                                                              │
│  Next.js :3000  ──API──►  Supervisord                        │
│                              ├── novnc :6080  (global)       │
│                              └── per stream:                 │
│                                   ├── xvfb       (display)   │
│                                   ├── chromium   (browser)   │
│                                   ├── autologin  (CDP)       │
│                                   ├── x11vnc     (VNC)       │
│                                   └── ffmpeg     (encode)    │
│                                         │                    │
│  MediaMTX :1935/:8888  ◄────RTMP────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

- `streams.json` flat file + one directory per stream under `/app/data/streams/{id}/`
- Each stream generates a `stream.conf` from a template; Supervisord picks it up via `[include]`
- Display number `:n` is auto-allocated; VNC port = `5900+n`, debug port = `9221+n`

## Development

```bash
npm install
npm run dev     # dev server — supervisorctl calls are mocked automatically
npm run build   # build Next.js standalone
npm run lint

./build.sh      # interactive Docker build
```

In dev mode (`NODE_ENV !== "production"`), all `supervisorctl` and `captureThumb` calls are replaced with console logs.

## Stack

- [Next.js 15](https://nextjs.org/) + TypeScript + Tailwind CSS v4
- [Supervisord](http://supervisord.org/)
- [MediaMTX](https://github.com/bluenviron/mediamtx)
- [HLS.js](https://github.com/video-dev/hls.js/)
- [noVNC](https://novnc.com/)
- Chromium, ffmpeg

## License

MIT
