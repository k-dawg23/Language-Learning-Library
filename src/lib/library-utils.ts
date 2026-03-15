import type { FolderNode, Library, Lesson } from "../types/library";

export type FolderProgress = {
  played: number;
  total: number;
};

export function findFolderNode(node: FolderNode, folderPath: string): FolderNode | null {
  if (node.fullPath === folderPath) {
    return node;
  }

  for (const child of node.children) {
    const match = findFolderNode(child, folderPath);
    if (match) {
      return match;
    }
  }

  return null;
}

export function upsertLibrary(libraries: Library[], next: Library): Library[] {
  const existingIndex = libraries.findIndex((library) => library.id === next.id);
  if (existingIndex === -1) {
    return [...libraries, next].sort((a, b) => a.name.localeCompare(b.name));
  }

  const updated = [...libraries];
  updated[existingIndex] = next;
  return updated;
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00";
  }

  const rounded = Math.floor(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildFolderProgressMap(
  node: FolderNode,
  lessonById: Map<string, Lesson>
): Map<string, FolderProgress> {
  const map = new Map<string, FolderProgress>();
  computeFolderProgress(node, lessonById, map);
  return map;
}

function computeFolderProgress(
  node: FolderNode,
  lessonById: Map<string, Lesson>,
  target: Map<string, FolderProgress>
): FolderProgress {
  const ownLessons = node.lessonIds
    .map((id) => lessonById.get(id))
    .filter((lesson): lesson is Lesson => Boolean(lesson));

  let played = ownLessons.filter((lesson) => lesson.played).length;
  let total = ownLessons.length;

  for (const child of node.children) {
    const childProgress = computeFolderProgress(child, lessonById, target);
    played += childProgress.played;
    total += childProgress.total;
  }

  const progress = { played, total };
  target.set(node.fullPath, progress);
  return progress;
}
