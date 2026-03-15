# Language Learning Library

Offline-first desktop app for browsing language-learning audio lessons and PDF references.

## Tech Stack

- Tauri (Rust backend)
- React + TypeScript (frontend)
- SQLite (`rusqlite` with bundled SQLite)

## Core Behavior

- Import a root folder by picker or manual path
- Recursively scan all subfolders
- Supported audio lesson formats: `mp3`, `m4a`, `wav`, `aac`, `flac`, `ogg`
- Detect PDF documents as:
  - `root_shared` (PDFs in imported root)
  - `folder_local` (PDFs in the current folder)
- Preserve folder hierarchy in UI
- Persist imported libraries and lesson/document scan results in SQLite
- Persist played/unplayed lesson state
- Persist optional playback position and last-opened lesson
- Support rescan and graceful handling of missing/moved root folders

## Current App Capabilities (Phases 1-9)

- Multi-library sidebar + folder tree navigation
- Lesson list with played/unplayed indicators
- Current lesson context panel
- Audio playback:
  - play/pause
  - seek
  - time display
  - previous/next lesson
  - optional auto-advance
- In-app PDF viewer with quick switching between shared/folder PDFs
- PDF fallback open action for environments where embedding is limited
- Folder progress indicators (`played/total`) aggregated by subtree
- Scanner resilience for real-world filesystems:
  - skips unreadable nested entries/directories
  - skips symlinks
  - recursion depth guard for deeply nested directories
- Background execution for heavy backend operations (`import`, `load`, `rescan`) to keep UI responsive

## Project Structure

- `src/`
  - `App.tsx` - main UI composition and interaction flow
  - `components/` - reusable UI components
  - `lib/` - frontend utilities and typed Tauri API wrappers
  - `types/` - frontend TypeScript models
  - `styles.css` - app styling
- `src-tauri/`
  - `src/main.rs` - Tauri command handlers
  - `src/database.rs` - SQLite schema initialization and connections
  - `src/repository.rs` - persistence/query layer
  - `src/scanner.rs` - recursive filesystem scanning
  - `src/models.rs` - backend response models

## Prerequisites

Install:

- Node.js 20+
- Rust toolchain (`rustup`)
- OS dependencies required by Tauri

Reference:

- https://tauri.app/start/prerequisites/

## Setup

```bash
npm install
```

## Development

```bash
npm run tauri:dev
```

## Production Build

```bash
npm run tauri:build
```

## Frontend Build Check

```bash
npm run build
```

## Notes

- App is local-only; no server required.
- Data is stored locally in SQLite under Tauri app data directory.
- Theme support is intentionally deferred to Phase 10.
