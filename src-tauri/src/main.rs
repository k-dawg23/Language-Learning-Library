mod database;
mod models;
mod scanner;

use models::Library;
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    db_path: Mutex<Option<String>>,
}

#[tauri::command]
fn get_db_status(state: tauri::State<'_, AppState>) -> String {
    match state.db_path.lock() {
        Ok(guard) => match guard.clone() {
            Some(path) => format!("SQLite ready: {}", path),
            None => "SQLite not initialized".to_string(),
        },
        Err(_) => "SQLite state lock failed".to_string(),
    }
}

#[tauri::command]
fn scan_library(root_path: String) -> Result<Library, String> {
    scanner::scan_library(&root_path)
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

            app.manage(AppState {
                db_path: Mutex::new(db_path),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_db_status, scan_library])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
