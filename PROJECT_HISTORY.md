# Language Learning Library - Project History

This file records what has been implemented so far, including stack details, structure, and feature progress.

## Stack Details

- Desktop framework: Tauri 2
- Frontend: React 18 + TypeScript + Vite
- Backend: Rust (edition 2021)
- Database: SQLite (`rusqlite` with bundled SQLite)
- Tauri plugin: dialog (`@tauri-apps/plugin-dialog` / `tauri-plugin-dialog`)

## High-Level Folder Structure

```text
Language-Learning-Library/
  src/
    App.tsx
    main.tsx
    styles.css
    components/
      AppShell.tsx
      FolderTree.tsx
    lib/
      library-utils.ts
      tauri-api.ts
    types/
      library.ts
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/
      default.json
    src/
      main.rs
      database.rs
      repository.rs
      scanner.rs
      models.rs
```

## Phase-by-Phase Implementation

### Phase 1 - Project Setup

- Initialized Tauri + React + TypeScript project.
- Added base app shell with sidebar/content placeholders.
- Added initial README instructions.

### Phase 2 - Folder Import + Recursive Scanning

- Added folder picker and manual path import.
- Implemented recursive scanner for root folder and subfolders.
- Added detection for supported audio formats and PDFs.
- Preserved real folder hierarchy in data model/UI.
- Defined models:
  - `Library`
  - `FolderNode`
  - `Lesson`
  - `PdfDocument`
- PDF scope model introduced:
  - `root_shared` for root-level PDFs
  - `folder_local` for same-folder PDFs
- Stable IDs and full-path handling used to avoid duplicate filename collisions.

### Phase 3 - SQLite Persistence

- Added SQLite schema and persistence layer.
- Persisted:
  - imported libraries
  - folder tree
  - lessons
  - PDFs and scope associations
  - played state
  - last opened lesson
  - playback position (optional)
- Implemented auto-load of previously imported libraries on startup.
- Added rescan behavior.
- Added graceful handling for missing/moved library roots.

### Phase 4 - Lesson Browser UI

- Sidebar library selector.
- Folder tree navigation.
- Lesson list by selected folder.
- Played/unplayed indicators.
- Current lesson context and path display.
- Reference document panel:
  - shared root PDFs section
  - current folder PDFs section
- UI remains clean when no PDFs are available.

### Phase 5 - Audio Playback

- In-app audio playback with:
  - play/pause
  - seek bar
  - elapsed/total time
  - previous/next lesson navigation
  - optional auto-advance
- Mark lesson played near end/on completion.
- Manual mark played/unplayed toggle.
- Persisted played state and playback position.

### Phase 6 - PDF Viewing

- Embedded PDF viewing inside app (`iframe`-based).
- Fallback open action for environments where embed support is limited.
- Root/shared PDFs remain accessible while moving through folders/lessons.
- Quick switching among multiple PDFs.

### Phase 7 - Navigation Polish

- Improved previous/next flow in ordered lesson lists.
- Auto-restore last opened lesson where appropriate.
- Added folder progress indicators (`played/total`, aggregated).
- Kept active PDF context available during lesson navigation.

### Phase 8 - Error Handling + Performance

- Hardened scanner for real-world libraries:
  - deeply nested folders (depth guard)
  - unreadable files/folders (skip gracefully)
  - symlink skipping
  - unsupported files ignored cleanly
- Reduced UI blocking by offloading heavier backend tasks.
- Improved rescan behavior and missing-root handling.

### Phase 9 - Cleanup + Documentation

- Refactored code organization and type usage.
- Improved maintainability across scanner, repository, and UI flow.
- Updated baseline project docs and run instructions.

## Post-Phase Improvements Completed

- Audio reliability improvements:
  - robust playback fallback path (`asset` -> `file` -> in-memory data URL)
  - improved error messaging
- PDF pane usability:
  - draggable divider between lesson and PDF panes
- Audio control usability:
  - icon-based controls for play/pause/stop/rewind/fast-forward
- App exit usability:
  - added `Quit App` button in UI
  - updated Tauri capability permissions to allow window close

## Feature Summary (Current)

- Offline-first local desktop app (no server).
- Multi-library management and persistence.
- Recursive library scan with folder hierarchy preservation.
- Lesson-centric audio workflow.
- Shared root-level and folder-local PDF references.
- In-app PDF reading while navigating lessons.
- Playback state + lesson state persistence across launches.
- Rescan and missing file/root resilience.
- Lightweight UI with split-pane reading/listening workflow.
