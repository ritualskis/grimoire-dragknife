use grimoire_dragknife::{
    parse_and_analyze, process_dragknife, DragKnifeConfig, Unit,
};

#[test]
fn test_multi_pass_stepdown_telemetry() {
    // 3-pass multi-depth cutout: Z-0.5, Z-1.0, Z-1.5 with travel Z38.1 and safe Z5.0
    let gcode = r#"
G21
G90
G0 Z38.100 ; Travel height
G0 X0 Y0
G0 Z5.080 ; Safe approach height

; Pass 1
G1 Z-0.500 F500 ; Stepdown 1 (0.5mm)
G1 X50.0 Y0.0 F1500
G1 X50.0 Y50.0 F1500
G0 Z5.080

; Pass 2
G0 X0 Y0
G1 Z-1.000 F500 ; Stepdown 2 (0.5mm)
G1 X50.0 Y0.0 F1500
G1 X50.0 Y50.0 F1500
G0 Z5.080

; Pass 3
G0 X0 Y0
G1 Z-1.500 F500 ; Stepdown 3 (0.5mm)
G1 X50.0 Y0.0 F1500
G1 X50.0 Y50.0 F1500
G0 Z38.100
M30
"#;

    let stats = parse_and_analyze(gcode, None).expect("Analyzed multi-pass");

    assert_eq!(stats.travel_height, Some(38.1));
    assert_eq!(stats.safe_height, Some(5.08));
    assert_eq!(stats.plunge_depth, Some(-1.5));
    assert_eq!(stats.depth_pass_count, 3);
    assert_eq!(stats.cycle_count, 3);
    assert_eq!(stats.stepdowns.len(), 3);

    // Pass 1: -0.5 (delta 0.5)
    assert_eq!(stats.stepdowns[0].pass_number, 1);
    assert_eq!(stats.stepdowns[0].z_level, -0.5);
    assert!((stats.stepdowns[0].stepdown_delta - 0.5).abs() < 1e-4);

    // Pass 2: -1.0 (delta 0.5)
    assert_eq!(stats.stepdowns[1].pass_number, 2);
    assert_eq!(stats.stepdowns[1].z_level, -1.0);
    assert!((stats.stepdowns[1].stepdown_delta - 0.5).abs() < 1e-4);

    // Pass 3: -1.5 (delta 0.5)
    assert_eq!(stats.stepdowns[2].pass_number, 3);
    assert_eq!(stats.stepdowns[2].z_level, -1.5);
    assert!((stats.stepdowns[2].stepdown_delta - 0.5).abs() < 1e-4);

    assert_eq!(stats.plunge_feedrate, Some(500.0));
    assert_eq!(stats.cut_feedrate, Some(1500.0));
}

#[test]
fn test_hairpin_180_turn() {
    let gcode = r#"
G21
G90
G0 X0.0 Y0.0
G1 Z-1.0 F500
G1 X100.0 Y0.0 F1000
G1 X0.0 Y0.0 F1000
G0 Z5.0
M30
"#;

    let config = DragKnifeConfig {
        blade_offset: 1.588,
        tolerance_angle_deg: 20.0,
        ..Default::default()
    };

    let res = process_dragknife(gcode, &config).expect("Processed hairpin");
    assert_eq!(res.hud_stats.corner_count, 1);
    assert_eq!(res.swivel_arcs.len(), 1);
    let arc = &res.swivel_arcs[0];
    assert!((arc.angle_deg - 180.0).abs() < 1e-2);
    assert_eq!(arc.center.x, 100.0);
    assert_eq!(arc.center.y, 0.0);
}

#[test]
fn test_closed_rectangle_box() {
    let gcode = r#"
G21
G90
G0 X0 Y0
G1 Z-2.0 F600
G1 X50 Y0 F1200
G1 X50 Y40 F1200
G1 X0 Y40 F1200
G1 X0 Y0 F1200
G0 Z5.0
M30
"#;

    let config = DragKnifeConfig {
        blade_offset: 1.588,
        tolerance_angle_deg: 20.0,
        ..Default::default()
    };

    let res = process_dragknife(gcode, &config).expect("Processed closed box");
    assert_eq!(res.hud_stats.corner_count, 4);
    assert_eq!(res.swivel_arcs.len(), 4);
    for arc in &res.swivel_arcs {
        assert_eq!(arc.direction, "CCW");
        assert!((arc.angle_deg - 90.0).abs() < 1e-2);
    }
}

#[test]
fn test_swivel_lift_z() {
    let gcode = r#"
G21
G90
G0 X0 Y0
G1 Z-2.0 F600
G1 X50 Y0 F1000
G1 X50 Y50 F1000
G0 Z5.0
M30
"#;

    let config = DragKnifeConfig {
        blade_offset: 1.6,
        tolerance_angle_deg: 20.0,
        swivel_lift_height: Some(0.5),
        ..Default::default()
    };

    let res = process_dragknife(gcode, &config).expect("Processed with lift");
    assert!(res.processed_gcode.contains("G1 Z0.5000"));
    assert!(res.processed_gcode.contains("; Swivel Lift"));
}

#[test]
fn test_spindle_safety_strip() {
    let gcode = r#"
G20
S18000 M3
G0 X0 Y0
G1 Z-0.05 F20
G1 X2.0 Y0 F60
M5
"#;

    let config = DragKnifeConfig {
        blade_offset: 0.0625,
        tolerance_angle_deg: 20.0,
        disable_spindle: true,
        unit_override: Some(Unit::Inches),
        ..Default::default()
    };

    let res = process_dragknife(gcode, &config).expect("Processed with spindle strip");
    assert!(!res.processed_gcode.lines().any(|line| {
        let trimmed = line.trim();
        trimmed.starts_with("M3 ") || trimmed.starts_with("M03") || trimmed == "M3" || trimmed.contains("S18000")
    }));
    assert!(res.processed_gcode.contains("M5"));
}

#[test]
fn test_hud_analysis_dimensions() {
    let gcode = r#"
G21
G90
G0 X-10.0 Y-20.0 Z5.0
G1 Z-1.5 F500
G1 X40.0 Y-20.0 F1000
G1 X40.0 Y30.0 F1000
G0 Z5.0
M30
"#;

    let stats = parse_and_analyze(gcode, None).expect("HUD analyzed");
    assert_eq!(stats.total_lines, 9);
    assert_eq!(stats.bounds.min_x, -10.0);
    assert_eq!(stats.bounds.max_x, 40.0);
    assert_eq!(stats.bounds.width, 50.0);
    assert_eq!(stats.bounds.min_y, -20.0);
    assert_eq!(stats.bounds.max_y, 30.0);
    assert_eq!(stats.bounds.height, 50.0);
    assert_eq!(stats.safe_height, Some(5.0));
    assert_eq!(stats.plunge_depth, Some(-1.5));
}
