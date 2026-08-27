use grimoire_dragknife::{
    parse_and_analyze as core_parse_and_analyze,
    process_dragknife as core_process_dragknife,
    DragKnifeConfig, DragKnifeResult, HUDStats,
};

#[tauri::command]
pub fn analyze_gcode(gcode: String, config: Option<DragKnifeConfig>) -> Result<HUDStats, String> {
    core_parse_and_analyze(&gcode, config.as_ref())
}

#[tauri::command]
pub fn process_dragknife_gcode(
    gcode: String,
    config: DragKnifeConfig,
) -> Result<DragKnifeResult, String> {
    core_process_dragknife(&gcode, &config)
}

#[tauri::command]
pub fn greet(name: String) -> String {
    format!("Grimoire DragKnife /// Welcome, {}!", name)
}
