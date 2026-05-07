# Changelog

## Unreleased

### Added

- **Per-stream Chromium extensions** — load unpacked extensions (ZIP upload, slug-sanitized into `/app/data/extensions/{streamId}/`) and/or Chrome Web Store IDs via `ExtensionInstallForcelist` managed policies; "Extensions..." button in the card menu opens a modal with two tabs (Web Store IDs, Upload) and an Apply & Restart action that bounces only Chromium + autologin.
- **Per-stream Chromium page zoom** — `zoom` field (one of 17 discrete Chromium steps from 25 % to 500 %) applied as real page zoom (Ctrl+/Ctrl-) by an `applyzoom-{id}` supervisor process that uses `xdotool` to send keyboard shortcuts to the stream's window. No Chromium restart required when changing.
- **Multiple TV Wall presets** — TV Layout grids are now named presets (`rows`, `cols`, `clickAction`, `slots[]`) stored server-side in `tv-presets.json`. Header dropdown lets you switch/create/edit/reorder presets; `/api/tv-wall?preset=<id>` opens the wall for a given preset.
- **TV Wall fill/align per stream** — `tvFill` (object-fit cover) + `tvAlign` (`left`/`center`/`right`) control how each stream renders inside its slot in the wall. Configured from the card's 3-dot menu.
- **Right-click context menu in TV Layout** — every cell with a stream exposes the full card menu (Edit, Restart, Recreate, Start/Stop, Copy RTMP, Refresh thumb, Extensions, Auto-reload, TV fill, Zoom, Delete) on right-click.
- **Available-streams sidebar in TV Layout** — desktop-only sidebar lists streams not yet placed in the active preset; drag from sidebar into any slot, drag back to the trash zone to remove.
- **Viewer tracking per TV preset** — wall viewers are now grouped by `(IP, presetId)` and listed as `TV Wall — <preset name>` in the viewers popup, so simultaneous viewers of different presets are no longer collapsed.

### Changed

- **applyZoom does not restart Chromium** — `applyzoom.sh` always sends `Ctrl+0` first to reset to 100 %, then steps to the target with `Ctrl+KP_Add` / `Ctrl+KP_Subtract`. Switching zoom is now a sub-second operation.
- **TV Layout configuration moved out of `global-prefs`** — `tvRows`, `tvCols`, `tvClickAction` were dropped from `localStorage` and now live in the active preset on the server. Sessions with old localStorage keys are silently ignored.
- **TV Wall HTML respects per-stream `tvFill` / `tvAlign`** when rendering each cell. Other players (`/static/[id]`, `/player/[id]`, `/player/[id].html`) keep `object-fit: contain`.
- **`recreateStream` preserves uploaded extensions** — wipes only the `chrome-profile` directory; `/app/data/extensions/{id}/` survives so unpacked extensions don't need to be re-uploaded.

### Fixed

- Right-click on a TV Layout cell no longer triggers a drag.
- Reopening the zoom menu immediately after changing the value used to show the previous value briefly; an optimistic update + prop-sync `useEffect` now keep the UI consistent.

## Decap Stream v1.1.0

### Added

- **TV Layout** — grid view (`rows × cols`) replacing the cards list, with thumbnails, auto-refresh, click-to-open (HLS / HTML / VNC) and drag-and-drop into fixed slots persisted on the server (`tvPosition`).
- **TV Wall fullscreen** — `/api/tv-wall?rows=R&cols=C` returns an HTML page that plays the HLS of every stream in its slot simultaneously, with per-cell stall detection, global mute and Pure variant (`?pure=1`).
- **Active viewer tracking** — `<Users>` popup in the header shows who is watching each stream (IP, mode, duration). Captures HLS/HTML/Wall via the proxy and VNC via the WebSocket upgrade; TV Wall is deduplicated to 1 viewer per IP.
- **Hardware encoders for ffmpeg** — `FFMPEG_HWACCEL` env var selects `nvenc`, `vaapi` or `qsv` (default keeps `libx264`). Preset/tune are mapped to each codec; Dockerfile ships VAAPI/QSV drivers.
- **Per-stream Chromium auto-reload** — toggle + interval in the card menu, run by a dedicated `autoreload-{id}` supervisor process that reloads the page via Chrome DevTools Protocol without restarting the stream.
- **Player client-side auto-reload** — `autoReload` + `reloadInterval` in global preferences make `/player/[id]` reload itself on a configurable interval.
- **UI defaults via env vars** — `DEFAULT_PURE_MODE`, `DEFAULT_OPEN_NEW_TAB`, `DEFAULT_RELOAD_CLIENT`, `DEFAULT_RELOAD_CLIENT_TIME`, `DEFAULT_TV_LAYOUT`, `DEFAULT_TV_ROWS`, `DEFAULT_TV_COLS`, `DEFAULT_TV_CLICK_ACTION` seed the UI on first visit via `/api/config`.
- **Pure mode and minimal HTML player** — global toggle that switches buttons to direct `.m3u8` and to `/player/[id].html` (no chrome), ideal for VLC and TV browsers.
- **PWA icons** and improved mobile layout — floating Add/Refresh FABs, full-width cards, no horizontal scroll, responsive header.

### Changed

- **Global preferences migrated** to a single `global-prefs` object in `localStorage`, with defaults coming from `/api/config`.
- **VNC access is fully proxied** through Next.js: HTTP via `/api/novnc/[...path]` and WebSocket via an `upgrade` handler in `docker/server.mjs`. Port 6080 no longer needs to be exposed.
- **HLS delivery proxied** via `/api/hls/[...path]`; the static and `.html` players try `:8888` first and fall back to the proxy. Port 8888 no longer needs to be exposed.
- **Status polling consolidated** — a single `supervisorctl status` call cached for 3s feeds `GET /api/streams/statuses`, fixing UI slowness with multiple simultaneous clients.
- **Chromium hardening** — disables Translate, password manager and crash-restore bubbles via flags and managed policies; `Default/Preferences` is rewritten before start to suppress the "Restore pages?" bar.

### Fixed

- VNC SSR hydration bug (`window.location.hostname` rendered as `localhost`) by deferring the iframe to the client.
- Pure mode now produces correct destinations for every button (HLS link, HTML page, VNC).
