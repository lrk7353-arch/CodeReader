mod app_error;
mod change_detection;
mod code_service;
mod context_builder;
mod explanation_service;
mod file_authority;
mod llm_provider;
mod persistence_service;
mod project_guidance;
mod update_check;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            code_service::register_file_grant,
            code_service::register_directory_grant,
            code_service::load_granted_file,
            code_service::load_granted_project_file,
            code_service::rescan_granted_project,
            code_service::expand_granted_directory,
            context_builder::build_granted_explanation_context,
            explanation_service::generate_explanation,
            explanation_service::cancel_generation,
            explanation_service::get_model_config,
            explanation_service::reset_model_config,
            explanation_service::save_model_config,
            explanation_service::test_model_connection,
            persistence_service::hydrate_code_file_persistence,
            persistence_service::initialize_persistence,
            persistence_service::list_prompt_versions,
            persistence_service::rollback_prompt_version,
            persistence_service::save_explanation_feedback,
            persistence_service::save_reading_state,
            persistence_service::upsert_prompt_version,
            update_check::check_for_updates,
            project_guidance::generate_project_guide,
            project_guidance::load_project_guide
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeReader");
}
