<p align="center">
  <img src="./public/web-app-manifest-192x192.png" width="96" />
</p>
<h1 align="center">Decap Stream</h1>

Turn any web page into an RTMP/HLS stream. Chromium renders the page, ffmpeg captures it, MediaMTX publishes it. Built for NOC environments and digital signage.

## Screenshots

![Dashboard](./screenshots/dashboard.png)

<p align="center">
  <img src="./screenshots/dashboard-config.png" alt="Dashboard Config" width="32.5%" />
  <img src="./screenshots/stream-config.png" alt="Stream Config" width="32.5%" />
  <img src="./screenshots/dashboard-tvlayout.png" alt="Dashboard TV-Layout" width="32.5%" />
</p>

<p align="center">
  <img src="./screenshots/player-tvwall.png" alt="Player TV-Wall" width="98%" />
</p>

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
- **Dashboard with live thumbnails** — captured directly from the Xvfb display, refreshable on demand
- **Scalable card sizes** — mini/sm/md/lg sizes scale all card elements proportionally (buttons, text, icons, padding)
- **Inline VNC** — inspect any stream's virtual display without leaving the UI (`/vnc/{id}`)
- **Autologin with CDP detection** — configure credentials per stream; on restart, queries Chrome DevTools Protocol to skip login if the session is still alive
- **Persistent desired state** — streams remember if they were running or stopped and restore automatically on container restart
- **Optional authentication** — set `AUTH_USER` + `AUTH_PASS` to password-protect the entire UI; rolling 30-day session, no login required while active
- **Fully configurable encoding** — resolution, scale, FPS, bitrate, preset, tune, GOP, threads, all per stream
- **GPU acceleration** — optional per-stream Chromium GPU flag (disabled by default for container compatibility)
- **Built-in HLS player** — watch any stream in the browser via a standalone HTML page optimized for TVs (Back + Mute buttons, reconnect on stall, direct MediaMTX connection when available)
- **Pure mode** — global toggle in Settings to open Play Stream as a raw `.m3u8` link or Run HTML as a minimal `.html` page with no UI; works with native players and TV browsers
- **Open in new tab** — global toggle in Settings to open any button in a new tab instead of navigating in place; saved in the browser
- **Chromium auto-reload** — per-stream toggle to reload the Chromium page on a configurable interval via Chrome DevTools Protocol; configured from the card menu and persisted on the server
- **Per-stream Chromium extensions** — install Chrome Web Store extensions by ID (managed `ExtensionInstallForcelist` policy) or upload unpacked extensions as ZIP from the card menu; applied with a Chromium-only restart
- **Per-stream Chromium page zoom** — pick one of 17 discrete zoom steps (25 % – 500 %) from the card menu; applied as real page zoom (`Ctrl+`/`Ctrl-`) via `xdotool` without restarting Chromium
- **TV Wall presets** — save multiple named TV Wall layouts (`rows × cols`, click action, drag-and-drop slots) and switch between them from the header dropdown; `/api/tv-wall?preset=<id>` opens the corresponding wall fullscreen
- **TV Wall fill / align** — toggle `object-fit: cover` and pick left/center/right alignment per stream; only affects the TV Wall, single-stream players keep `contain`
- **Right-click in TV Layout** — every cell with a stream exposes the full card menu on right-click (Edit, Restart, Recreate, Copy RTMP, Refresh thumb, Extensions, Zoom, ...)
- **Player client-side auto-reload** — global toggle in Settings to reload the HLS player itself on a configurable interval (in minutes)
- **Mobile-friendly UI** — responsive layout for phones (< 640 px): Add and Refresh become floating action buttons in the bottom-right corner, cards fill the screen width automatically, no horizontal scroll; installable as a PWA with separate light/dark home-screen icons

## Platform Support

| Architecture | Status |
| ------------ | ------ |
| `linux/amd64` | ✅ Supported |
| `linux/arm64` | 🔜 Planned |

> arm64 support (Raspberry Pi, Apple Silicon servers) is planned for a future release.

## Quick Start

```yaml
# docker-compose.yml
services:
  decap-stream:
    image: ghcr.io/riguettodev/decap-stream:latest
    container_name: decap-stream
    restart: unless-stopped
    shm_size: "1gb"
    security_opt:
      - seccomp:unconfined
    # gpus: all                 # Uncomment for NVIDIA (nvenc) — requires nvidia-container-toolkit on host
    # devices:
    #   - /dev/dri:/dev/dri     # Uncomment for Intel/AMD (vaapi or qsv)
    environment:
      TZ: America/Sao_Paulo
      # AUTH_USER: admin              # If set (with AUTH_PASS), enables login
      # AUTH_PASS: secure_password
      DEFAULT_PURE_MODE: false      # Pure mode: raw .m3u8 / minimal player (no UI chrome)
      DEFAULT_OPEN_NEW_TAB: false   # Open player buttons in a new tab
      DEFAULT_RELOAD_CLIENT: false  # Auto-reload the client player page
      DEFAULT_RELOAD_CLIENT_TIME: 2 # Client auto-reload interval in minutes
      DEFAULT_TV_LAYOUT: false      # Activate TV Layout by default
      DEFAULT_TV_ROWS: 3            # Default Rows for TV Layout
      DEFAULT_TV_COLS: 4            # Default Columns for TV Layout
      DEFAULT_TV_CLICK_ACTION: hls  # "hls" / "html" / "vnc"
      # FFMPEG_HWACCEL: nvenc         # GPU encoding: nvenc (NVIDIA), vaapi / qsv (Intel/AMD)
      # LD_LIBRARY_PATH: /usr/lib/wsl/lib  # WSL2 + nvenc only
    ports:
      - "3000:3000"             # Web UI — main entry point
      - "127.0.0.1:6080:6080"   # VNC  — localhost only; remote access via tunnel/VPN
      # - "1935:1935"           # RTMP — internal only; expose only for external ingest (e.g. OBS)
      # - "8888:8888"           # HLS  — internal only; proxied through Next.js at /api/hls/
    volumes:
      - streams:/app/data/streams # Persistent: streams.json, chrome profiles, thumbs
      # - /usr/lib/wsl/lib:/usr/lib/wsl/lib:ro  # WSL2 + nvenc: exposes libnvidia-encode.so.1
      # - logs:/app/data/logs       # Optional

volumes:
  streams:
```

