import { invoke } from "@tauri-apps/api/core";
import type { Library } from "../types/library";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
  }
}

function getInvokeBridge(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  const internalsInvoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof internalsInvoke === "function") {
    return internalsInvoke;
  }

  const globalInvoke = window.__TAURI__?.core?.invoke;
  if (typeof globalInvoke === "function") {
    return globalInvoke;
  }

  return null;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridgeInvoke = getInvokeBridge();
  if (bridgeInvoke) {
    return bridgeInvoke<T>(command, args);
  }

  if (typeof invoke === "function") {
    return invoke<T>(command, args);
  }

  throw new Error("Tauri runtime is unavailable. Launch the app with `npm run tauri:dev`.");
}

export async function loadImportedLibraries(): Promise<Library[]> {
  try {
    return await invokeCommand<Library[]>("load_imported_libraries");
  } catch (error) {
    if (String(error).includes("Tauri runtime is unavailable")) {
      return [];
    }

    throw error;
  }
}

export async function importLibrary(rootPath: string): Promise<Library> {
  return invokeCommand<Library>("import_library", { rootPath });
}

export async function rescanLibrary(libraryId: string): Promise<Library> {
  return invokeCommand<Library>("rescan_library", { libraryId });
}

export async function setLastOpenedLesson(libraryId: string, lessonId: string | null): Promise<void> {
  return invokeCommand("set_last_opened_lesson", { libraryId, lessonId });
}

export async function setLessonPlayed(lessonId: string, played: boolean): Promise<void> {
  return invokeCommand("set_lesson_played", { lessonId, played });
}

export async function setLessonPlaybackPosition(
  lessonId: string,
  playbackPositionSeconds: number | null
): Promise<void> {
  return invokeCommand("set_lesson_playback_position", {
    lessonId,
    playbackPositionSeconds
  });
}

export async function loadAudioDataUrl(filePath: string): Promise<string> {
  return invokeCommand<string>("load_audio_data_url", { filePath });
}
