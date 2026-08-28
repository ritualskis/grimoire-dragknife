use crate::geometry::dist_3d;
use crate::types::{Contour, MotionMode, Point3D, Unit};

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedLine {
    pub raw: String,
    pub line_number: usize,
    pub motion: Option<MotionMode>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
    pub i: Option<f64>,
    pub j: Option<f64>,
    pub f: Option<f64>,
    pub s: Option<f64>,
    pub m_codes: Vec<u32>,
    pub comment: Option<String>,
    pub is_unit_g20: bool,
    pub is_unit_g21: bool,
    pub is_spindle_on: bool,
    pub is_spindle_off: bool,
}

#[derive(Debug, Clone)]
pub struct ParsedProgram {
    pub lines: Vec<ParsedLine>,
    pub detected_unit: Unit,
    pub contours: Vec<Contour>,
    pub rapid_points: Vec<Point3D>,
    pub all_points: Vec<Point3D>,
    pub rapid_z_levels: Vec<f64>,
    pub cut_z_levels: Vec<f64>,
    pub feedrates: Vec<f64>,
    pub plunge_feedrates: Vec<f64>,
    pub cut_feedrates: Vec<f64>,
    pub spindle_commands: Vec<String>,
    pub min_z: Option<f64>,
    pub max_z: Option<f64>,
    pub z_clearance: Option<f64>,
    pub z_cut: Option<f64>,
}

