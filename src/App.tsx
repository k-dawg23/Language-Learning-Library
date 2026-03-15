import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AppShell } from "./components/AppShell";
import { FolderTree } from "./components/FolderTree";
import type { FolderNode, Library, Lesson, PdfDocument } from "./types/library";

type ScanStatus = {
  tone: "neutral" | "error";
  message: string;
};

export function App() {
  const [pathInput, setPathInput] = useState("");
  const [library, setLibrary] = useState<Library | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    tone: "neutral",
    message: "Import a root folder to scan lessons and PDFs."
  });

  const selectedFolder = useMemo(() => {
    if (!library || !selectedFolderPath) {
      return null;
    }

    return findFolderNode(library.folderTree, selectedFolderPath);
  }, [library, selectedFolderPath]);

  const lessonById = useMemo(() => {
    if (!library) {
      return new Map<string, Lesson>();
    }

    return new Map(library.lessons.map((lesson) => [lesson.id, lesson]));
  }, [library]);

  const pdfById = useMemo(() => {
    if (!library) {
      return new Map<string, PdfDocument>();
    }

    return new Map(library.pdfDocuments.map((pdf) => [pdf.id, pdf]));
  }, [library]);

  const sharedPdfs = useMemo(() => {
    if (!library) {
      return [];
    }

    return library.sharedPdfIds.map((id) => pdfById.get(id)).filter((pdf): pdf is PdfDocument => Boolean(pdf));
  }, [library, pdfById]);

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

  async function pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select language library root folder"
    });

    if (typeof selected === "string") {
      setPathInput(selected);
      await scanPath(selected);
    }
  }

  async function scanPath(rawPath?: string) {
    const rootPath = (rawPath ?? pathInput).trim();

    if (!rootPath) {
      setScanStatus({
        tone: "error",
        message: "Enter a folder path or use the folder picker."
      });
      return;
    }

    setIsScanning(true);
    setScanStatus({
      tone: "neutral",
      message: `Scanning ${rootPath} ...`
    });

    try {
      const scanned = await invoke<Library>("scan_library", { rootPath });
      setLibrary(scanned);
      setSelectedFolderPath(scanned.folderTree.fullPath);
      setPathInput(scanned.rootPath);

      setScanStatus({
        tone: "neutral",
        message: `Scan complete: ${scanned.lessons.length} lessons, ${scanned.pdfDocuments.length} PDFs.`
      });
    } catch (error) {
      setLibrary(null);
      setSelectedFolderPath("");
      setScanStatus({
        tone: "error",
        message: `Scan failed: ${String(error)}`
      });
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <AppShell
      sidebar={
        <section className="panel">
          <h2>Imported Library</h2>
          <div className="import-controls">
            <label htmlFor="root-path">Root folder path</label>
            <input
              id="root-path"
              type="text"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="/Users/you/LanguageLessons"
              disabled={isScanning}
            />
            <div className="button-row">
              <button type="button" onClick={() => void pickFolder()} disabled={isScanning}>
                Pick Folder
              </button>
              <button type="button" onClick={() => void scanPath()} disabled={isScanning}>
                Scan
              </button>
            </div>
            <p className={scanStatus.tone === "error" ? "status error" : "status"}>{scanStatus.message}</p>
          </div>

          {library && (
            <>
              <p className="library-meta">{library.name}</p>
              <p className="library-path">{library.rootPath}</p>
              <FolderTree
                node={library.folderTree}
                selectedFolderPath={selectedFolderPath}
                onSelect={setSelectedFolderPath}
              />
            </>
          )}
        </section>
      }
      content={
        <section className="panel">
          <h1>Language Learning Library</h1>

          {!library && <p>Import a root folder to view folder hierarchy, lessons, and PDFs.</p>}

          {library && selectedFolder && (
            <div className="content-grid">
              <section>
                <h3>Current Folder</h3>
                <p className="library-path">{selectedFolder.fullPath}</p>

                <h3>Lessons In Folder</h3>
                {folderLessons.length === 0 && <p className="empty">No supported audio lessons in this folder.</p>}
                {folderLessons.length > 0 && (
                  <ul className="item-list">
                    {folderLessons.map((lesson) => (
                      <li key={lesson.id}>
                        <span>{lesson.fileName}</span>
                        <small>{lesson.relativePath}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>Shared Library PDFs (Root)</h3>
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
