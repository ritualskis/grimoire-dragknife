use crate::types::{Point2D, Point3D};
use std::f64::consts::PI;

pub fn dist_2d(p1: &Point2D, p2: &Point2D) -> f64 {
    ((p2.x - p1.x).powi(2) + (p2.y - p1.y).powi(2)).sqrt()
}

pub fn dist_3d(p1: &Point3D, p2: &Point3D) -> f64 {
    ((p2.x - p1.x).powi(2) + (p2.y - p1.y).powi(2) + (p2.z - p1.z).powi(2)).sqrt()
}

pub fn vector_2d(from: &Point2D, to: &Point2D) -> (f64, f64) {
    (to.x - from.x, to.y - from.y)
}

pub fn normalize_2d(dx: f64, dy: f64) -> Option<(f64, f64)> {
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 {
        None
    } else {
        Some((dx / len, dy / len))
    }
}

/// Calculate the signed turning angle from vector `v1` to vector `v2`.
/// Returns angle in radians in range (-PI, PI].
/// Positive = Left / Counter-Clockwise turn (G3)
/// Negative = Right / Clockwise turn (G2)
pub fn turn_angle(v1: (f64, f64), v2: (f64, f64)) -> f64 {
    let cross = v1.0 * v2.1 - v1.1 * v2.0;
    let dot = v1.0 * v2.0 + v1.1 * v2.1;
    cross.atan2(dot)
}

pub fn rad_to_deg(rad: f64) -> f64 {
    rad * 180.0 / PI
}

pub fn deg_to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

pub fn offset_point(pt: &Point2D, dir: (f64, f64), dist: f64) -> Point2D {
    Point2D::new(pt.x + dir.0 * dist, pt.y + dir.1 * dist)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turn_angles() {
        let east = (1.0, 0.0);
        let north = (0.0, 1.0);
        let west = (-1.0, 0.0);
        let south = (0.0, -1.0);

        let angle_ccw = turn_angle(east, north);
        assert!((rad_to_deg(angle_ccw) - 90.0).abs() < 1e-6);

        let angle_cw = turn_angle(east, south);
        assert!((rad_to_deg(angle_cw) - (-90.0)).abs() < 1e-6);

        let angle_180 = turn_angle(east, west);
        assert!((rad_to_deg(angle_180).abs() - 180.0).abs() < 1e-6);
    }
}
