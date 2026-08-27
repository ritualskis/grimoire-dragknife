pub mod commands;

use commands::{analyze_gcode, greet, process_dragknife_gcode};

pub fn configure_linux_webkit_env() {
    #[cfg(target_os = "linux")]
    {
        const LINUX_RENDER_FALLBACKS: &[(&str, &str)] = &[
            ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
            ("WEBKIT_DISABLE_COMPOSITING_MODE", "1"),
        ];

        for &(key, val) in LINUX_RENDER_FALLBACKS {
            if std::env::var(key).is_err() {
                std::env::set_var(key, val);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_webkit_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            analyze_gcode,
            process_dragknife_gcode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
