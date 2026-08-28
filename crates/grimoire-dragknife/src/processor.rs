use crate::geometry::{deg_to_rad, normalize_2d, offset_point, rad_to_deg, turn_angle, vector_2d};
use crate::parser::ParsedProgram;
use crate::types::{
    Contour, DragKnifeConfig, DragKnifeResult, HUDStats, Point2D, Point3D, SwivelArcInfo, Unit,
};

pub fn process_dragknife_program(
    program: &ParsedProgram,
    config: &DragKnifeConfig,
    hud_stats: HUDStats,
) -> DragKnifeResult {
    if program.is_already_processed || !program.parsed_swivels.is_empty() {
        return DragKnifeResult {
            processed_gcode: program.lines.iter().map(|l| l.raw.as_str()).collect::<Vec<_>>().join("\n"),
            hud_stats,
            original_contours: program.contours.clone(),
            processed_contours: program.contours.clone(),
            swivel_arcs: program.parsed_swivels.clone(),
            is_already_processed: Some(true),
            detection_reason: program.detection_reason.clone(),
            restored_raw_gcode: program.restored_raw_gcode.clone(),
        };
    }

    let mut out_gcode = String::new();
    let mut processed_contours = Vec::new();
    let mut swivel_arcs = Vec::new();

    let offset = config.blade_offset;
    let tol_rad = deg_to_rad(config.tolerance_angle_deg);
    let is_metric = match config.unit_override.unwrap_or(program.detected_unit) {
        Unit::Millimeters => true,
        Unit::Inches => false,
    };

    let z_safe = program.z_clearance.unwrap_or(if is_metric { 5.0 } else { 0.2 });
    let z_cut_default = program.z_cut.unwrap_or(if is_metric { -1.5 } else { -0.06 });

    out_gcode.push_str("; ==============================================================================\n");
    out_gcode.push_str("; Grimoire DragKnife Post-Processor (Ritual Skis)\n");
    out_gcode.push_str(&format!("; Blade Offset: {:.4} {}\n", offset, if is_metric { "mm" } else { "in" }));
    out_gcode.push_str(&format!("; Corner Swivel Tolerance: {:.1} deg\n", config.tolerance_angle_deg));
    if let Some(lift) = config.swivel_lift_height {
        out_gcode.push_str(&format!("; Swivel Z-Lift Height: {:.4}\n", lift));
    } else {
        out_gcode.push_str("; Swivel Z-Lift: Disabled\n");
    }
    out_gcode.push_str("; Safety: Spindle Disabled (Drag Knife Collet Protection)\n");
    out_gcode.push_str("; ==============================================================================\n");

    if is_metric {
        out_gcode.push_str("G21 ; Millimeters\n");
    } else {
        out_gcode.push_str("G20 ; Inches\n");
    }
    out_gcode.push_str("G90 ; Absolute Coordinates\nG17 ; XY Plane\n");
    if config.disable_spindle {
        out_gcode.push_str("M5 ; Ensure Spindle Stopped\n");
    }

    out_gcode.push_str(&format!("G0 Z{:.4}\n\n", z_safe));

    for (contour_idx, contour) in program.contours.iter().enumerate() {
        if contour.vertices.len() < 2 {
            continue;
        }

        let raw_pts = &contour.vertices;
        let mut pts_2d: Vec<Point2D> = Vec::new();
        for p in raw_pts {
            let p2d = p.to_2d();
            if let Some(last) = pts_2d.last() {
                if ((p2d.x - last.x).powi(2) + (p2d.y - last.y).powi(2)).sqrt() > 1e-4 {
                    pts_2d.push(p2d);
                }
            } else {
                pts_2d.push(p2d);
            }
        }

        if pts_2d.len() < 2 {
            continue;
        }

        let cut_z = raw_pts.iter().map(|p| p.z).min_by(|a, b| a.partial_cmp(b).unwrap()).unwrap_or(z_cut_default);
        let feed = contour.feedrate.unwrap_or(if is_metric { 1000.0 } else { 40.0 });
        let swivel_feed = config.swivel_feed.unwrap_or(feed * 0.4);

        out_gcode.push_str(&format!("; --- Contour #{} (Length: {:.2} {}, Points: {}) ---\n",
            contour_idx + 1, contour.length, if is_metric { "mm" } else { "in" }, pts_2d.len()));

        let mut machine_path: Vec<Point3D> = Vec::new();

        let (v0_x, v0_y) = vector_2d(&pts_2d[0], &pts_2d[1]);
        let u0 = normalize_2d(v0_x, v0_y).unwrap_or((1.0, 0.0));

        let start_spindle = offset_point(&pts_2d[0], u0, offset);

        out_gcode.push_str(&format!("G0 X{:.4} Y{:.4}\n", start_spindle.x, start_spindle.y));
        machine_path.push(Point3D::new(start_spindle.x, start_spindle.y, z_safe));

        out_gcode.push_str(&format!("G1 Z{:.4} F{:.1}\n", cut_z, feed * 0.5));
        machine_path.push(Point3D::new(start_spindle.x, start_spindle.y, cut_z));

        let n = pts_2d.len();
        for i in 0..n - 1 {
            let p_curr = pts_2d[i];
            let p_next = pts_2d[i + 1];

            let (v_x, v_y) = vector_2d(&p_curr, &p_next);
            let u_curr = normalize_2d(v_x, v_y).unwrap_or((1.0, 0.0));

            let spindle_target = offset_point(&p_next, u_curr, offset);

            out_gcode.push_str(&format!("G1 X{:.4} Y{:.4} F{:.1}\n", spindle_target.x, spindle_target.y, feed));
            machine_path.push(Point3D::new(spindle_target.x, spindle_target.y, cut_z));

            let p_future_opt = if i + 2 < n {
                Some(pts_2d[i + 2])
            } else if contour.is_closed && pts_2d.len() >= 4 {
                Some(pts_2d[1])
            } else {
                None
            };

            if let Some(p_future) = p_future_opt {
                let (vf_x, vf_y) = vector_2d(&p_next, &p_future);
                if let Some(u_next) = normalize_2d(vf_x, vf_y) {
                    let d_theta = turn_angle(u_curr, u_next);
                    let angle_deg = rad_to_deg(d_theta);

                    if d_theta.abs() > tol_rad {
                        let swivel_start = spindle_target;
                        let swivel_end = offset_point(&p_next, u_next, offset);
                        let center_offset_i = -offset * u_curr.0;
                        let center_offset_j = -offset * u_curr.1;

                        let is_ccw = d_theta > 0.0;
                        let g_code = if is_ccw { "G3" } else { "G2" };

                        if let Some(lift_z) = config.swivel_lift_height {
                            out_gcode.push_str(&format!("G1 Z{:.4} F{:.1} ; Swivel Lift\n", lift_z, feed * 0.5));
                        }

                        out_gcode.push_str(&format!(
                            "{} X{:.4} Y{:.4} I{:.4} J{:.4} F{:.1} ; Swivel {:.1}° {}\n",
                            g_code,
                            swivel_end.x,
                            swivel_end.y,
                            center_offset_i,
                            center_offset_j,
                            swivel_feed,
                            angle_deg.abs(),
                            if is_ccw { "CCW" } else { "CW" }
                        ));

                        machine_path.push(Point3D::new(swivel_end.x, swivel_end.y, cut_z));

                        swivel_arcs.push(SwivelArcInfo {
                            center: p_next,
                            start: swivel_start,
                            end: swivel_end,
                            angle_deg: angle_deg.abs(),
                            direction: if is_ccw { "CCW".to_string() } else { "CW".to_string() },
                            radius: offset,
                        });

                        if config.swivel_lift_height.is_some() {
                            out_gcode.push_str(&format!("G1 Z{:.4} F{:.1}\n", cut_z, feed * 0.5));
                        }
                    }
                }
            }
        }

        if contour.is_closed {
            let overcut_dist = offset * 1.5;
            let overcut_end = offset_point(&pts_2d[0], u0, overcut_dist + offset);
            out_gcode.push_str(&format!("; Perimeter overcut to sever loop\nG1 X{:.4} Y{:.4} F{:.1}\n", overcut_end.x, overcut_end.y, feed));
            machine_path.push(Point3D::new(overcut_end.x, overcut_end.y, cut_z));
        }

        out_gcode.push_str(&format!("G0 Z{:.4}\n\n", z_safe));
        if let Some(last) = machine_path.last() {
            machine_path.push(Point3D::new(last.x, last.y, z_safe));
        }

        let is_closed = contour.is_closed;
        let mut length = 0.0;
        for i in 0..machine_path.len().saturating_sub(1) {
            length += ((machine_path[i + 1].x - machine_path[i].x).powi(2)
                + (machine_path[i + 1].y - machine_path[i].y).powi(2)
                + (machine_path[i + 1].z - machine_path[i].z).powi(2))
            .sqrt();
        }

        processed_contours.push(Contour {
            id: contour_idx + 1,
            is_closed,
            vertices: machine_path,
            feedrate: Some(feed),
            length,
        });
    }

    out_gcode.push_str("; Program Finish\nM30\n");

    DragKnifeResult {
        processed_gcode: out_gcode,
        hud_stats,
        original_contours: program.contours.clone(),
        processed_contours,
        swivel_arcs,
        is_already_processed: Some(false),
        detection_reason: None,
        restored_raw_gcode: None,
    }
}