```bash
docker compose up -d
```

Open **http://localhost:3000** and add your first stream.

> `seccomp:unconfined` is required because Chromium uses syscalls blocked by Docker's default seccomp profile.

> `shm_size: 2gb` prevents Chromium from crashing on `/dev/shm` exhaustion under load.

## Ports

| Port | Default | Description |
|------|---------|-------------|
| `3000` | exposed | Web UI (Next.js) — sole public entry point |
| `6080` | localhost only | noVNC (token-based routing to all streams) |
| `1935` | commented out | RTMP ingest (MediaMTX) — only needed for external ingest |
| `8888` | commented out | HLS output (MediaMTX) — proxied through Next.js at `/api/hls/` |

## RTMP & HLS URLs

Each stream gets a slug ID you define (e.g. `grafana-prod`):

| Protocol | URL |
|----------|-----|
| RTMP ingest | `rtmp://<host>:1935/live/<id>` |
| HLS manifest (proxied) | `http://<host>:3000/api/hls/live/<id>/index.m3u8` |
| HLS manifest (direct) | `http://<host>:8888/live/<id>/index.m3u8` — requires port 8888 exposed |
| HTML player | `http://<host>:3000/player/<id>.html` — static minimal page, no UI chrome |
| VNC (inline) | `http://<host>:3000/vnc/<id>` |

> **Pure mode** (toggle per card): Play Stream opens the proxied HLS `.m3u8` directly; Run HTML opens the `.html` player. Both can be pasted into VLC or any HLS-capable player, or loaded natively on TV browsers that support HLS.

## Stream Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `id` | | Unique slug (lowercase, numbers, hyphens) |
| `name` | | Display name |
| `url` | | URL to open in Chromium |
| `user` / `pass` | | Credentials for autologin (optional) |
| `delay` | `15s` | Seconds before ffmpeg starts (allows page to load; also offsets first thumbnail) |
| `resolution` | `1920x1080` | Virtual display and capture size |
| `scale` | `1280x720` | Output video resolution |
| `fps` | `30` | Capture framerate |
| `bitrate` | `1500k` | Video bitrate |
| `bufsize` | `3000k` | Encoder buffer size |
| `preset` | `ultrafast` | x264 preset |
| `tune` | `stillimage` | x264 tune (`stillimage` for dashboards, `zerolatency` for dynamic content) |
| `gop` | `60` | Keyframe interval (auto-calculated as 2x FPS in the UI) |
| `threads` | `0` | ffmpeg encoding threads (`0` = auto-detect) |
| `gpu` | `false` | Enable Chromium GPU acceleration (requires host GPU + container access) |
| `autoReload` | `false` | Reload the Chromium page on a fixed interval via CDP; toggled from the card menu |
| `autoReloadInterval` | `3600` | Interval in seconds between automatic page reloads |
| `zoom` | `1.0` | Chromium page zoom factor (snapped to one of 17 discrete steps from `0.25` to `5.0`) |
| `tvFill` | `false` | TV Wall: render this stream with `object-fit: cover` (fill cell, crop overflow) |
| `tvAlign` | `center` | TV Wall: alignment when `tvFill` is off (`left` / `center` / `right`) |
| `extensions.unpacked` | `[]` | Chromium unpacked extensions (slugs of folders uploaded via ZIP) |
| `extensions.forcelist` | `[]` | Chrome Web Store extension IDs installed via managed `ExtensionInstallForcelist` policy |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Container                                                  │
│                                                             │
│  Next.js :3000  ──API──►  Supervisord                       │
│    ├── /api/hls/ ──────►  MediaMTX :8888 (internal)         │
│    └── /vnc/{id} ──────►  noVNC :6080 (localhost)           │
│                              └── per stream:                │
│                                   ├── xvfb       (display)  │
│                                   ├── chromium   (browser)  │
│                                   ├── autologin  (CDP)      │
│                                   ├── applyzoom  (xdotool)  │
│                                   ├── autoreload (CDP)      │
│                                   ├── x11vnc     (VNC)      │
│                                   └── ffmpeg     (encode)   │
│                                         │                   │
│  MediaMTX :1935/:8888  ◄────RTMP────────┘                   │
└─────────────────────────────────────────────────────────────┘
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
- [FFmpeg](https://ffmpeg.org)
- [Chromium](https://www.chromium.org)

## License

[MIT](/LICENSE)
