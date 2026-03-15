# Language Learning Library

Lightweight offline desktop app built with Tauri + React + TypeScript + SQLite.

## Implemented so far

### Phase 1

- Tauri app scaffold
- React + TypeScript frontend scaffold
- SQLite initialization on startup
- Base app shell with sidebar + content area

### Phase 2

- Import root folder by:
  - folder picker
  - manual path input
- Recursive scanning of selected root folder and all subfolders
- Supported audio lesson detection:
  - `mp3`, `m4a`, `wav`, `aac`, `flac`, `ogg`
- PDF detection and categorization:
  - root-level PDFs as shared/reference documents for the whole library
  - folder-level PDFs as local references for that folder
- Preserved folder hierarchy in UI
- Safe identity model using full-path-based IDs (handles duplicate filenames in different folders)

## Data models (Phase 2)

- `Library`
- `FolderNode`
- `Lesson`
- `PdfDocument` with `scope`:
  - `root_shared`
  - `folder_local`

## Project structure

- `src/` - React frontend
- `src/components/` - UI components
- `src/types/` - frontend TypeScript models
- `src-tauri/` - Rust/Tauri backend
- `src-tauri/src/database.rs` - SQLite initialization
- `src-tauri/src/models.rs` - shared scan models
- `src-tauri/src/scanner.rs` - recursive filesystem scan logic

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
- Next phases add persistence of imported libraries and lesson/PDF state.
