use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Unit {
    #[serde(rename = "mm")]
    Millimeters,
    #[serde(rename = "in")]
    Inches,
}

impl Default for Unit {
    fn default() -> Self {
        Unit::Millimeters
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MotionMode {
    Rapid,   // G0
    Linear,  // G1
    ArcCw,   // G2
    ArcCcw,  // G3
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
}

impl Point2D {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Point3D {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn to_2d(&self) -> Point2D {
        Point2D::new(self.x, self.y)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BoundingBox {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub width: f64,
    pub height: f64,
    pub depth: f64,
}

impl Default for BoundingBox {
    fn default() -> Self {
        Self {
            min_x: 0.0,
            max_x: 0.0,
            min_y: 0.0,
            max_y: 0.0,
            min_z: 0.0,
            max_z: 0.0,
            width: 0.0,
            height: 0.0,
            depth: 0.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StepdownInfo {
    pub pass_number: usize,
    pub z_level: f64,
    pub stepdown_delta: f64,
    pub feedrate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DragKnifeConfig {
    /// Blade offset distance (spindle center to blade tip) in active units (e.g. 1.588 mm / 0.0625 in)
    pub blade_offset: f64,
    /// Minimum corner deflection angle (degrees) to trigger a swivel arc (default: 20.0°)
    pub tolerance_angle_deg: f64,
    /// Optional swivel lift height (Z) to lift blade slightly during corner pivot
    pub swivel_lift_height: Option<f64>,
    /// Optional feedrate override for swivel pivot arcs
    pub swivel_feed: Option<f64>,
    /// Whether to disable/strip M3/M4 spindle start commands for drag knife safety
    pub disable_spindle: bool,
    /// Explicit unit override (if None, auto-detected from G20/G21)
    pub unit_override: Option<Unit>,
}

impl Default for DragKnifeConfig {
    fn default() -> Self {
        Self {
            blade_offset: 1.588,
            tolerance_angle_deg: 20.0,
            swivel_lift_height: None,
            swivel_feed: None,
            disable_spindle: true,
            unit_override: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HUDStats {
    pub unit: String,
    pub total_lines: usize,
    pub bounds: BoundingBox,
    pub total_cut_distance: f64,
    pub total_rapid_distance: f64,
    pub estimated_cycle_time_seconds: f64,
    pub contour_count: usize,
    pub closed_contour_count: usize,
    pub open_contour_count: usize,
    pub corner_count: usize,
    pub swivel_arc_count: usize,
    /// Number of cutting cycles (plunge-to-retract cycles)
    pub cycle_count: usize,
    /// Number of discrete cutting depth levels
    pub depth_pass_count: usize,
    /// Detailed stepdown passes list with each Z level and delta
    pub stepdowns: Vec<StepdownInfo>,
    /// High rapid travel height across machine bed (e.g. G0 Z38.10)
    pub travel_height: Option<f64>,
    /// Safe approach clearance height (e.g. G0 Z5.0)
    pub safe_height: Option<f64>,
    /// Maximum / deepest cut depth (e.g. Z -1.5)
    pub plunge_depth: Option<f64>,
    /// Maximum stepdown drop between consecutive passes
    pub max_stepdown: Option<f64>,
    /// Primary plunge feedrate (feed during downward Z motion)
    pub plunge_feedrate: Option<f64>,
    /// Primary XY cutting feedrate
    pub cut_feedrate: Option<f64>,
    pub feedrates: Vec<f64>,
    pub spindle_commands: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SwivelArcInfo {
    pub center: Point2D,
    pub start: Point2D,
    pub end: Point2D,
    pub angle_deg: f64,
    pub direction: String, // "CW" or "CCW"
    pub radius: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Contour {
    pub id: usize,
    pub is_closed: bool,
    pub vertices: Vec<Point3D>,
    pub feedrate: Option<f64>,
    pub length: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DragKnifeResult {
    pub processed_gcode: String,
    pub hud_stats: HUDStats,
    pub original_contours: Vec<Contour>,
    pub processed_contours: Vec<Contour>,
    pub swivel_arcs: Vec<SwivelArcInfo>,
}
