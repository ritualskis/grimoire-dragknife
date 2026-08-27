use crate::geometry::{deg_to_rad, dist_3d, normalize_2d, turn_angle, vector_2d};
use crate::parser::ParsedProgram;
use crate::types::{BoundingBox, DragKnifeConfig, HUDStats, Unit};

pub fn analyze_program(program: &ParsedProgram, config: &DragKnifeConfig) -> HUDStats {
    let total_lines = program.lines.len();
    let unit_str = match config.unit_override.unwrap_or(program.detected_unit) {
        Unit::Millimeters => "G21 (Metric - mm)".to_string(),
        Unit::Inches => "G20 (Imperial - in)".to_string(),
    };

    let mut bounds = BoundingBox::default();
    if !program.all_points.is_empty() {
        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        let mut min_z = f64::INFINITY;
        let mut max_z = f64::NEG_INFINITY;

        for pt in &program.all_points {
            min_x = min_x.min(pt.x);
            max_x = max_x.max(pt.x);
            min_y = min_y.min(pt.y);
            max_y = max_y.max(pt.y);
            min_z = min_z.min(pt.z);
            max_z = max_z.max(pt.z);
        }

        bounds = BoundingBox {
            min_x,
            max_x,
            min_y,
            max_y,
            min_z,
            max_z,
            width: if max_x >= min_x { max_x - min_x } else { 0.0 },
            height: if max_y >= min_y { max_y - min_y } else { 0.0 },
            depth: if max_z >= min_z { max_z - min_z } else { 0.0 },
        };
    }

    let mut total_cut_distance = 0.0;
    let mut closed_count = 0;
    let mut open_count = 0;
    let mut corner_count = 0;

    let tol_rad = deg_to_rad(config.tolerance_angle_deg);

    for c in &program.contours {
        total_cut_distance += c.length;
        if c.is_closed {
            closed_count += 1;
        } else {
            open_count += 1;
        }

        if c.vertices.len() >= 3 {
            let pts = &c.vertices;
            for i in 1..pts.len() - 1 {
                let p_prev = pts[i - 1].to_2d();
                let p_curr = pts[i].to_2d();
                let p_next = pts[i + 1].to_2d();

                let (v1_x, v1_y) = vector_2d(&p_prev, &p_curr);
                let (v2_x, v2_y) = vector_2d(&p_curr, &p_next);

                if let (Some(u1), Some(u2)) = (normalize_2d(v1_x, v1_y), normalize_2d(v2_x, v2_y)) {
                    let angle = turn_angle(u1, u2).abs();
                    if angle > tol_rad {
                        corner_count += 1;
                    }
                }
            }
        }
    }

    let mut total_rapid_distance = 0.0;
    for i in 0..program.rapid_points.len().saturating_sub(1) {
        total_rapid_distance += dist_3d(&program.rapid_points[i], &program.rapid_points[i + 1]);
    }

    let avg_cut_feed = program.feedrates.first().copied().unwrap_or(match program.detected_unit {
        Unit::Millimeters => 1000.0,
        Unit::Inches => 40.0,
    });
    let rapid_feed = match program.detected_unit {
        Unit::Millimeters => 3000.0,
        Unit::Inches => 120.0,
    };

    let cut_time_min = total_cut_distance / avg_cut_feed.max(1.0);
    let rapid_time_min = total_rapid_distance / rapid_feed;
    let estimated_cycle_time_seconds = (cut_time_min + rapid_time_min) * 60.0;

    HUDStats {
        unit: unit_str,
        total_lines,
        bounds,
        total_cut_distance,
        total_rapid_distance,
        estimated_cycle_time_seconds,
        contour_count: program.contours.len(),
        closed_contour_count: closed_count,
        open_contour_count: open_count,
        corner_count,
        swivel_arc_count: corner_count,
        z_clearance: program.z_clearance,
        z_cut: program.z_cut,
        feedrates: program.feedrates.clone(),
        spindle_commands: program.spindle_commands.clone(),
    }
}
