export type Unit = "mm" | "in";

export type SheetDatumPosition =
  | "bottom-left"
  | "top-left"
  | "center"
  | "bottom-right"
  | "top-right";

export type ZZeroPosition = "surface" | "bed";

export interface SheetConfig {
  width: number;
  height: number;
  thickness: number;
  originX: number;
  originY: number;
  datumPosition: SheetDatumPosition;
  zZero: ZZeroPosition;
  clearanceGap: number;
  plungeGap: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  visible?: boolean;
}

export type MotionMode = "Rapid" | "Linear" | "ArcCw" | "ArcCcw" | "Other";

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_z: number;
  max_z: number;
  width: number;
  height: number;
  depth: number;
}

export interface StepdownInfo {
  pass_number: number;
  z_level: number;
  stepdown_delta: number;
  feedrate: number | null;
}

export interface DragKnifeConfig {
  blade_offset: number;
  tolerance_angle_deg: number;
  swivel_lift_height: number | null;
  swivel_feed: number | null;
  disable_spindle: boolean;
  unit_override: Unit | null;
}

export interface HUDStats {
  unit: string;
  total_lines: number;
  bounds: BoundingBox;
  total_cut_distance: number;
  total_rapid_distance: number;
  estimated_cycle_time_seconds: number;
  contour_count: number;
  closed_contour_count: number;
  open_contour_count: number;
  corner_count: number;
  swivel_arc_count: number;
  cycle_count: number;
  depth_pass_count: number;
  stepdowns: StepdownInfo[];
  travel_height: number | null;
  safe_height: number | null;
  plunge_depth: number | null;
  max_stepdown: number | null;
  plunge_feedrate: number | null;
  cut_feedrate: number | null;
  feedrates: number[];
  spindle_commands: string[];
}

export interface SwivelArcInfo {
  center: Point2D;
  start: Point2D;
  end: Point2D;
  angle_deg: number;
  direction: "CW" | "CCW" | string;
  radius: number;
}

export interface Contour {
  id: number;
  is_closed: boolean;
  vertices: Point3D[];
  feedrate: number | null;
  length: number;
}

export interface DragKnifeResult {
  processed_gcode: string;
  hud_stats: HUDStats;
  original_contours: Contour[];
  processed_contours: Contour[];
  swivel_arcs: SwivelArcInfo[];
}

export interface DragKnifePreset {
  id: string;
  name: string;
  blade_offset_mm: number;
  blade_offset_in: number;
  tolerance_angle_deg: number;
  description: string;
}

export const DRAG_KNIFE_PRESETS: DragKnifePreset[] = [
  {
    id: "donek-d2",
    name: "Donek D2 (1/16\")",
    blade_offset_mm: 1.588,
    blade_offset_in: 0.0625,
    tolerance_angle_deg: 20.0,
    description: "Standard Donek D2 drag knife (0.060\" - 0.065\" offset)",
  },
  {
    id: "donek-d4",
    name: "Donek D4 (1/8\")",
    blade_offset_mm: 3.175,
    blade_offset_in: 0.125,
    tolerance_angle_deg: 20.0,
    description: "Heavy-duty thick material Donek D4 knife (1/8\" offset)",
  },
  {
    id: "roland-vinyl",
    name: "Roland / Vinyl Plotter",
    blade_offset_mm: 0.25,
    blade_offset_in: 0.0098,
    tolerance_angle_deg: 15.0,
    description: "Precision fine-tip vinyl cutting blade (0.25mm offset)",
  },
  {
    id: "utility-blade",
    name: "DIY Utility / Box Cutter",
    blade_offset_mm: 2.5,
    blade_offset_in: 0.0984,
    tolerance_angle_deg: 25.0,
    description: "Standard trapezoid utility blade attachment (2.5mm offset)",
  },
];
