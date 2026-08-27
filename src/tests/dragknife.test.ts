import { describe, expect, it } from "vitest";
import {
  parseGCode,
  analyzeProgram,
  executeClientDragKnife,
  turnAngle,
  radToDeg,
} from "../lib/dragknife-engine";
import type { DragKnifeConfig } from "../types/dragknife";

describe("Grimoire DragKnife Engine", () => {
  it("computes turning angles accurately", () => {
    const east: [number, number] = [1, 0];
    const north: [number, number] = [0, 1];
    const south: [number, number] = [0, -1];

    expect(radToDeg(turnAngle(east, north))).toBeCloseTo(90, 4);
    expect(radToDeg(turnAngle(east, south))).toBeCloseTo(-90, 4);
  });

  it("analyzes right-angle gcode file and generates HUD stats with Z telemetry", () => {
    const gcode = `
G21 ; Millimeters
G90 ; Absolute
G0 Z38.100 ; Travel Height
G0 X0.0000 Y0.0000
G0 Z5.0000 ; Safe Height
G1 Z-1.5000 F600 ; Plunge Cut Depth
G1 X50.0000 Y0.0000 F1000
G1 X50.0000 Y50.0000 F1000
G0 Z38.1000
M30
`;

    const config: DragKnifeConfig = {
      blade_offset: 1.6,
      tolerance_angle_deg: 20.0,
      swivel_lift_height: null,
      swivel_feed: 400,
      disable_spindle: true,
      unit_override: "mm",
    };

    const program = parseGCode(gcode);
    expect(program.contours.length).toBe(1);

    const stats = analyzeProgram(program, config);
    expect(stats.corner_count).toBe(1);
    expect(stats.bounds.width).toBe(50);
    expect(stats.bounds.height).toBe(50);
    expect(stats.total_cut_distance).toBe(100);

    // Z-Telemetry verifications
    expect(stats.travel_height).toBe(38.1);
    expect(stats.safe_height).toBe(5.0);
    expect(stats.plunge_depth).toBe(-1.5);
    expect(stats.cycle_count).toBe(1);
    expect(stats.depth_pass_count).toBe(1);
    expect(stats.stepdowns.length).toBe(1);
    expect(stats.stepdowns[0].z_level).toBe(-1.5);
    expect(stats.stepdowns[0].stepdown_delta).toBe(1.5);
  });

  it("extracts multiple stepdown passes and cycle counts accurately", () => {
    const gcode = `
G21
G90
G0 Z25.0
G0 X0 Y0
G0 Z3.0

; Pass 1
G1 Z-0.5 F400
G1 X20 Y0 F1200
G1 X20 Y20 F1200
G0 Z3.0

; Pass 2
G0 X0 Y0
G1 Z-1.0 F400
G1 X20 Y0 F1200
G1 X20 Y20 F1200
G0 Z3.0

; Pass 3
G0 X0 Y0
G1 Z-1.5 F400
G1 X20 Y0 F1200
G1 X20 Y20 F1200
G0 Z25.0
M30
`;

    const config: DragKnifeConfig = {
      blade_offset: 1.588,
      tolerance_angle_deg: 20.0,
      swivel_lift_height: null,
      swivel_feed: null,
      disable_spindle: true,
      unit_override: "mm",
    };

    const program = parseGCode(gcode);
    const stats = analyzeProgram(program, config);

    expect(stats.travel_height).toBe(25.0);
    expect(stats.safe_height).toBe(3.0);
    expect(stats.plunge_depth).toBe(-1.5);
    expect(stats.cycle_count).toBe(3);
    expect(stats.depth_pass_count).toBe(3);
    expect(stats.stepdowns.length).toBe(3);

    expect(stats.stepdowns[0].z_level).toBe(-0.5);
    expect(stats.stepdowns[0].stepdown_delta).toBeCloseTo(0.5, 4);

    expect(stats.stepdowns[1].z_level).toBe(-1.0);
    expect(stats.stepdowns[1].stepdown_delta).toBeCloseTo(0.5, 4);

    expect(stats.stepdowns[2].z_level).toBe(-1.5);
    expect(stats.stepdowns[2].stepdown_delta).toBeCloseTo(0.5, 4);
    expect(stats.max_stepdown).toBeCloseTo(0.5, 4);
  });

  it("processes Vectric drag knife compensation and generates stationary swivel arc", () => {
    const gcode = `
G21
G90
G0 Z5.0
G0 X0 Y0
G1 Z-1.5 F600
G1 X50 Y0 F1000
G1 X50 Y50 F1000
G0 Z5.0
M30
`;

    const config: DragKnifeConfig = {
      blade_offset: 1.6,
      tolerance_angle_deg: 20.0,
      swivel_lift_height: null,
      swivel_feed: 400,
      disable_spindle: true,
      unit_override: "mm",
    };

    const res = executeClientDragKnife(gcode, config);
    expect(res.swivel_arcs.length).toBe(1);
    expect(res.swivel_arcs[0].direction).toBe("CCW");
    expect(res.swivel_arcs[0].angle_deg).toBeCloseTo(90, 2);
    expect(res.swivel_arcs[0].center.x).toBe(50);
    expect(res.swivel_arcs[0].center.y).toBe(0);

    expect(res.processed_gcode).toContain("G3 X50.0000 Y1.6000");
  });
});
