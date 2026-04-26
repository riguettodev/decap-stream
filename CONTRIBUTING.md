# Contributing to DecapStream

## Running locally

```bash
npm install
npm run dev
```

In dev mode, all `supervisorctl` and `captureThumb` calls are mocked with console logs — no Supervisord or ffmpeg required.

## Before submitting a PR

- Run `npm run lint` and fix any errors
- Run `npx tsc --noEmit` if you changed types, interfaces, or added imports
- Keep changes focused — one concern per PR

## What's welcome

- Bug fixes
- Documentation improvements
- New stream configuration options
- UI improvements

## What to discuss first

For larger changes (new architecture, new dependencies, significant behavior changes), open an issue first to align on the approach before investing time in implementation.

## Stack

- Next.js 15 + TypeScript + Tailwind CSS v4
- Flat file persistence (`streams.json`) — no database
- Supervisord for process management (mocked in dev)
