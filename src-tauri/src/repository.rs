use crate::models::{FolderNode, Lesson, Library, PdfDocument, PdfScope};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn save_scanned_library(conn: &mut Connection, scanned: &Library) -> Result<Library, String> {
    let lesson_state = existing_lesson_state(conn, &scanned.id)?;
    let last_opened = load_last_opened_lesson(conn, &scanned.id)?;
    let timestamp = unix_timestamp_now();

    let tx = conn
        .transaction()
        .map_err(|err| format!("Failed to open transaction: {}", err))?;

    tx.execute(
        "
        INSERT INTO libraries (id, name, root_path, is_available, missing_reason, last_scanned_at)
        VALUES (?1, ?2, ?3, 1, NULL, ?4)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          root_path = excluded.root_path,
          is_available = excluded.is_available,
          missing_reason = excluded.missing_reason,
          last_scanned_at = excluded.last_scanned_at
        ",
        params![&scanned.id, &scanned.name, &scanned.root_path, timestamp],
    )
    .map_err(|err| format!("Failed to upsert library: {}", err))?;

    tx.execute(
        "INSERT OR IGNORE INTO library_state (library_id, last_opened_lesson_id) VALUES (?1, ?2)",
        params![&scanned.id, last_opened],
    )
    .map_err(|err| format!("Failed to ensure library state: {}", err))?;

    tx.execute(
        "DELETE FROM library_shared_pdfs WHERE library_id = ?1",
        params![&scanned.id],
    )
    .map_err(|err| format!("Failed to clear shared PDF links: {}", err))?;
    tx.execute("DELETE FROM pdf_documents WHERE library_id = ?1", params![&scanned.id])
        .map_err(|err| format!("Failed to clear PDFs: {}", err))?;
    tx.execute("DELETE FROM lessons WHERE library_id = ?1", params![&scanned.id])
        .map_err(|err| format!("Failed to clear lessons: {}", err))?;
    tx.execute("DELETE FROM folders WHERE library_id = ?1", params![&scanned.id])
        .map_err(|err| format!("Failed to clear folders: {}", err))?;

    let mut folder_rows: Vec<(String, Option<String>, String, String, String)> = Vec::new();
    flatten_folders(&scanned.folder_tree, None, &mut folder_rows);

    for (id, parent_id, name, full_path, relative_path) in &folder_rows {
        tx.execute(
            "
            INSERT INTO folders (id, library_id, parent_id, name, full_path, relative_path)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![id, &scanned.id, parent_id, name, full_path, relative_path],
        )
        .map_err(|err| format!("Failed to insert folder {}: {}", full_path, err))?;
    }

    let folder_id_by_path: HashMap<String, String> = folder_rows
        .iter()
        .map(|(id, _parent, _name, full_path, _relative)| (full_path.clone(), id.clone()))
        .collect();

    for lesson in &scanned.lessons {
        let folder_id = folder_id_by_path
            .get(&lesson.folder_path)
            .ok_or_else(|| format!("Missing folder for lesson {}", lesson.full_path))?;

        let state = lesson_state.get(&lesson.full_path);
        let played = state.map(|value| value.0).unwrap_or(false);
        let playback_position = state.and_then(|value| value.1);

        tx.execute(
            "
            INSERT INTO lessons (
              id, library_id, folder_id, file_name, full_path, relative_path, folder_path, extension, played, playback_position_seconds
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ",
            params![
                &lesson.id,
                &scanned.id,
                folder_id,
                &lesson.file_name,
                &lesson.full_path,
                &lesson.relative_path,
                &lesson.folder_path,
                &lesson.extension,
                bool_to_int(played),
                playback_position
            ],
        )
        .map_err(|err| format!("Failed to insert lesson {}: {}", lesson.full_path, err))?;
    }

    for pdf in &scanned.pdf_documents {
        let folder_id = folder_id_by_path
            .get(&pdf.folder_path)
            .ok_or_else(|| format!("Missing folder for PDF {}", pdf.full_path))?;

        tx.execute(
            "
            INSERT INTO pdf_documents (
              id, library_id, folder_id, file_name, full_path, relative_path, folder_path, scope
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                &pdf.id,
                &scanned.id,
                folder_id,
                &pdf.file_name,
                &pdf.full_path,
                &pdf.relative_path,
                &pdf.folder_path,
                scope_to_string(&pdf.scope)
            ],
        )
        .map_err(|err| format!("Failed to insert PDF {}: {}", pdf.full_path, err))?;
    }

    for pdf_id in &scanned.shared_pdf_ids {
        tx.execute(
            "
            INSERT INTO library_shared_pdfs (library_id, pdf_id)
            VALUES (?1, ?2)
            ",
            params![&scanned.id, pdf_id],
        )
        .map_err(|err| format!("Failed to link shared PDF {}: {}", pdf_id, err))?;
    }

    tx.commit()
        .map_err(|err| format!("Failed to commit library transaction: {}", err))?;

    load_library_by_id(conn, &scanned.id)
}

pub fn load_all_libraries(conn: &mut Connection) -> Result<Vec<Library>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM libraries ORDER BY name COLLATE NOCASE")
        .map_err(|err| format!("Failed to prepare library query: {}", err))?;

    let library_ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| format!("Failed to query libraries: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect libraries: {}", err))?;

    let mut libraries = Vec::new();
    for library_id in library_ids {
        update_library_availability(conn, &library_id)?;
        libraries.push(load_library_by_id(conn, &library_id)?);
    }

    Ok(libraries)
}

