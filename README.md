# Language Learning Library

Lightweight offline desktop app built with Tauri + React + TypeScript + SQLite.

## Implemented so far

### Phase 1

- Tauri app scaffold
- React + TypeScript frontend scaffold
- SQLite initialization on startup
- Base app shell with sidebar + content area

### Phase 2

- Import root folder by folder picker or manual path
- Recursive scanning of all subfolders
- Audio lesson detection: `mp3`, `m4a`, `wav`, `aac`, `flac`, `ogg`
- PDF detection with scope:
  - `root_shared` for root-level shared/reference docs
  - `folder_local` for folder-specific reference docs
- Preserved folder hierarchy with folder tree UI

### Phase 3

- SQLite persistence for:
  - imported libraries
  - folder hierarchy
  - lessons
  - PDFs
  - shared root PDF associations
  - lesson played/unplayed state
  - optional lesson playback position
  - last opened lesson per library
- App auto-loads imported libraries at startup (no re-import required)
- Rescan support for imported libraries
- Graceful handling of missing or moved root folders:
  - library remains visible
  - marked unavailable
  - prior scan data still available in UI

### Phase 4

- Lesson browser UI improvements:
  - sidebar list of imported libraries
  - folder tree navigation
  - lesson list per selected folder
  - current lesson selection panel with path context
  - played/unplayed lesson indicators
- Reference panel separates:
  - shared library PDFs (root-level)
  - current folder PDFs (folder-local)
- Root/shared PDFs remain visible while navigating folders/lessons
- Clean empty states for libraries/folders with no PDFs

### Phase 5

- Audio playback in-app for selected lessons
- Playback controls:
  - play/pause
  - seek bar
  - current/duration time display
  - previous/next lesson (within current folder list)
  - optional auto-advance on lesson completion
- Played state behavior:
  - auto-mark as played near the end of playback or on completion
  - manual mark/unmark toggle
- Persistence updates:
  - played/unplayed state saved to SQLite
  - playback position saved periodically and on pause/end

### Phase 6

- PDF viewing support added in-app with an embedded viewer panel
- PDF list supports quick switching between:
  - shared library PDFs (root-level)
  - current folder PDFs (folder-local)
- Currently open PDF remains available while navigating folders and switching lessons
- Added fallback action (`Open Fallback View`) for environments where embedded PDF rendering is limited

## Data models

- `Library`
- `FolderNode`
- `Lesson`
- `PdfDocument`

## Project structure

- `src/` - React frontend
- `src/components/` - UI components
- `src/types/` - frontend TypeScript models
- `src-tauri/` - Rust/Tauri backend
- `src-tauri/src/database.rs` - SQLite setup/schema
- `src-tauri/src/scanner.rs` - recursive filesystem scan logic
- `src-tauri/src/repository.rs` - SQLite persistence/load/rescan/state operations
- `src-tauri/src/models.rs` - backend response models

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

- App is offline-first and local-only.
- SQLite is embedded via `rusqlite` with the `bundled` feature.
- Rust/Cargo is required to run Tauri commands.
