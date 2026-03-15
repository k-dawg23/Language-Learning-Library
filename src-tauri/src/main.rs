mod database;
mod models;
mod repository;
mod scanner;

use base64::Engine;
use models::Library;
use std::path::Path;
use tauri::Manager;

struct AppState {
    db_path: Option<String>,
}

#[tauri::command]
fn get_db_status(state: tauri::State<'_, AppState>) -> String {
    match state.db_path.clone() {
        Some(path) => format!("SQLite ready: {}", path),
        None => "SQLite not initialized".to_string(),
    }
}

#[tauri::command]
async fn import_library(
    state: tauri::State<'_, AppState>,
    root_path: String,
) -> Result<Library, String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let scanned = scanner::scan_library(&root_path)?;
        let mut conn = database::open_connection(&db_path)
            .map_err(|err| format!("Failed to open database connection: {}", err))?;

        repository::save_scanned_library(&mut conn, &scanned)
    })
    .await
    .map_err(|err| format!("Import task failed: {}", err))?
}

#[tauri::command]
async fn load_imported_libraries(state: tauri::State<'_, AppState>) -> Result<Vec<Library>, String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = database::open_connection(&db_path)
            .map_err(|err| format!("Failed to open database connection: {}", err))?;

        repository::load_all_libraries(&mut conn)
    })
    .await
    .map_err(|err| format!("Load task failed: {}", err))?
}

#[tauri::command]
async fn rescan_library(
    state: tauri::State<'_, AppState>,
    library_id: String,
) -> Result<Library, String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = database::open_connection(&db_path)
            .map_err(|err| format!("Failed to open database connection: {}", err))?;

        repository::update_library_availability(&conn, &library_id)?;

        let root_path = repository::root_path_for_library(&conn, &library_id)?;
        let scanned = match scanner::scan_library(&root_path) {
            Ok(library) => library,
            Err(_err) => {
                repository::update_library_availability(&conn, &library_id)?;
                return repository::load_library_by_id(&conn, &library_id);
            }
        };

        repository::save_scanned_library(&mut conn, &scanned)
    })
    .await
    .map_err(|err| format!("Rescan task failed: {}", err))?
}

#[tauri::command]
fn set_lesson_played(
    state: tauri::State<'_, AppState>,
    lesson_id: String,
    played: bool,
) -> Result<(), String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    let conn = database::open_connection(&db_path)
        .map_err(|err| format!("Failed to open database connection: {}", err))?;

    repository::set_lesson_played(&conn, &lesson_id, played)
}

#[tauri::command]
fn set_lesson_playback_position(
    state: tauri::State<'_, AppState>,
    lesson_id: String,
    playback_position_seconds: Option<f64>,
) -> Result<(), String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    let conn = database::open_connection(&db_path)
        .map_err(|err| format!("Failed to open database connection: {}", err))?;

    repository::set_lesson_playback_position(&conn, &lesson_id, playback_position_seconds)
}

#[tauri::command]
fn set_last_opened_lesson(
    state: tauri::State<'_, AppState>,
    library_id: String,
    lesson_id: Option<String>,
) -> Result<(), String> {
    let db_path = state
        .db_path
        .clone()
        .ok_or_else(|| "Database is not initialized".to_string())?;

    let conn = database::open_connection(&db_path)
        .map_err(|err| format!("Failed to open database connection: {}", err))?;

    repository::set_last_opened_lesson(&conn, &library_id, lesson_id)
}

#[tauri::command]
async fn load_audio_data_url(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&file_path);
        if !path.exists() {
            return Err(format!("Audio file does not exist: {}", file_path));
        }

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let mime_type = match extension.as_str() {
            "mp3" => "audio/mpeg",
            "m4a" => "audio/mp4",
            "wav" => "audio/wav",
            "aac" => "audio/aac",
            "flac" => "audio/flac",
            "ogg" => "audio/ogg",
            _ => "application/octet-stream",
        };

        let bytes = std::fs::read(path)
            .map_err(|err| format!("Failed to read audio file {}: {}", file_path, err))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(format!("data:{};base64,{}", mime_type, encoded))
    })
    .await
    .map_err(|err| format!("Audio load task failed: {}", err))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let db_path = database::initialize(&app_data_dir)
                .map(|p| p.to_string_lossy().to_string())
                .ok();

            app.manage(AppState { db_path });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_status,
            import_library,
            load_imported_libraries,
            rescan_library,
            set_lesson_played,
            set_lesson_playback_position,
            set_last_opened_lesson,
            load_audio_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