pub fn load_library_by_id(conn: &Connection, library_id: &str) -> Result<Library, String> {
    let mut lib_stmt = conn
        .prepare(
            "
            SELECT l.id, l.name, l.root_path, l.is_available, l.missing_reason, s.last_opened_lesson_id
            FROM libraries l
            LEFT JOIN library_state s ON s.library_id = l.id
            WHERE l.id = ?1
            ",
        )
        .map_err(|err| format!("Failed to prepare library lookup: {}", err))?;

    let (id, name, root_path, is_available, missing_reason, last_opened_lesson_id): (
        String,
        String,
        String,
        i64,
        Option<String>,
        Option<String>,
    ) = lib_stmt
        .query_row(params![library_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|err| format!("Failed to load library {}: {}", library_id, err))?;

    let mut folder_stmt = conn
        .prepare(
            "
            SELECT id, parent_id, name, full_path, relative_path
            FROM folders
            WHERE library_id = ?1
            ORDER BY full_path
            ",
        )
        .map_err(|err| format!("Failed to prepare folder query: {}", err))?;

    let folder_rows = folder_stmt
        .query_map(params![library_id], |row| {
            Ok(FolderRow {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                full_path: row.get(3)?,
                relative_path: row.get(4)?,
            })
        })
        .map_err(|err| format!("Failed to load folders: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect folders: {}", err))?;

    if folder_rows.is_empty() {
        return Err(format!("No folder structure stored for library {}", library_id));
    }

    let mut lesson_stmt = conn
        .prepare(
            "
            SELECT id, folder_id, file_name, full_path, relative_path, folder_path, extension, played, playback_position_seconds
            FROM lessons
            WHERE library_id = ?1
            ORDER BY relative_path
            ",
        )
        .map_err(|err| format!("Failed to prepare lesson query: {}", err))?;

    let lesson_data = lesson_stmt
        .query_map(params![library_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                Lesson {
                    id: row.get(0)?,
                    file_name: row.get(2)?,
                    full_path: row.get(3)?,
                    relative_path: row.get(4)?,
                    folder_path: row.get(5)?,
                    extension: row.get(6)?,
                    played: row.get::<_, i64>(7)? == 1,
                    playback_position_seconds: row.get(8)?,
                },
            ))
        })
        .map_err(|err| format!("Failed to load lessons: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect lessons: {}", err))?;

    let mut pdf_stmt = conn
        .prepare(
            "
            SELECT id, folder_id, file_name, full_path, relative_path, folder_path, scope
            FROM pdf_documents
            WHERE library_id = ?1
            ORDER BY relative_path
            ",
        )
        .map_err(|err| format!("Failed to prepare PDF query: {}", err))?;

    let pdf_data = pdf_stmt
        .query_map(params![library_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                PdfDocument {
                    id: row.get(0)?,
                    file_name: row.get(2)?,
                    full_path: row.get(3)?,
                    relative_path: row.get(4)?,
                    folder_path: row.get(5)?,
                    scope: string_to_scope(row.get::<_, String>(6)?),
                },
            ))
        })
        .map_err(|err| format!("Failed to load PDFs: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect PDFs: {}", err))?;

    let mut shared_stmt = conn
        .prepare(
            "
            SELECT pdf_id
            FROM library_shared_pdfs
            WHERE library_id = ?1
            ORDER BY pdf_id
            ",
        )
        .map_err(|err| format!("Failed to prepare shared PDF query: {}", err))?;

    let shared_pdf_ids = shared_stmt
        .query_map(params![library_id], |row| row.get::<_, String>(0))
        .map_err(|err| format!("Failed to load shared PDF IDs: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect shared PDF IDs: {}", err))?;

    let mut lesson_ids_by_folder: HashMap<String, Vec<String>> = HashMap::new();
    let lessons = lesson_data
        .into_iter()
        .map(|(lesson_id, folder_id, lesson)| {
            lesson_ids_by_folder
                .entry(folder_id)
                .or_default()
                .push(lesson_id);
            lesson
        })
        .collect::<Vec<_>>();

    let mut pdf_ids_by_folder: HashMap<String, Vec<String>> = HashMap::new();
    let pdf_documents = pdf_data
        .into_iter()
        .map(|(pdf_id, folder_id, pdf)| {
            pdf_ids_by_folder.entry(folder_id).or_default().push(pdf_id);
            pdf
        })
        .collect::<Vec<_>>();

    let mut folder_rows_by_id: HashMap<String, FolderRow> = HashMap::new();
    let mut children_by_parent: HashMap<Option<String>, Vec<String>> = HashMap::new();
    let mut root_id: Option<String> = None;

    for row in folder_rows {
        if row.parent_id.is_none() {
            root_id = Some(row.id.clone());
        }

        children_by_parent
            .entry(row.parent_id.clone())
            .or_default()
            .push(row.id.clone());

        folder_rows_by_id.insert(row.id.clone(), row);
    }

    let root_folder_id = root_id.ok_or_else(|| format!("Missing root folder for library {}", library_id))?;

    let folder_tree = build_folder_tree(
        &root_folder_id,
        &folder_rows_by_id,
        &children_by_parent,
        &lesson_ids_by_folder,
        &pdf_ids_by_folder,
    )?;

    Ok(Library {
        id,
        name,
        root_path,
        is_available: is_available == 1,
        missing_reason,
        last_opened_lesson_id,
        folder_tree,
        lessons,
        pdf_documents,
        shared_pdf_ids,
    })
}

