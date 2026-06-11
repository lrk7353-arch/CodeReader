mod change_detection;
mod code_service;
mod context_builder;
mod explanation_service;
mod persistence_service;
mod project_guidance;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            code_service::load_code_file,
            code_service::load_project_code_file,
            code_service::scan_project,
            context_builder::build_explanation_context,
            explanation_service::generate_explanation,
            explanation_service::get_model_config,
            explanation_service::reset_model_config,
            explanation_service::save_model_config,
            persistence_service::hydrate_code_file_persistence,
            persistence_service::initialize_persistence,
            persistence_service::save_explanation_feedback,
            persistence_service::save_reading_state,
            project_guidance::generate_project_guide,
            project_guidance::load_project_guide
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeReader");
}
