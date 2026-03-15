# Language Learning Library

Phase 1 scaffold for a lightweight offline desktop app using Tauri + React + TypeScript + SQLite.

## What is included in Phase 1

- Tauri app shell (Rust backend + desktop window config)
- React + TypeScript frontend scaffold
- Base two-column layout:
  - sidebar placeholder
  - content area placeholder
- SQLite initialization on app startup (local DB file in app data directory)
- README setup and run instructions

No folder scanning, lesson management, or playback logic is included yet.

## Project structure

- `src/` - React frontend
- `src/components/` - UI shell component(s)
- `src-tauri/` - Rust/Tauri backend
- `src-tauri/src/database.rs` - SQLite initialization

## Prerequisites

Install on your machine:

- Node.js 20+
- Rust toolchain (`rustup`)
- OS packages required by Tauri (WebKitGTK, etc. on Linux)

Official guides:

- https://tauri.app/start/prerequisites/

## Install dependencies

```bash
npm install
```

## Run in development

```bash
npm run tauri:dev
```

## Build desktop app

```bash
npm run tauri:build
```

## Notes

- The app is designed to run fully offline.
- SQLite is embedded via `rusqlite` with the `bundled` feature.
- Future phases will add folder import, recursive scan, persistence models, playback, PDF viewing, and navigation.