pub fn update_library_availability(conn: &Connection, library_id: &str) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT root_path, is_available FROM libraries WHERE id = ?1")
        .map_err(|err| format!("Failed to prepare availability query: {}", err))?;

    let result: Option<(String, i64)> = stmt
        .query_row(params![library_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()
        .map_err(|err| format!("Failed to read availability row: {}", err))?;

    let Some((root_path, current_available)) = result else {
        return Err(format!("Library not found: {}", library_id));
    };

    let exists = Path::new(&root_path).is_dir();

    if exists && current_available == 1 {
        return Ok(());
    }

    if exists {
        conn.execute(
            "UPDATE libraries SET is_available = 1, missing_reason = NULL WHERE id = ?1",
            params![library_id],
        )
        .map_err(|err| format!("Failed to mark library available: {}", err))?;
    } else {
        conn.execute(
            "UPDATE libraries SET is_available = 0, missing_reason = ?2 WHERE id = ?1",
            params![library_id, format!("Root folder is missing: {}", root_path)],
        )
        .map_err(|err| format!("Failed to mark library missing: {}", err))?;
    }

    Ok(())
}

pub fn root_path_for_library(conn: &Connection, library_id: &str) -> Result<String, String> {
    let mut stmt = conn
        .prepare("SELECT root_path FROM libraries WHERE id = ?1")
        .map_err(|err| format!("Failed to prepare root path query: {}", err))?;

    stmt.query_row(params![library_id], |row| row.get(0))
        .map_err(|err| format!("Failed to load root path for {}: {}", library_id, err))
}

pub fn set_lesson_played(conn: &Connection, lesson_id: &str, played: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE lessons SET played = ?2 WHERE id = ?1",
        params![lesson_id, bool_to_int(played)],
    )
    .map_err(|err| format!("Failed to update lesson state: {}", err))?;

    Ok(())
}

