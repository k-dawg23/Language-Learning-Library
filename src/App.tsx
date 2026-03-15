import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AppShell } from "./components/AppShell";
import { FolderTree } from "./components/FolderTree";
import {
  buildFolderProgressMap,
  findFolderNode,
  formatTime,
  upsertLibrary
} from "./lib/library-utils";
import {
  importLibrary as importLibraryApi,
  loadAudioDataUrl,
  loadImportedLibraries,
  rescanLibrary,
  setLastOpenedLesson,
  setLessonPlaybackPosition,
  setLessonPlayed
} from "./lib/tauri-api";
import type { Library, Lesson, PdfDocument } from "./types/library";

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
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [audioSourceMode, setAudioSourceMode] = useState<"asset" | "file" | "data">("asset");
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    tone: "neutral",
    message: "Loading imported libraries..."
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastPersistedSecondRef = useRef(-1);
  const autoplayNextRef = useRef(false);

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
      .filter((lesson): lesson is Lesson => Boolean(lesson))
      .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" }));
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

  const selectedPdf = useMemo(() => {
    if (!selectedPdfId) {
      return null;
    }

    return pdfById.get(selectedPdfId) ?? null;
  }, [selectedPdfId, pdfById]);

  const selectedLessonIndex = useMemo(() => {
    if (!selectedLessonId) {
      return -1;
    }

    return folderLessons.findIndex((lesson) => lesson.id === selectedLessonId);
  }, [folderLessons, selectedLessonId]);

  const hasPreviousLesson = selectedLessonIndex > 0;
  const hasNextLesson = selectedLessonIndex >= 0 && selectedLessonIndex < folderLessons.length - 1;

  const folderProgressByPath = useMemo(() => {
    if (!selectedLibrary) {
      return new Map<string, { played: number; total: number }>();
    }

    return buildFolderProgressMap(selectedLibrary.folderTree, lessonById);
  }, [selectedLibrary, lessonById]);

  const audioSrc = useMemo(() => {
    if (!selectedLesson) {
      return "";
    }

    if (audioSourceMode === "data") {
      return audioDataUrl ?? "";
    }

    if (audioSourceMode === "file") {
      return toFileUrl(selectedLesson.fullPath);
    }

    return convertFileSrc(selectedLesson.fullPath);
  }, [selectedLesson, audioDataUrl, audioSourceMode]);

  const pdfSrc = useMemo(() => {
    if (!selectedPdf) {
      return "";
    }

    return `${convertFileSrc(selectedPdf.fullPath)}#view=FitH`;
  }, [selectedPdf]);

  useEffect(() => {
    void loadLibrariesOnStartup();
  }, []);

  useEffect(() => {
    if (!selectedLibrary) {
      setSelectedFolderPath("");
      setSelectedLessonId(null);
      setSelectedPdfId(null);
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

  useEffect(() => {
    if (!selectedLibrary) {
      return;
    }

    const visiblePdfs = [...sharedPdfs, ...folderPdfs];
    if (visiblePdfs.length === 0) {
      if (selectedPdfId !== null) {
        setSelectedPdfId(null);
      }
      return;
    }

    if (selectedPdfId && pdfById.has(selectedPdfId)) {
      return;
    }

    const preferred = sharedPdfs[0] ?? visiblePdfs[0];
    setSelectedPdfId(preferred.id);
  }, [selectedLibrary, sharedPdfs, folderPdfs, selectedPdfId, pdfById]);

  useEffect(() => {
    if (!selectedLessonId || !selectedLesson) {
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      pendingSeekRef.current = null;
      lastPersistedSecondRef.current = -1;
      return;
    }

    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setAudioSourceMode("asset");
    setAudioDataUrl(null);
    pendingSeekRef.current = selectedLesson.playbackPositionSeconds;
    lastPersistedSecondRef.current = Math.floor(selectedLesson.playbackPositionSeconds ?? 0);
  }, [selectedLessonId]);

  async function loadLibrariesOnStartup() {
    try {
      const loaded = await loadImportedLibraries();
      setLibraries(loaded);

      if (loaded.length > 0) {
        const first = loaded[0];
        focusLibrarySelection(first);
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
      const imported = await importLibraryApi(rootPath);
      setLibraries((previous) => upsertLibrary(previous, imported));
      focusLibrarySelection(imported);
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
      const rescanned = await rescanLibrary(selectedLibrary.id);
      setLibraries((previous) => upsertLibrary(previous, rescanned));
      focusLibrarySelection(rescanned);

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
    focusLibrarySelection(library);
  }

  function focusLibrarySelection(library: Library) {
    const lessonToRestore = library.lastOpenedLessonId
      ? library.lessons.find((lesson) => lesson.id === library.lastOpenedLessonId) ?? null
      : null;

    setSelectedLibraryId(library.id);
    setPathInput(library.rootPath);
    setSelectedLessonId(lessonToRestore?.id ?? null);
    setSelectedFolderPath(lessonToRestore?.folderPath ?? library.folderTree.fullPath);
  }

  async function onSelectLesson(lessonId: string) {
    if (!selectedLibrary) {
      return;
    }

    setSelectedLessonId(lessonId);
    await setLastOpenedLesson(selectedLibrary.id, lessonId).catch(() => {
      // Non-blocking for Phase 5 browser UI.
    });
  }

  function onSelectPdf(pdfId: string) {
    setSelectedPdfId(pdfId);
  }

  function openPdfFallback() {
    if (!pdfSrc) {
      return;
    }

    window.open(pdfSrc, "_blank", "noopener,noreferrer");
  }

  async function persistPlayed(lessonId: string, played: boolean) {
    if (!selectedLibrary) {
      return;
    }

    setLibraries((previous) =>
      previous.map((library) => {
        if (library.id !== selectedLibrary.id) {
          return library;
        }

        return {
          ...library,
          lessons: library.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, played } : lesson))
        };
      })
    );

    await setLessonPlayed(lessonId, played).catch(() => {
      // Keep UI responsive even if persistence fails.
    });
  }

  async function persistPlaybackPosition(lessonId: string, seconds: number | null) {
    await setLessonPlaybackPosition(lessonId, seconds).catch(() => {
      // Keep UI responsive even if persistence fails.
    });
  }

  async function toggleCurrentLessonPlayed() {
    if (!selectedLesson) {
      return;
    }

    await persistPlayed(selectedLesson.id, !selectedLesson.played);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !selectedLesson) {
      return;
    }

    if (audio.paused) {
      await audio.play().catch(async () => {
        if (audioSourceMode === "asset") {
          setAudioSourceMode("file");

          window.setTimeout(() => {
            const retryAudio = audioRef.current;
            if (!retryAudio) {
              return;
            }

            void retryAudio.play().catch(() => {
              setStatus({
                tone: "error",
                message: `Could not play ${selectedLesson.fileName}. Check if the file still exists and is readable.`
              });
            });
          }, 50);
          return;
        }

        if (audioSourceMode === "file") {
          await switchToDataAudioFallback(true);
          return;
        }

        setStatus({
          tone: "error",
          message: `Could not play ${selectedLesson.fileName}. Check file permissions and codec support.`
        });
      });
    } else {
      audio.pause();
    }
  }

  async function playAdjacentLesson(direction: -1 | 1, shouldAutoplay: boolean) {
    if (!selectedLesson || !selectedLibrary || selectedLessonIndex < 0) {
      return;
    }

    const nextIndex = selectedLessonIndex + direction;
    if (nextIndex < 0 || nextIndex >= folderLessons.length) {
      return;
    }

    await persistPlaybackPosition(selectedLesson.id, currentTime);
    autoplayNextRef.current = shouldAutoplay;
    await onSelectLesson(folderLessons[nextIndex].id);
  }

  async function navigateAdjacentLesson(direction: -1 | 1) {
    await playAdjacentLesson(direction, false);
  }

  async function switchToDataAudioFallback(autoplay: boolean) {
    if (!selectedLesson) {
      return;
    }

    try {
      const dataUrl = await loadAudioDataUrl(selectedLesson.fullPath);
      setAudioDataUrl(dataUrl);
      setAudioSourceMode("data");

      if (autoplay) {
        window.setTimeout(() => {
          const retryAudio = audioRef.current;
          if (!retryAudio) {
            return;
          }

          void retryAudio.play().catch(() => {
            setStatus({
              tone: "error",
              message: `Could not play ${selectedLesson.fileName}. Check file permissions and codec support.`
            });
          });
        }, 50);
      }
    } catch {
      setStatus({
        tone: "error",
        message: `Could not play ${selectedLesson.fileName}. Check file permissions and codec support.`
      });
    }
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio || !selectedLesson) {
      return;
    }

    const mediaDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    setDuration(mediaDuration);

    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek !== null && pendingSeek > 0 && pendingSeek < mediaDuration) {
      audio.currentTime = pendingSeek;
      setCurrentTime(pendingSeek);
    }
    pendingSeekRef.current = null;

    if (autoplayNextRef.current) {
      autoplayNextRef.current = false;
      void audio.play();
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !selectedLesson) {
      return;
    }

    const nextTime = audio.currentTime;
    const mediaDuration = Number.isFinite(audio.duration) ? audio.duration : duration;

    setCurrentTime(nextTime);
    setDuration(mediaDuration);

    const roundedSecond = Math.floor(nextTime);
    if (roundedSecond >= 0 && roundedSecond - lastPersistedSecondRef.current >= 5) {
      lastPersistedSecondRef.current = roundedSecond;
      void persistPlaybackPosition(selectedLesson.id, nextTime);
    }

    if (!selectedLesson.played && mediaDuration > 0 && nextTime >= Math.max(mediaDuration - 2, 0)) {
      void persistPlayed(selectedLesson.id, true);
    }
  }

  function handleSeekChange(nextValue: number) {
    const audio = audioRef.current;
    if (!audio || !selectedLesson) {
      return;
    }

    audio.currentTime = nextValue;
    setCurrentTime(nextValue);
    lastPersistedSecondRef.current = Math.floor(nextValue);
    void persistPlaybackPosition(selectedLesson.id, nextValue);
  }

  function handlePause() {
    setIsPlaying(false);
    if (selectedLesson) {
      void persistPlaybackPosition(selectedLesson.id, currentTime);
    }
  }

  function handlePlay() {
    setIsPlaying(true);
  }

  function handleEnded() {
    setIsPlaying(false);
    if (!selectedLesson) {
      return;
    }

    void persistPlayed(selectedLesson.id, true);
    void persistPlaybackPosition(selectedLesson.id, duration);

    if (autoAdvance && hasNextLesson) {
      void playAdjacentLesson(1, true);
    }
  }

  function handleAudioError() {
    if (audioSourceMode === "asset" && selectedLesson) {
      setAudioSourceMode("file");
      return;
    }

    if (audioSourceMode === "file" && selectedLesson) {
      void switchToDataAudioFallback(false);
      return;
    }

    setStatus({
      tone: "error",
      message: `Audio file unavailable for ${selectedLesson?.fileName ?? "selected lesson"}.`
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
              progressByPath={folderProgressByPath}
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
                <p className="library-path">Ordered alphabetically for consistent previous/next navigation.</p>
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
                    <div className="lesson-controls">
                      <button type="button" onClick={() => void navigateAdjacentLesson(-1)} disabled={!hasPreviousLesson}>
                        Previous Lesson
                      </button>
                      <button type="button" onClick={() => void navigateAdjacentLesson(1)} disabled={!hasNextLesson}>
                        Next Lesson
                      </button>
                      <button type="button" onClick={() => void toggleCurrentLessonPlayed()}>
                        Mark as {selectedLesson.played ? "Unplayed" : "Played"}
                      </button>
                    </div>
                  </div>
                )}

                <h3>Audio Player</h3>
                {!selectedLesson && <p className="empty">Choose a lesson to enable playback.</p>}
                {selectedLesson && (
                  <div className="audio-player">
                    <audio
                      key={selectedLesson.id}
                      ref={audioRef}
                      src={audioSrc}
                      preload="metadata"
                      onLoadedMetadata={handleLoadedMetadata}
                      onTimeUpdate={handleTimeUpdate}
                      onPause={handlePause}
                      onPlay={handlePlay}
                      onEnded={handleEnded}
                      onError={handleAudioError}
                    />
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={!hasPreviousLesson}
                        onClick={() => void playAdjacentLesson(-1, false)}
                      >
                        Previous
                      </button>
                      <button type="button" onClick={() => void togglePlayback()}>
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <button
                        type="button"
                        disabled={!hasNextLesson}
                        onClick={() => void playAdjacentLesson(1, false)}
                      >
                        Next
                      </button>
                    </div>
                    <label className="seek-row" htmlFor="seek-bar">
                      <span>{formatTime(currentTime)}</span>
                      <input
                        id="seek-bar"
                        type="range"
                        min={0}
                        max={duration > 0 ? duration : 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        onChange={(event) => handleSeekChange(Number(event.target.value))}
                      />
                      <span>{formatTime(duration)}</span>
                    </label>
                    <label className="checkbox-row" htmlFor="auto-advance">
                      <input
                        id="auto-advance"
                        type="checkbox"
                        checked={autoAdvance}
                        onChange={(event) => setAutoAdvance(event.target.checked)}
                      />
                      Auto-advance to next lesson when playback ends
                    </label>
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
                  <ul className="item-list pdf-list">
                    {sharedPdfs.map((pdf) => (
                      <li key={pdf.id}>
                        <button
                          type="button"
                          className={pdf.id === selectedPdfId ? "pdf-btn selected" : "pdf-btn"}
                          onClick={() => onSelectPdf(pdf.id)}
                        >
                          <span>{pdf.fileName}</span>
                          <small>{pdf.relativePath}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h3>Current Folder PDFs</h3>
                {folderPdfs.length === 0 && <p className="empty">No folder-local PDFs in this folder.</p>}
                {folderPdfs.length > 0 && (
                  <ul className="item-list pdf-list">
                    {folderPdfs.map((pdf) => (
                      <li key={pdf.id}>
                        <button
                          type="button"
                          className={pdf.id === selectedPdfId ? "pdf-btn selected" : "pdf-btn"}
                          onClick={() => onSelectPdf(pdf.id)}
                        >
                          <span>{pdf.fileName}</span>
                          <small>{pdf.relativePath}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h3>PDF Viewer</h3>
                {!selectedPdf && <p className="empty">Select a PDF to view it here.</p>}
                {selectedPdf && (
                  <div className="pdf-viewer">
                    <div className="pdf-viewer-header">
                      <p>{selectedPdf.fileName}</p>
                      <button type="button" onClick={openPdfFallback}>
                        Open Fallback View
                      </button>
                    </div>
                    <p className="library-path">{selectedPdf.fullPath}</p>
                    <iframe title={selectedPdf.fileName} src={pdfSrc} className="pdf-frame" loading="lazy" />
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      }
    />
  );
}

function toFileUrl(fullPath: string): string {
  // Minimal cross-platform fallback when asset protocol cannot serve local media.
  const normalized = fullPath.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return `${prefix}${encodeURI(normalized)}`;
}
