use rusqlite::{Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub fn initialize(app_data_dir: &Path) -> Result<PathBuf> {
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir).expect("failed to create app data directory");
    }

    let db_path = app_data_dir.join("language_learning_library.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS libraries (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            is_available INTEGER NOT NULL DEFAULT 1,
            missing_reason TEXT,
            last_scanned_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            parent_id TEXT,
            name TEXT NOT NULL,
            full_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lessons (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            full_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            extension TEXT NOT NULL,
            played INTEGER NOT NULL DEFAULT 0,
            playback_position_seconds REAL,
            FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pdf_documents (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            full_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            scope TEXT NOT NULL,
            FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_shared_pdfs (
            library_id TEXT NOT NULL,
            pdf_id TEXT NOT NULL,
            PRIMARY KEY(library_id, pdf_id),
            FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE,
            FOREIGN KEY(pdf_id) REFERENCES pdf_documents(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_state (
            library_id TEXT PRIMARY KEY,
            last_opened_lesson_id TEXT,
            FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_folders_library_id ON folders(library_id);
        CREATE INDEX IF NOT EXISTS idx_lessons_library_id ON lessons(library_id);
        CREATE INDEX IF NOT EXISTS idx_pdfs_library_id ON pdf_documents(library_id);
        ",
    )?;

    Ok(db_path)
}

pub fn open_connection(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}