pub fn parse_gcode(content: &str) -> ParsedProgram {
    let mut lines = Vec::new();
    let mut current_pos = Point3D::new(0.0, 0.0, 0.0);
    let mut current_motion = MotionMode::Rapid;
    let mut detected_unit = Unit::Millimeters;
    let mut has_explicit_unit = false;
    let mut feedrates = Vec::new();
    let mut plunge_feedrates = Vec::new();
    let mut cut_feedrates = Vec::new();
    let mut spindle_commands = Vec::new();

    let mut min_z: Option<f64> = None;
    let mut max_z: Option<f64> = None;
    let mut z_clearance: Option<f64> = None;
    let mut z_cut: Option<f64> = None;
    let mut rapid_z_levels: Vec<f64> = Vec::new();
    let mut cut_z_levels: Vec<f64> = Vec::new();

    let mut current_contour: Option<Vec<Point3D>> = None;
    let mut current_contour_feed: Option<f64> = None;
    let mut contours: Vec<Contour> = Vec::new();
    let mut rapid_points = Vec::new();
    let mut all_points = Vec::new();

    for (idx, line_str) in content.lines().enumerate() {
        let (stripped, comment) = extract_comment(line_str);
        let tokens = tokenize_line(&stripped);

        let mut parsed = ParsedLine {
            raw: line_str.to_string(),
            line_number: idx + 1,
            motion: None,
            x: None,
            y: None,
            z: None,
            i: None,
            j: None,
            f: None,
            s: None,
            m_codes: Vec::new(),
            comment,
            is_unit_g20: false,
            is_unit_g21: false,
            is_spindle_on: false,
            is_spindle_off: false,
        };

        for (letter, val_str) in &tokens {
            let letter = letter.to_ascii_uppercase();
            match letter {
                'G' => {
                    if let Ok(g_num) = val_str.parse::<f64>() {
                        let g_int = g_num.round() as i32;
                        match g_int {
                            0 => {
                                parsed.motion = Some(MotionMode::Rapid);
                                current_motion = MotionMode::Rapid;
                            }
                            1 => {
                                parsed.motion = Some(MotionMode::Linear);
                                current_motion = MotionMode::Linear;
                            }
                            2 => {
                                parsed.motion = Some(MotionMode::ArcCw);
                                current_motion = MotionMode::ArcCw;
                            }
                            3 => {
                                parsed.motion = Some(MotionMode::ArcCcw);
                                current_motion = MotionMode::ArcCcw;
                            }
                            20 => {
                                parsed.is_unit_g20 = true;
                                detected_unit = Unit::Inches;
                                has_explicit_unit = true;
                            }
                            21 => {
                                parsed.is_unit_g21 = true;
                                detected_unit = Unit::Millimeters;
                                has_explicit_unit = true;
                            }
                            _ => {}
                        }
                    }
                }
                'M' => {
                    if let Ok(m_num) = val_str.parse::<u32>() {
                        parsed.m_codes.push(m_num);
                        match m_num {
                            3 | 4 => {
                                parsed.is_spindle_on = true;
                                spindle_commands.push(format!("M{}", m_num));
                            }
                            5 => {
                                parsed.is_spindle_off = true;
                                spindle_commands.push("M5".to_string());
                            }
                            _ => {}
                        }
                    }
                }
                'X' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.x = Some(v);
                    }
                }
                'Y' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.y = Some(v);
                    }
                }
                'Z' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.z = Some(v);
                    }
                }
                'I' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.i = Some(v);
                    }
                }
                'J' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.j = Some(v);
                    }
                }
                'F' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.f = Some(v);
                        if !feedrates.contains(&v) {
                            feedrates.push(v);
                        }
                    }
                }
                'S' => {
                    if let Ok(v) = val_str.parse::<f64>() {
                        parsed.s = Some(v);
                        spindle_commands.push(format!("S{:.0}", v));
                    }
                }
                _ => {}
            }
        }

        if parsed.motion.is_none()
            && (parsed.x.is_some() || parsed.y.is_some() || parsed.z.is_some())
        {
            parsed.motion = Some(current_motion);
        }

        let new_x = parsed.x.unwrap_or(current_pos.x);
        let new_y = parsed.y.unwrap_or(current_pos.y);
        let new_z = parsed.z.unwrap_or(current_pos.z);
        let target_pt = Point3D::new(new_x, new_y, new_z);

        if parsed.x.is_some() || parsed.y.is_some() || parsed.z.is_some() {
            all_points.push(target_pt);
        }

        if let Some(z_val) = parsed.z {
            min_z = Some(min_z.map_or(z_val, |m| m.min(z_val)));
            max_z = Some(max_z.map_or(z_val, |m| m.max(z_val)));

            match parsed.motion {
                Some(MotionMode::Rapid) => {
                    if !rapid_z_levels.iter().any(|&rz| (rz - z_val).abs() < 1e-4) {
                        rapid_z_levels.push(z_val);
                    }
                    if z_val > 0.0 {
                        z_clearance = Some(z_clearance.map_or(z_val, |m| m.min(z_val)));
                    }
                }
                Some(MotionMode::Linear) | Some(MotionMode::ArcCw) | Some(MotionMode::ArcCcw) => {
                    if z_val <= 0.0 || (parsed.x.is_some() || parsed.y.is_some()) {
                        if !cut_z_levels.iter().any(|&cz| (cz - z_val).abs() < 1e-4) {
                            cut_z_levels.push(z_val);
                        }
                    }
                    if z_val < 0.0 {
                        z_cut = Some(z_cut.map_or(z_val, |m| m.min(z_val)));
                    }
                }
                _ => {}
            }

            // Distinguish plunge feedrate vs XY cut feedrate
            if let Some(f_val) = parsed.f {
                if parsed.z.is_some() && z_val < current_pos.z && parsed.x.is_none() && parsed.y.is_none() {
                    if !plunge_feedrates.contains(&f_val) {
                        plunge_feedrates.push(f_val);
                    }
                } else if parsed.x.is_some() || parsed.y.is_some() {
                    if !cut_feedrates.contains(&f_val) {
                        cut_feedrates.push(f_val);
                    }
                }
            }
        }

        if let Some(feed) = parsed.f {
            current_contour_feed = Some(feed);
            if (parsed.x.is_some() || parsed.y.is_some()) && !cut_feedrates.contains(&feed) {
                cut_feedrates.push(feed);
            }
        }

        match parsed.motion {
            Some(MotionMode::Rapid) => {
                rapid_points.push(target_pt);
                if let Some(pts) = current_contour.take() {
                    if pts.len() >= 2 {
                        let is_closed = dist_3d(&pts[0], &pts[pts.len() - 1]) < 0.1;
                        let length = compute_path_length(&pts);
                        contours.push(Contour {
                            id: contours.len() + 1,
                            is_closed,
                            vertices: pts,
                            feedrate: current_contour_feed,
                            length,
                        });
                    }
                }
            }
            Some(MotionMode::Linear) | Some(MotionMode::ArcCw) | Some(MotionMode::ArcCcw) => {
                if parsed.z.is_some()
                    && parsed.z.unwrap() > 0.0
                    && parsed.x.is_none()
                    && parsed.y.is_none()
                {
                    if let Some(pts) = current_contour.take() {
                        if pts.len() >= 2 {
                            let is_closed = dist_3d(&pts[0], &pts[pts.len() - 1]) < 0.1;
                            let length = compute_path_length(&pts);
                            contours.push(Contour {
                                id: contours.len() + 1,
                                is_closed,
                                vertices: pts,
                                feedrate: current_contour_feed,
                                length,
                            });
                        }
                    }
                } else if parsed.motion == Some(MotionMode::ArcCw) || parsed.motion == Some(MotionMode::ArcCcw) {
                    let i_val = parsed.i.unwrap_or(0.0);
                    let j_val = parsed.j.unwrap_or(0.0);
                    let cx = current_pos.x + i_val;
                    let cy = current_pos.y + j_val;
                    let r = (i_val * i_val + j_val * j_val).sqrt();

                    if r > 1e-4 {
                        let is_cw = parsed.motion == Some(MotionMode::ArcCw);
                        let start_ang = (current_pos.y - cy).atan2(current_pos.x - cx);
                        let end_ang = (target_pt.y - cy).atan2(target_pt.x - cx);
                        let mut sweep = if is_cw { start_ang - end_ang } else { end_ang - start_ang };
                        while sweep < 0.0 { sweep += 2.0 * std::f64::consts::PI; }
                        while sweep > 2.0 * std::f64::consts::PI { sweep -= 2.0 * std::f64::consts::PI; }

                        let steps = (sweep / (std::f64::consts::PI / 16.0)).ceil().max(8.0) as usize;
                        let mut pts = current_contour.take().unwrap_or_else(|| vec![Point3D::new(current_pos.x, current_pos.y, current_pos.z)]);

                        for s in 1..=steps {
                            let frac = s as f64 / steps as f64;
                            let cur_ang = if is_cw { start_ang - sweep * frac } else { start_ang + sweep * frac };
                            let px = cx + r * cur_ang.cos();
                            let py = cy + r * cur_ang.sin();
                            let pz = current_pos.z + (target_pt.z - current_pos.z) * frac;
                            let pt = Point3D::new(px, py, pz);
                            pts.push(pt);
                            all_points.push(pt);
                        }
                        current_contour = Some(pts);
                    } else if parsed.x.is_some() || parsed.y.is_some() {
                        if let Some(ref mut pts) = current_contour {
                            pts.push(target_pt);
                        } else {
                            current_contour = Some(vec![Point3D::new(current_pos.x, current_pos.y, target_pt.z), target_pt]);
                        }
                        all_points.push(target_pt);
                    }
                } else if parsed.x.is_some() || parsed.y.is_some() {
                    if let Some(ref mut pts) = current_contour {
                        if let Some(last) = pts.last() {
                            if dist_3d(last, &target_pt) > 1e-6 {
                                pts.push(target_pt);
                            }
                        } else {
                            pts.push(target_pt);
                        }
                    } else {
                        let mut pts = Vec::new();
                        pts.push(Point3D::new(current_pos.x, current_pos.y, target_pt.z));
                        if dist_3d(&pts[0], &target_pt) > 1e-6 {
                            pts.push(target_pt);
                        }
                        current_contour = Some(pts);
                    }
                }
            }
            _ => {}
        }

        current_pos = target_pt;
        lines.push(parsed);
    }

    if let Some(pts) = current_contour.take() {
        if pts.len() >= 2 {
            let is_closed = dist_3d(&pts[0], &pts[pts.len() - 1]) < 0.1;
            let length = compute_path_length(&pts);
            contours.push(Contour {
                id: contours.len() + 1,
                is_closed,
                vertices: pts,
                feedrate: current_contour_feed,
                length,
            });
        }
    }

    if !has_explicit_unit {
        let max_x = all_points.iter().map(|p| p.x.abs()).fold(0.0, f64::max);
        let max_y = all_points.iter().map(|p| p.y.abs()).fold(0.0, f64::max);
        let max_f = feedrates.iter().copied().fold(0.0, f64::max);
        if max_x > 150.0 || max_y > 150.0 || max_f > 250.0 || min_z.map_or(false, |z| z < -25.0) {
            detected_unit = Unit::Millimeters;
        }
    }

    ParsedProgram {
        lines,
        detected_unit,
        contours,
        rapid_points,
        all_points,
        rapid_z_levels,
        cut_z_levels,
        feedrates,
        plunge_feedrates,
        cut_feedrates,
        spindle_commands,
        min_z,
        max_z,
        z_clearance,
        z_cut,
    }
}

