use crate::models::{FolderNode, Lesson, Library, PdfDocument, PdfScope};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "m4a", "wav", "aac", "flac", "ogg"];

pub fn scan_library(root_path: &str) -> Result<Library, String> {
    let root = normalize_root_path(root_path)?;
    let root_name = root
        .file_name()
        .and_then(OsStr::to_str)
        .map(|v| v.to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    let mut lessons: Vec<Lesson> = Vec::new();
    let mut pdf_documents: Vec<PdfDocument> = Vec::new();
    let mut shared_pdf_ids: Vec<String> = Vec::new();

    let folder_tree = scan_folder(
        &root,
        &root,
        &mut lessons,
        &mut pdf_documents,
        &mut shared_pdf_ids,
    )?;

    Ok(Library {
        id: format!("library:{}", root.to_string_lossy()),
        name: root_name,
        root_path: root.to_string_lossy().to_string(),
        folder_tree,
        lessons,
        pdf_documents,
        shared_pdf_ids,
    })
}

fn normalize_root_path(root_path: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(root_path.trim());
    if !input.exists() {
        return Err(format!("Path does not exist: {}", input.to_string_lossy()));
    }

    if !input.is_dir() {
        return Err(format!("Path is not a directory: {}", input.to_string_lossy()));
    }

    input
        .canonicalize()
        .map_err(|err| format!("Failed to resolve path: {}", err))
}

fn scan_folder(
    current: &Path,
    root: &Path,
    lessons: &mut Vec<Lesson>,
    pdf_documents: &mut Vec<PdfDocument>,
    shared_pdf_ids: &mut Vec<String>,
) -> Result<FolderNode, String> {
    let current_path = current.to_string_lossy().to_string();
    let relative_path = relative_path(root, current);
    let name = folder_name(root, current);

    let mut children: Vec<FolderNode> = Vec::new();
    let mut lesson_ids: Vec<String> = Vec::new();
    let mut pdf_ids: Vec<String> = Vec::new();

    let mut entries: Vec<fs::DirEntry> = fs::read_dir(current)
        .map_err(|err| format!("Failed to read directory {}: {}", current_path, err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to read directory entry in {}: {}", current_path, err))?;

    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();

        if path.is_dir() {
            let node = scan_folder(&path, root, lessons, pdf_documents, shared_pdf_ids)?;
            children.push(node);
            continue;
        }

        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(OsStr::to_str)
            .map(str::to_lowercase)
            .unwrap_or_default();

        if AUDIO_EXTENSIONS.contains(&extension.as_str()) {
            let full = path.to_string_lossy().to_string();
            let lesson = Lesson {
                id: format!("lesson:{}", full),
                file_name: file_name(&path),
                full_path: full.clone(),
                relative_path: relative_path(root, &path),
                folder_path: current_path.clone(),
                extension,
            };
            lesson_ids.push(lesson.id.clone());
            lessons.push(lesson);
            continue;
        }

        if extension == "pdf" {
            let full = path.to_string_lossy().to_string();
            let is_root = current == root;
            let pdf = PdfDocument {
                id: format!("pdf:{}", full),
                file_name: file_name(&path),
                full_path: full.clone(),
                relative_path: relative_path(root, &path),
                folder_path: current_path.clone(),
                scope: if is_root {
                    PdfScope::RootShared
                } else {
                    PdfScope::FolderLocal
                },
            };

            if is_root {
                shared_pdf_ids.push(pdf.id.clone());
            }

            pdf_ids.push(pdf.id.clone());
            pdf_documents.push(pdf);
        }
    }

    Ok(FolderNode {
        id: format!("folder:{}", current_path),
        name,
        full_path: current_path,
        relative_path,
        children,
        lesson_ids,
        pdf_ids,
    })
}

fn relative_path(root: &Path, target: &Path) -> String {
    target
        .strip_prefix(root)
        .ok()
        .map(|path| {
            let value = path.to_string_lossy().to_string();
            if value.is_empty() {
                "/".to_string()
            } else {
                value
            }
        })
        .unwrap_or_else(|| target.to_string_lossy().to_string())
}

fn folder_name(root: &Path, current: &Path) -> String {
    if current == root {
        return root
            .file_name()
            .and_then(OsStr::to_str)
            .map(|name| name.to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());
    }

    current
        .file_name()
        .and_then(OsStr::to_str)
        .map(|name| name.to_string())
        .unwrap_or_else(|| current.to_string_lossy().to_string())
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(OsStr::to_str)
        .map(|name| name.to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}