pub fn set_lesson_playback_position(
    conn: &Connection,
    lesson_id: &str,
    playback_position_seconds: Option<f64>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE lessons SET playback_position_seconds = ?2 WHERE id = ?1",
        params![lesson_id, playback_position_seconds],
    )
    .map_err(|err| format!("Failed to update lesson playback position: {}", err))?;

    Ok(())
}

pub fn set_last_opened_lesson(
    conn: &Connection,
    library_id: &str,
    lesson_id: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO library_state (library_id, last_opened_lesson_id)
        VALUES (?1, ?2)
        ON CONFLICT(library_id) DO UPDATE SET
          last_opened_lesson_id = excluded.last_opened_lesson_id
        ",
        params![library_id, lesson_id],
    )
    .map_err(|err| format!("Failed to set last opened lesson: {}", err))?;

    Ok(())
}

fn flatten_folders(
    node: &FolderNode,
    parent_id: Option<String>,
    output: &mut Vec<(String, Option<String>, String, String, String)>,
) {
    output.push((
        node.id.clone(),
        parent_id.clone(),
        node.name.clone(),
        node.full_path.clone(),
        node.relative_path.clone(),
    ));

    for child in &node.children {
        flatten_folders(child, Some(node.id.clone()), output);
    }
}

fn build_folder_tree(
    current_id: &str,
    folder_rows_by_id: &HashMap<String, FolderRow>,
    children_by_parent: &HashMap<Option<String>, Vec<String>>,
    lesson_ids_by_folder: &HashMap<String, Vec<String>>,
    pdf_ids_by_folder: &HashMap<String, Vec<String>>,
) -> Result<FolderNode, String> {
    let row = folder_rows_by_id
        .get(current_id)
        .ok_or_else(|| format!("Missing folder row for {}", current_id))?;

    let child_ids = children_by_parent
        .get(&Some(current_id.to_string()))
        .cloned()
        .unwrap_or_default();

    let mut children = Vec::new();
    for child_id in child_ids {
        children.push(build_folder_tree(
            &child_id,
            folder_rows_by_id,
            children_by_parent,
            lesson_ids_by_folder,
            pdf_ids_by_folder,
        )?);
    }

    Ok(FolderNode {
        id: row.id.clone(),
        name: row.name.clone(),
        full_path: row.full_path.clone(),
        relative_path: row.relative_path.clone(),
        children,
        lesson_ids: lesson_ids_by_folder
            .get(current_id)
            .cloned()
            .unwrap_or_default(),
        pdf_ids: pdf_ids_by_folder
            .get(current_id)
            .cloned()
            .unwrap_or_default(),
    })
}

fn existing_lesson_state(
    conn: &Connection,
    library_id: &str,
) -> Result<HashMap<String, (bool, Option<f64>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT full_path, played, playback_position_seconds FROM lessons WHERE library_id = ?1",
        )
        .map_err(|err| format!("Failed to prepare lesson state query: {}", err))?;

    let rows = stmt
        .query_map(params![library_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? == 1,
                row.get::<_, Option<f64>>(2)?,
            ))
        })
        .map_err(|err| format!("Failed to query lesson states: {}", err))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to collect lesson states: {}", err))?;

    Ok(rows
        .into_iter()
        .map(|(full_path, played, playback)| (full_path, (played, playback)))
        .collect())
}

fn load_last_opened_lesson(conn: &Connection, library_id: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT last_opened_lesson_id FROM library_state WHERE library_id = ?1")
        .map_err(|err| format!("Failed to prepare last-opened query: {}", err))?;

    let value = stmt
        .query_row(params![library_id], |row| row.get::<_, Option<String>>(0))
        .optional()
        .map_err(|err| format!("Failed to load last-opened lesson: {}", err))?;

    Ok(value.flatten())
}

fn scope_to_string(scope: &PdfScope) -> String {
    match scope {
        PdfScope::RootShared => "root_shared".to_string(),
        PdfScope::FolderLocal => "folder_local".to_string(),
    }
}

fn string_to_scope(value: String) -> PdfScope {
    if value == "root_shared" {
        PdfScope::RootShared
    } else {
        PdfScope::FolderLocal
    }
}

fn bool_to_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn unix_timestamp_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone)]
struct FolderRow {
    id: String,
    parent_id: Option<String>,
    name: String,
    full_path: String,
    relative_path: String,
}