fn compute_path_length(pts: &[Point3D]) -> f64 {
    let mut total = 0.0;
    for i in 0..pts.len().saturating_sub(1) {
        total += dist_3d(&pts[i], &pts[i + 1]);
    }
    total
}

fn extract_comment(line: &str) -> (String, Option<String>) {
    if let Some(pos) = line.find(';') {
        let code = line[..pos].trim().to_string();
        let comment = line[pos + 1..].trim().to_string();
        return (code, if comment.is_empty() { None } else { Some(comment) });
    }
    if let (Some(start), Some(end)) = (line.find('('), line.find(')')) {
        if start < end {
            let code = format!("{}{}", &line[..start], &line[end + 1..]).trim().to_string();
            let comment = line[start + 1..end].trim().to_string();
            return (code, if comment.is_empty() { None } else { Some(comment) });
        }
    }
    (line.trim().to_string(), None)
}

fn tokenize_line(line: &str) -> Vec<(char, String)> {
    let mut tokens = Vec::new();
    let mut current_letter: Option<char> = None;
    let mut current_val = String::new();

    for ch in line.chars() {
        if ch.is_whitespace() {
            continue;
        }
        if ch.is_ascii_alphabetic() {
            if let Some(l) = current_letter {
                tokens.push((l, current_val.clone()));
                current_val.clear();
            }
            current_letter = Some(ch);
        } else if current_letter.is_some() {
            current_val.push(ch);
        }
    }

    if let Some(l) = current_letter {
        tokens.push((l, current_val));
    }

    tokens
}
