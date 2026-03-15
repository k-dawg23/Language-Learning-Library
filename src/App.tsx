import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AppShell } from "./components/AppShell";
import { FolderTree } from "./components/FolderTree";
import type { FolderNode, Library, Lesson, PdfDocument } from "./types/library";

type StatusTone = "neutral" | "error";

type StatusMessage = {
  tone: StatusTone;
  message: string;
};

export function App() {
  const [pathInput, setPathInput] = useState("");
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    tone: "neutral",
    message: "Loading imported libraries..."
  });

  const selectedLibrary = useMemo(() => {
    if (!selectedLibraryId) {
      return null;
    }

    return libraries.find((library) => library.id === selectedLibraryId) ?? null;
  }, [libraries, selectedLibraryId]);

  const selectedFolder = useMemo(() => {
    if (!selectedLibrary || !selectedFolderPath) {
      return null;
    }

    return findFolderNode(selectedLibrary.folderTree, selectedFolderPath);
  }, [selectedLibrary, selectedFolderPath]);

  const lessonById = useMemo(() => {
    if (!selectedLibrary) {
      return new Map<string, Lesson>();
    }

    return new Map(selectedLibrary.lessons.map((lesson) => [lesson.id, lesson]));
  }, [selectedLibrary]);

  const pdfById = useMemo(() => {
    if (!selectedLibrary) {
      return new Map<string, PdfDocument>();
    }

    return new Map(selectedLibrary.pdfDocuments.map((pdf) => [pdf.id, pdf]));
  }, [selectedLibrary]);

  const sharedPdfs = useMemo(() => {
    if (!selectedLibrary) {
      return [];
    }

    return selectedLibrary.sharedPdfIds
      .map((id) => pdfById.get(id))
      .filter((pdf): pdf is PdfDocument => Boolean(pdf));
  }, [selectedLibrary, pdfById]);

  const folderLessons = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }

    return selectedFolder.lessonIds
      .map((id) => lessonById.get(id))
      .filter((lesson): lesson is Lesson => Boolean(lesson));
  }, [selectedFolder, lessonById]);

  const folderPdfs = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }

    return selectedFolder.pdfIds
      .map((id) => pdfById.get(id))
      .filter((pdf): pdf is PdfDocument => Boolean(pdf))
      .filter((pdf) => pdf.scope === "folder_local");
  }, [selectedFolder, pdfById]);

  const selectedLesson = useMemo(() => {
    if (!selectedLessonId) {
      return null;
    }

    return lessonById.get(selectedLessonId) ?? null;
  }, [selectedLessonId, lessonById]);

  useEffect(() => {
    void loadLibrariesOnStartup();
  }, []);

  useEffect(() => {
    if (!selectedLibrary) {
      setSelectedFolderPath("");
      setSelectedLessonId(null);
      return;
    }

    const folderStillExists = selectedFolderPath
      ? Boolean(findFolderNode(selectedLibrary.folderTree, selectedFolderPath))
      : false;

    if (!folderStillExists) {
      setSelectedFolderPath(selectedLibrary.folderTree.fullPath);
    }
  }, [selectedLibrary, selectedFolderPath]);

  useEffect(() => {
    if (folderLessons.length === 0) {
      setSelectedLessonId(null);
      return;
    }

    const selectedStillInFolder = selectedLessonId
      ? folderLessons.some((lesson) => lesson.id === selectedLessonId)
      : false;

    if (!selectedStillInFolder) {
      setSelectedLessonId(folderLessons[0].id);
    }
  }, [folderLessons, selectedLessonId]);

  async function loadLibrariesOnStartup() {
    try {
      const loaded = await invoke<Library[]>("load_imported_libraries");
      setLibraries(loaded);

      if (loaded.length > 0) {
        const first = loaded[0];
        setSelectedLibraryId(first.id);
        setSelectedFolderPath(first.folderTree.fullPath);
        setSelectedLessonId(first.lastOpenedLessonId);
        setPathInput(first.rootPath);
        setStatus({
          tone: "neutral",
          message: `Loaded ${loaded.length} imported librar${loaded.length === 1 ? "y" : "ies"}.`
        });
      } else {
        setStatus({
          tone: "neutral",
          message: "No imported libraries yet. Import a root folder to begin."
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Failed to load libraries: ${String(error)}`
      });
    }
  }

  async function pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select language library root folder"
    });

    if (typeof selected === "string") {
      setPathInput(selected);
      await importLibrary(selected);
    }
  }

  async function importLibrary(rawPath?: string) {
    const rootPath = (rawPath ?? pathInput).trim();

    if (!rootPath) {
      setStatus({
        tone: "error",
        message: "Enter a folder path or use the folder picker."
      });
      return;
    }

    setIsWorking(true);
    setStatus({
      tone: "neutral",
      message: `Importing and scanning ${rootPath} ...`
    });

    try {
      const imported = await invoke<Library>("import_library", { rootPath });
      setLibraries((previous) => upsertLibrary(previous, imported));
      setSelectedLibraryId(imported.id);
      setSelectedFolderPath(imported.folderTree.fullPath);
      setSelectedLessonId(imported.lastOpenedLessonId);
      setPathInput(imported.rootPath);
      setStatus({
        tone: "neutral",
        message: `Imported ${imported.name}: ${imported.lessons.length} lessons, ${imported.pdfDocuments.length} PDFs.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Import failed: ${String(error)}`
      });
    } finally {
      setIsWorking(false);
    }
  }

  async function rescanSelectedLibrary() {
    if (!selectedLibrary) {
      return;
    }

    setIsWorking(true);
    setStatus({
      tone: "neutral",
      message: `Rescanning ${selectedLibrary.name} ...`
    });

    try {
      const rescanned = await invoke<Library>("rescan_library", {
        libraryId: selectedLibrary.id
      });
      setLibraries((previous) => upsertLibrary(previous, rescanned));
      setSelectedLibraryId(rescanned.id);
      setSelectedFolderPath(rescanned.folderTree.fullPath);
      setSelectedLessonId(rescanned.lastOpenedLessonId);

      const availabilityNote = rescanned.isAvailable ? "" : " (root folder currently missing)";
      setStatus({
        tone: rescanned.isAvailable ? "neutral" : "error",
        message: `Rescan complete: ${rescanned.lessons.length} lessons, ${rescanned.pdfDocuments.length} PDFs${availabilityNote}.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Rescan failed: ${String(error)}`
      });
    } finally {
      setIsWorking(false);
    }
  }

  function onSelectLibrary(library: Library) {
    setSelectedLibraryId(library.id);
    setSelectedFolderPath(library.folderTree.fullPath);
    setSelectedLessonId(library.lastOpenedLessonId);
    setPathInput(library.rootPath);
  }

  async function onSelectLesson(lessonId: string) {
    if (!selectedLibrary) {
      return;
    }

    setSelectedLessonId(lessonId);
    await invoke("set_last_opened_lesson", {
      libraryId: selectedLibrary.id,
      lessonId
    }).catch(() => {
      // Non-blocking for Phase 4 browser UI.
    });
  }

  return (
    <AppShell
      sidebar={
        <section className="panel">
          <h2>Libraries</h2>
          <div className="import-controls">
            <label htmlFor="root-path">Root folder path</label>
            <input
              id="root-path"
              type="text"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="/Users/you/LanguageLessons"
              disabled={isWorking}
            />
            <div className="button-row">
              <button type="button" onClick={() => void pickFolder()} disabled={isWorking}>
                Pick Folder
              </button>
              <button type="button" onClick={() => void importLibrary()} disabled={isWorking}>
                Import + Scan
              </button>
              <button
                type="button"
                onClick={() => void rescanSelectedLibrary()}
                disabled={isWorking || !selectedLibrary}
              >
                Rescan
              </button>
            </div>
            <p className={status.tone === "error" ? "status error" : "status"}>{status.message}</p>
          </div>

          <div className="library-list">
            {libraries.map((library) => (
              <button
                key={library.id}
                type="button"
                className={library.id === selectedLibraryId ? "library-btn selected" : "library-btn"}
                onClick={() => onSelectLibrary(library)}
              >
                <span>{library.name}</span>
                <small>{library.rootPath}</small>
                {!library.isAvailable && <small className="missing">Missing</small>}
              </button>
            ))}
            {libraries.length === 0 && <p className="empty">No imported libraries.</p>}
          </div>

          {selectedLibrary && (
            <FolderTree
              node={selectedLibrary.folderTree}
              selectedFolderPath={selectedFolderPath}
              onSelect={setSelectedFolderPath}
            />
          )}
        </section>
      }
      content={
        <section className="panel">
          <h1>Language Learning Library</h1>

          {!selectedLibrary && <p>Import a root folder to view lessons and reference PDFs.</p>}

          {selectedLibrary && (
            <>
              <p className="library-meta">{selectedLibrary.name}</p>
              <p className="library-path">{selectedLibrary.rootPath}</p>
              {!selectedLibrary.isAvailable && (
                <p className="status error">{selectedLibrary.missingReason ?? "Root folder is currently unavailable."}</p>
              )}
            </>
          )}

          {selectedLibrary && selectedFolder && (
            <div className="content-grid">
              <section>
                <h3>Current Folder</h3>
                <p className="library-path">{selectedFolder.fullPath}</p>
                <p className="library-path">Folder context: {selectedFolder.relativePath}</p>

                <h3>Lessons In Folder</h3>
                {folderLessons.length === 0 && <p className="empty">No supported audio lessons in this folder.</p>}
                {folderLessons.length > 0 && (
                  <ul className="item-list lesson-list">
                    {folderLessons.map((lesson) => (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          className={lesson.id === selectedLessonId ? "lesson-btn selected" : "lesson-btn"}
                          onClick={() => void onSelectLesson(lesson.id)}
                        >
                          <span>{lesson.fileName}</span>
                          <small>{lesson.relativePath}</small>
                          <small className={lesson.played ? "played" : "unplayed"}>
                            {lesson.played ? "Played" : "Unplayed"}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h3>Current Lesson</h3>
                {!selectedLesson && <p className="empty">Select a lesson to view current context.</p>}
                {selectedLesson && (
                  <div className="current-lesson">
                    <p>{selectedLesson.fileName}</p>
                    <p className="library-path">{selectedLesson.fullPath}</p>
                    <p className={selectedLesson.played ? "status" : "status error"}>
                      {selectedLesson.played ? "Played" : "Unplayed"}
                    </p>
                  </div>
                )}
              </section>

              <section>
                <h3>Reference Documents</h3>
                <p className="library-path">
                  Shared library PDFs stay available while you navigate folders and lessons.
                </p>

                <h3>Shared Library PDFs (Root-Level)</h3>
                {sharedPdfs.length === 0 && <p className="empty">No root-level shared PDFs.</p>}
                {sharedPdfs.length > 0 && (
                  <ul className="item-list">
                    {sharedPdfs.map((pdf) => (
                      <li key={pdf.id}>
                        <span>{pdf.fileName}</span>
                        <small>{pdf.relativePath}</small>
                      </li>
                    ))}
                  </ul>
                )}

                <h3>Current Folder PDFs</h3>
                {folderPdfs.length === 0 && <p className="empty">No folder-local PDFs in this folder.</p>}
                {folderPdfs.length > 0 && (
                  <ul className="item-list">
                    {folderPdfs.map((pdf) => (
                      <li key={pdf.id}>
                        <span>{pdf.fileName}</span>
                        <small>{pdf.relativePath}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </section>
      }
    />
  );
}

function findFolderNode(node: FolderNode, folderPath: string): FolderNode | null {
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

function upsertLibrary(libraries: Library[], next: Library): Library[] {
  const existingIndex = libraries.findIndex((library) => library.id === next.id);
  if (existingIndex === -1) {
    return [...libraries, next].sort((a, b) => a.name.localeCompare(b.name));
  }

  const updated = [...libraries];
  updated[existingIndex] = next;
  return updated;
}
