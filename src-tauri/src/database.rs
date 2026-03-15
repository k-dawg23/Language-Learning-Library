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
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;

    Ok(db_path)
}
