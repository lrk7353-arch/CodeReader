mod code_service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            code_service::load_code_file,
            code_service::scan_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeReader");
}
