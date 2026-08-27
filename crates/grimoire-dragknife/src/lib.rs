pub mod analyzer;
pub mod emitter;
pub mod geometry;
pub mod parser;
pub mod processor;
pub mod types;

pub use analyzer::analyze_program;
pub use parser::parse_gcode;
pub use processor::process_dragknife_program;
pub use types::{
    BoundingBox, Contour, DragKnifeConfig, DragKnifeResult, HUDStats, MotionMode, Point2D,
    Point3D, StepdownInfo, SwivelArcInfo, Unit,
};

pub fn parse_and_analyze(gcode: &str, config: Option<&DragKnifeConfig>) -> Result<HUDStats, String> {
    let program = parse_gcode(gcode);
    let default_cfg = DragKnifeConfig::default();
    let cfg = config.unwrap_or(&default_cfg);
    Ok(analyze_program(&program, cfg))
}

pub fn process_dragknife(gcode: &str, config: &DragKnifeConfig) -> Result<DragKnifeResult, String> {
    let program = parse_gcode(gcode);
    let hud_stats = analyze_program(&program, config);
    Ok(process_dragknife_program(&program, config, hud_stats))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_right_angle() {
        let gcode = r#"
; Simple 90-Degree Right Angle
G21 ; Millimeters
G90 ; Absolute
G0 Z5.0000
G0 X0.0000 Y0.0000
G1 Z-1.5000 F600
G1 X50.0000 Y0.0000 F1000
G1 X50.0000 Y50.0000 F1000
G0 Z5.0000
M30
"#;

        let config = DragKnifeConfig {
            blade_offset: 1.6,
            tolerance_angle_deg: 20.0,
            swivel_lift_height: None,
            swivel_feed: Some(400.0),
            disable_spindle: true,
            unit_override: Some(Unit::Millimeters),
        };

        let result = process_dragknife(gcode, &config).expect("Failed to process drag knife");

        assert_eq!(result.hud_stats.corner_count, 1);
        assert_eq!(result.swivel_arcs.len(), 1);
        let arc = &result.swivel_arcs[0];
        assert_eq!(arc.direction, "CCW");
        assert!((arc.angle_deg - 90.0).abs() < 1e-2);
        assert!((arc.center.x - 50.0).abs() < 1e-2);
        assert!((arc.center.y - 0.0).abs() < 1e-2);

        assert!(result.processed_gcode.contains("G3 X50.0000 Y1.6000"));
    }

    #[test]
    fn test_smooth_curve_sub_threshold() {
        let gcode = r#"
G21
G90
G0 X0 Y0
G1 Z-1.0 F500
G1 X10.0 Y0.5 F1000
G1 X20.0 Y1.2 F1000
G1 X30.0 Y2.0 F1000
G0 Z5.0
"#;

        let config = DragKnifeConfig {
            blade_offset: 1.588,
            tolerance_angle_deg: 20.0,
            ..Default::default()
        };

        let result = process_dragknife(gcode, &config).unwrap();
        assert_eq!(result.swivel_arcs.len(), 0);
        assert_eq!(result.hud_stats.corner_count, 0);
    }
}
