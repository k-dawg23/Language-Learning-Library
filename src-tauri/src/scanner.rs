use crate::models::{FolderNode, Lesson, Library, PdfDocument, PdfScope};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "m4a", "wav", "aac", "flac", "ogg"];
const MAX_SCAN_DEPTH: usize = 256;

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
        0,
    )?;

    Ok(Library {
        id: format!("library:{}", root.to_string_lossy()),
        name: root_name,
        root_path: root.to_string_lossy().to_string(),
        is_available: true,
        missing_reason: None,
        last_opened_lesson_id: None,
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
    depth: usize,
) -> Result<FolderNode, String> {
    let current_path = current.to_string_lossy().to_string();
    let relative_path = relative_path(root, current);
    let name = folder_name(root, current);

    let mut children: Vec<FolderNode> = Vec::new();
    let mut lesson_ids: Vec<String> = Vec::new();
    let mut pdf_ids: Vec<String> = Vec::new();

    let read_dir = match fs::read_dir(current) {
        Ok(dir) => dir,
        Err(err) => {
            if current == root {
                return Err(format!("Failed to read directory {}: {}", current_path, err));
            }

            // Keep scanning even if one nested directory is unavailable.
            return Ok(FolderNode {
                id: format!("folder:{}", current_path),
                name,
                full_path: current_path,
                relative_path,
                children,
                lesson_ids,
                pdf_ids,
            });
        }
    };

    let mut entries: Vec<fs::DirEntry> = read_dir
        .filter_map(|entry| entry.ok())
        .collect();

    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();

        if file_type.is_dir() {
            if let Ok(node) = scan_folder(
                &path,
                root,
                lessons,
                pdf_documents,
                shared_pdf_ids,
                depth + 1,
            ) {
                children.push(node);
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default();

        if is_supported_audio_extension(extension) {
            let full = path.to_string_lossy().to_string();
            let lesson = Lesson {
                id: format!("lesson:{}", full),
                file_name: file_name(&path),
                full_path: full.clone(),
                relative_path: relative_path(root, &path),
                folder_path: current_path.clone(),
                extension: extension.to_ascii_lowercase(),
                played: false,
                playback_position_seconds: None,
            };
            lesson_ids.push(lesson.id.clone());
            lessons.push(lesson);
            continue;
        }

        if extension.eq_ignore_ascii_case("pdf") {
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

fn is_supported_audio_extension(extension: &str) -> bool {
    AUDIO_EXTENSIONS
        .iter()
        .any(|supported| extension.eq_ignore_ascii_case(supported))
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
    if depth > MAX_SCAN_DEPTH {
        return Ok(FolderNode {
            id: format!("folder:{}", current_path),
            name,
            full_path: current_path,
            relative_path,
            children,
            lesson_ids,
            pdf_ids,
        });
    }
