import type {
  BoundingBox,
  Contour,
  DragKnifeConfig,
  DragKnifeResult,
  HUDStats,
  Point2D,
  Point3D,
  StepdownInfo,
  SwivelArcInfo,
} from "../types/dragknife";

interface ParsedLine {
  raw: string;
  lineNumber: number;
  motion?: "Rapid" | "Linear" | "ArcCw" | "ArcCcw" | "Other";
  x?: number;
  y?: number;
  z?: number;
  i?: number;
  j?: number;
  f?: number;
  s?: number;
  mCodes: number[];
  comment?: string;
  isUnitG20: boolean;
  isUnitG21: boolean;
  isSpindleOn: boolean;
  isSpindleOff: boolean;
}

interface ParsedProgram {
  lines: ParsedLine[];
  detectedUnit: "mm" | "in";
  contours: Contour[];
  rapidPoints: Point3D[];
  allPoints: Point3D[];
  rapidZLevels: number[];
  cutZLevels: number[];
  feedrates: number[];
  plungeFeedrates: number[];
  cutFeedrates: number[];
  spindleCommands: string[];
  minZ?: number;
  maxZ?: number;
  zClearance?: number;
  zCut?: number;
}

export function dist2D(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function dist3D(p1: Point3D, p2: Point3D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
}

export function normalize2D(dx: number, dy: number): [number, number] | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return [dx / len, dy / len];
}

export function turnAngle(v1: [number, number], v2: [number, number]): number {
  const cross = v1[0] * v2[1] - v1[1] * v2[0];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  return Math.atan2(cross, dot);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function offsetPoint(pt: Point2D, dir: [number, number], dist: number): Point2D {
  return {
    x: pt.x + dir[0] * dist,
    y: pt.y + dir[1] * dist,
  };
}

export function parseGCode(content: string): ParsedProgram {
  const lines: ParsedLine[] = [];
  let currentPos: Point3D = { x: 0, y: 0, z: 0 };
  let currentMotion: "Rapid" | "Linear" | "ArcCw" | "ArcCcw" | "Other" = "Rapid";
  let detectedUnit: "mm" | "in" = "mm";
  let hasExplicitUnit = false;
  const feedrates: number[] = [];
  const plungeFeedrates: number[] = [];
  const cutFeedrates: number[] = [];
  const spindleCommands: string[] = [];
  const rapidZLevels: number[] = [];
  const cutZLevels: number[] = [];

  let minZ: number | undefined;
  let maxZ: number | undefined;
  let zClearance: number | undefined;
  let zCut: number | undefined;

  let currentContour: Point3D[] | null = null;
  let currentContourFeed: number | null = null;
  const contours: Contour[] = [];
  const rapidPoints: Point3D[] = [];
  const allPoints: Point3D[] = [];

  const rawLines = content.split(/\r?\n/);

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineStr = rawLines[idx];
    const { code, comment } = extractComment(lineStr);
    const tokens = tokenizeLine(code);

    const parsed: ParsedLine = {
      raw: lineStr,
      lineNumber: idx + 1,
      mCodes: [],
      comment,
      isUnitG20: false,
      isUnitG21: false,
      isSpindleOn: false,
      isSpindleOff: false,
    };

    for (const [letter, valStr] of tokens) {
      const l = letter.toUpperCase();
      if (l === "G") {
        const g = Math.round(parseFloat(valStr));
        if (g === 0) {
          parsed.motion = "Rapid";
          currentMotion = "Rapid";
        } else if (g === 1) {
          parsed.motion = "Linear";
          currentMotion = "Linear";
        } else if (g === 2) {
          parsed.motion = "ArcCw";
          currentMotion = "ArcCw";
        } else if (g === 3) {
          parsed.motion = "ArcCcw";
          currentMotion = "ArcCcw";
        } else if (g === 20) {
          parsed.isUnitG20 = true;
          detectedUnit = "in";
          hasExplicitUnit = true;
        } else if (g === 21) {
          parsed.isUnitG21 = true;
          detectedUnit = "mm";
          hasExplicitUnit = true;
        }
      } else if (l === "M") {
        const m = parseInt(valStr, 10);
        if (!isNaN(m)) {
          parsed.mCodes.push(m);
          if (m === 3 || m === 4) {
            parsed.isSpindleOn = true;
            spindleCommands.push(`M${m}`);
          } else if (m === 5) {
            parsed.isSpindleOff = true;
            spindleCommands.push("M5");
          }
        }
      } else if (l === "X") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) parsed.x = v;
      } else if (l === "Y") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) parsed.y = v;
      } else if (l === "Z") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) parsed.z = v;
      } else if (l === "I") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) parsed.i = v;
      } else if (l === "J") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) parsed.j = v;
      } else if (l === "F") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) {
          parsed.f = v;
          if (!feedrates.includes(v)) feedrates.push(v);
        }
      } else if (l === "S") {
        const v = parseFloat(valStr);
        if (!isNaN(v)) {
          parsed.s = v;
          spindleCommands.push(`S${Math.round(v)}`);
        }
      }
    }

    if (
      !parsed.motion &&
      (parsed.x !== undefined || parsed.y !== undefined || parsed.z !== undefined)
    ) {
      parsed.motion = currentMotion;
    }

    const newX = parsed.x !== undefined ? parsed.x : currentPos.x;
    const newY = parsed.y !== undefined ? parsed.y : currentPos.y;
    const newZ = parsed.z !== undefined ? parsed.z : currentPos.z;
    const targetPt: Point3D = { x: newX, y: newY, z: newZ };

    if (parsed.x !== undefined || parsed.y !== undefined || parsed.z !== undefined) {
      allPoints.push(targetPt);
    }

    if (parsed.z !== undefined) {
      const zVal = parsed.z;
      minZ = minZ !== undefined ? Math.min(minZ, zVal) : zVal;
      maxZ = maxZ !== undefined ? Math.max(maxZ, zVal) : zVal;

      if (parsed.motion === "Rapid") {
        if (!rapidZLevels.some((rz) => Math.abs(rz - zVal) < 1e-4)) {
          rapidZLevels.push(zVal);
        }
        if (zVal > 0) {
          zClearance = zClearance !== undefined ? Math.min(zClearance, zVal) : zVal;
        }
      } else {
        if (zVal <= 0 || parsed.x !== undefined || parsed.y !== undefined) {
          if (!cutZLevels.some((cz) => Math.abs(cz - zVal) < 1e-4)) {
            cutZLevels.push(zVal);
          }
        }
        if (zVal < 0) {
          zCut = zCut !== undefined ? Math.min(zCut, zVal) : zVal;
        }
      }

      if (parsed.f !== undefined) {
        if (zVal < currentPos.z && parsed.x === undefined && parsed.y === undefined) {
          if (!plungeFeedrates.includes(parsed.f)) plungeFeedrates.push(parsed.f);
        } else if (parsed.x !== undefined || parsed.y !== undefined) {
          if (!cutFeedrates.includes(parsed.f)) cutFeedrates.push(parsed.f);
        }
      }
    }

    if (parsed.f !== undefined) {
      currentContourFeed = parsed.f;
      if (
        (parsed.x !== undefined || parsed.y !== undefined) &&
        !cutFeedrates.includes(parsed.f)
      ) {
        cutFeedrates.push(parsed.f);
      }
    }

    if (parsed.motion === "Rapid") {
      rapidPoints.push(targetPt);
      if (currentContour && currentContour.length >= 2) {
        const isClosed = dist3D(currentContour[0], currentContour[currentContour.length - 1]) < 0.1;
        let length = 0;
        for (let i = 0; i < currentContour.length - 1; i++) {
          length += dist3D(currentContour[i], currentContour[i + 1]);
        }
        contours.push({
          id: contours.length + 1,
          is_closed: isClosed,
          vertices: currentContour,
          feedrate: currentContourFeed,
          length,
        });
      }
      currentContour = null;
    } else if (
      parsed.motion === "Linear" ||
      parsed.motion === "ArcCw" ||
      parsed.motion === "ArcCcw"
    ) {
      if (parsed.z !== undefined && parsed.z > 0 && parsed.x === undefined && parsed.y === undefined) {
        if (currentContour && currentContour.length >= 2) {
          const isClosed = dist3D(currentContour[0], currentContour[currentContour.length - 1]) < 0.1;
          let length = 0;
          for (let i = 0; i < currentContour.length - 1; i++) {
            length += dist3D(currentContour[i], currentContour[i + 1]);
          }
          contours.push({
            id: contours.length + 1,
            is_closed: isClosed,
            vertices: currentContour,
            feedrate: currentContourFeed,
            length,
          });
        }
        currentContour = null;
      } else if (parsed.x !== undefined || parsed.y !== undefined) {
        if (currentContour) {
          const last = currentContour[currentContour.length - 1];
          if (dist3D(last, targetPt) > 1e-6) {
            currentContour.push(targetPt);
          }
        } else {
          currentContour = [{ x: currentPos.x, y: currentPos.y, z: targetPt.z }];
          if (dist3D(currentContour[0], targetPt) > 1e-6) {
            currentContour.push(targetPt);
          }
        }
      }
    }

    currentPos = targetPt;
    lines.push(parsed);
  }

  if (currentContour && currentContour.length >= 2) {
    const isClosed = dist3D(currentContour[0], currentContour[currentContour.length - 1]) < 0.1;
    let length = 0;
    for (let i = 0; i < currentContour.length - 1; i++) {
      length += dist3D(currentContour[i], currentContour[i + 1]);
    }
    contours.push({
      id: contours.length + 1,
      is_closed: isClosed,
      vertices: currentContour,
      feedrate: currentContourFeed,
      length,
    });
  }

  if (!hasExplicitUnit && minZ !== undefined && maxZ !== undefined) {
    if (minZ < -25 || maxZ > 100) {
      detectedUnit = "mm";
    }
  }

  return {
    lines,
    detectedUnit,
    contours,
    rapidPoints,
    allPoints,
    rapidZLevels,
    cutZLevels,
    feedrates,
    plungeFeedrates,
    cutFeedrates,
    spindleCommands,
    minZ,
    maxZ,
    zClearance,
    zCut,
  };
}

function extractComment(line: string): { code: string; comment?: string } {
  const semiIdx = line.indexOf(";");
  if (semiIdx !== -1) {
    return {
      code: line.substring(0, semiIdx).trim(),
      comment: line.substring(semiIdx + 1).trim() || undefined,
    };
  }
  const openParen = line.indexOf("(");
  const closeParen = line.indexOf(")");
  if (openParen !== -1 && closeParen > openParen) {
    return {
      code: (line.substring(0, openParen) + line.substring(closeParen + 1)).trim(),
      comment: line.substring(openParen + 1, closeParen).trim() || undefined,
    };
  }
  return { code: line.trim() };
}

function tokenizeLine(line: string): [string, string][] {
  const tokens: [string, string][] = [];
  let currentLetter: string | null = null;
  let currentVal = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (/\s/.test(ch)) continue;
    if (/[a-zA-Z]/.test(ch)) {
      if (currentLetter) {
        tokens.push([currentLetter, currentVal]);
        currentVal = "";
      }
      currentLetter = ch;
    } else if (currentLetter) {
      currentVal += ch;
    }
  }
  if (currentLetter) {
    tokens.push([currentLetter, currentVal]);
  }
  return tokens;
}

export function analyzeProgram(program: ParsedProgram, config: DragKnifeConfig): HUDStats {
  const unitStr =
    (config.unit_override || program.detectedUnit) === "in"
      ? "G20 (Imperial - in)"
      : "G21 (Metric - mm)";

  let bounds: BoundingBox = {
    min_x: 0,
    max_x: 0,
    min_y: 0,
    max_y: 0,
    min_z: 0,
    max_z: 0,
    width: 0,
    height: 0,
    depth: 0,
  };

  if (program.allPoints.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const pt of program.allPoints) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
      minZ = Math.min(minZ, pt.z);
      maxZ = Math.max(maxZ, pt.z);
    }

    bounds = {
      min_x: minX,
      max_x: maxX,
      min_y: minY,
      max_y: maxY,
      min_z: minZ,
      max_z: maxZ,
      width: maxX >= minX ? maxX - minX : 0,
      height: maxY >= minY ? maxY - minY : 0,
      depth: maxZ >= minZ ? maxZ - minZ : 0,
    };
  }

  let totalCutDistance = 0;
  let closedCount = 0;
  let openCount = 0;
  let cornerCount = 0;

  const tolRad = degToRad(config.tolerance_angle_deg);

  for (const c of program.contours) {
    totalCutDistance += c.length;
    if (c.is_closed) closedCount++;
    else openCount++;

    if (c.vertices.length >= 3) {
      for (let i = 1; i < c.vertices.length - 1; i++) {
        const pPrev = { x: c.vertices[i - 1].x, y: c.vertices[i - 1].y };
        const pCurr = { x: c.vertices[i].x, y: c.vertices[i].y };
        const pNext = { x: c.vertices[i + 1].x, y: c.vertices[i + 1].y };

        const u1 = normalize2D(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
        const u2 = normalize2D(pNext.x - pCurr.x, pNext.y - pCurr.y);

        if (u1 && u2) {
          const angle = Math.abs(turnAngle(u1, u2));
          if (angle > tolRad) {
            cornerCount++;
          }
        }
      }
    }
  }

  let totalRapidDistance = 0;
  for (let i = 0; i < program.rapidPoints.length - 1; i++) {
    totalRapidDistance += dist3D(program.rapidPoints[i], program.rapidPoints[i + 1]);
  }

  const avgFeed =
    program.feedrates[0] || (program.detectedUnit === "in" ? 40 : 1000);
  const rapidFeed = program.detectedUnit === "in" ? 120 : 3000;

  const cutTimeMin = totalCutDistance / Math.max(avgFeed, 1);
  const rapidTimeMin = totalRapidDistance / rapidFeed;
  const estimatedCycleTimeSeconds = (cutTimeMin + rapidTimeMin) * 60;

  // --- Z-Kinematics & Stepdown Analysis ---
  const travelHeight =
    program.rapidZLevels.length > 0
      ? Math.max(...program.rapidZLevels)
      : program.maxZ ?? null;

  const safeHeight = program.zClearance ?? null;
  const plungeDepth = program.zCut ?? program.minZ ?? null;

  const uniqueCutZ: number[] = [];
  for (const z of program.cutZLevels) {
    if (z <= 0 && !uniqueCutZ.some((uz) => Math.abs(uz - z) < 1e-4)) {
      uniqueCutZ.push(z);
    }
  }
  for (const c of program.contours) {
    for (const v of c.vertices) {
      if (v.z <= 0 && !uniqueCutZ.some((uz) => Math.abs(uz - v.z) < 1e-4)) {
        uniqueCutZ.push(v.z);
      }
    }
  }
  uniqueCutZ.sort((a, b) => b - a); // Descending (0 -> deepest)

  if (uniqueCutZ.length === 0 && plungeDepth !== null) {
    uniqueCutZ.push(plungeDepth);
  }

  const stepdowns: StepdownInfo[] = [];
  let prevZ = 0;
  let maxStepdown: number | null = null;

  for (let i = 0; i < uniqueCutZ.length; i++) {
    const zVal = uniqueCutZ[i];
    const delta = Math.abs(prevZ - zVal);
    maxStepdown = maxStepdown !== null ? Math.max(maxStepdown, delta) : delta;
    stepdowns.push({
      pass_number: i + 1,
      z_level: zVal,
      stepdown_delta: delta,
      feedrate: program.cutFeedrates[i] ?? program.feedrates[0] ?? null,
    });
    prevZ = zVal;
  }

  const depthPassCount = Math.max(stepdowns.length, 1);
  const cycleCount = Math.max(program.contours.length, depthPassCount);

  return {
    unit: unitStr,
    total_lines: program.lines.length,
    bounds,
    total_cut_distance: totalCutDistance,
    total_rapid_distance: totalRapidDistance,
    estimated_cycle_time_seconds: estimatedCycleTimeSeconds,
    contour_count: program.contours.length,
    closed_contour_count: closedCount,
    open_contour_count: openCount,
    corner_count: cornerCount,
    swivel_arc_count: cornerCount,
    cycle_count: cycleCount,
    depth_pass_count: depthPassCount,
    stepdowns,
    travel_height: travelHeight,
    safe_height: safeHeight,
    plunge_depth: plungeDepth,
    max_stepdown: maxStepdown,
    plunge_feedrate: program.plungeFeedrates[0] ?? null,
    cut_feedrate: program.cutFeedrates[0] ?? program.feedrates[0] ?? null,
    feedrates: program.feedrates,
    spindle_commands: program.spindleCommands,
  };
}

export function processDragKnifeProgram(
  program: ParsedProgram,
  config: DragKnifeConfig,
  hudStats: HUDStats,
): DragKnifeResult {
  const isMetric = (config.unit_override || program.detectedUnit) === "mm";
  const offset = config.blade_offset;
  const tolRad = degToRad(config.tolerance_angle_deg);
  const zSafe = program.zClearance ?? (isMetric ? 5.0 : 0.2);
  const zCutDefault = program.zCut ?? (isMetric ? -1.5 : -0.06);

  const outLines: string[] = [];
  const processedContours: Contour[] = [];
  const swivelArcs: SwivelArcInfo[] = [];

  outLines.push("; ==============================================================================");
  outLines.push("; Grimoire DragKnife Post-Processor (Ritual Skis)");
  outLines.push(`; Blade Offset: ${offset.toFixed(4)} ${isMetric ? "mm" : "in"}`);
  outLines.push(`; Corner Swivel Tolerance: ${config.tolerance_angle_deg.toFixed(1)} deg`);
  if (config.swivel_lift_height !== null) {
    outLines.push(`; Swivel Z-Lift Height: ${config.swivel_lift_height.toFixed(4)}`);
  } else {
    outLines.push("; Swivel Z-Lift: Disabled");
  }
  outLines.push("; Safety: Spindle Disabled (Drag Knife Collet Protection)");
  outLines.push("; ==============================================================================");

  outLines.push(isMetric ? "G21 ; Millimeters" : "G20 ; Inches");
  outLines.push("G90 ; Absolute Coordinates\nG17 ; XY Plane");
  if (config.disable_spindle) {
    outLines.push("M5 ; Ensure Spindle Stopped");
  }
  outLines.push(`G0 Z${zSafe.toFixed(4)}\n`);

  for (let cIdx = 0; cIdx < program.contours.length; cIdx++) {
    const contour = program.contours[cIdx];
    if (contour.vertices.length < 2) continue;

    const rawPts = contour.vertices;
    const pts2D: Point2D[] = [];
    for (const p of rawPts) {
      const p2d: Point2D = { x: p.x, y: p.y };
      if (pts2D.length > 0) {
        const last = pts2D[pts2D.length - 1];
        if (Math.hypot(p2d.x - last.x, p2d.y - last.y) > 1e-4) {
          pts2D.push(p2d);
        }
      } else {
        pts2D.push(p2d);
      }
    }

    if (pts2D.length < 2) continue;

    let cutZ = zCutDefault;
    for (const p of rawPts) {
      if (p.z < cutZ) cutZ = p.z;
    }

    const feed = contour.feedrate ?? (isMetric ? 1000.0 : 40.0);
    const swivelFeed = config.swivel_feed ?? feed * 0.4;

    outLines.push(
      `; --- Contour #${cIdx + 1} (Length: ${contour.length.toFixed(2)} ${isMetric ? "mm" : "in"}, Points: ${pts2D.length}) ---`,
    );

    const machinePath: Point3D[] = [];

    const u0 = normalize2D(pts2D[1].x - pts2D[0].x, pts2D[1].y - pts2D[0].y) ?? [1, 0];
    const startSpindle = offsetPoint(pts2D[0], u0, offset);

    outLines.push(`G0 X${startSpindle.x.toFixed(4)} Y${startSpindle.y.toFixed(4)}`);
    machinePath.push({ x: startSpindle.x, y: startSpindle.y, z: zSafe });

    outLines.push(`G1 Z${cutZ.toFixed(4)} F${(feed * 0.5).toFixed(1)}`);
    machinePath.push({ x: startSpindle.x, y: startSpindle.y, z: cutZ });

    const n = pts2D.length;
    for (let i = 0; i < n - 1; i++) {
      const pCurr = pts2D[i];
      const pNext = pts2D[i + 1];

      const uCurr = normalize2D(pNext.x - pCurr.x, pNext.y - pCurr.y) ?? [1, 0];
      const spindleTarget = offsetPoint(pNext, uCurr, offset);

      outLines.push(`G1 X${spindleTarget.x.toFixed(4)} Y${spindleTarget.y.toFixed(4)} F${feed.toFixed(1)}`);
      machinePath.push({ x: spindleTarget.x, y: spindleTarget.y, z: cutZ });

      if (i + 2 < n) {
        const pFuture = pts2D[i + 2];
        const uNext = normalize2D(pFuture.x - pNext.x, pFuture.y - pNext.y);
        if (uNext) {
          const dTheta = turnAngle(uCurr, uNext);
          const angleDeg = Math.abs(radToDeg(dTheta));

          if (Math.abs(dTheta) > tolRad) {
            const swivelStart = spindleTarget;
            const swivelEnd = offsetPoint(pNext, uNext, offset);
            const centerI = -offset * uCurr[0];
            const centerJ = -offset * uCurr[1];
            const isCCW = dTheta > 0;
            const gCode = isCCW ? "G3" : "G2";

            if (config.swivel_lift_height !== null) {
              outLines.push(
                `G1 Z${config.swivel_lift_height.toFixed(4)} F${(feed * 0.5).toFixed(1)} ; Swivel Lift`,
              );
            }

            outLines.push(
              `${gCode} X${swivelEnd.x.toFixed(4)} Y${swivelEnd.y.toFixed(4)} I${centerI.toFixed(4)} J${centerJ.toFixed(4)} F${swivelFeed.toFixed(1)} ; Swivel ${angleDeg.toFixed(1)}° ${isCCW ? "CCW" : "CW"}`,
            );
            machinePath.push({ x: swivelEnd.x, y: swivelEnd.y, z: cutZ });

            swivelArcs.push({
              center: pNext,
              start: swivelStart,
              end: swivelEnd,
              angle_deg: angleDeg,
              direction: isCCW ? "CCW" : "CW",
              radius: offset,
            });

            if (config.swivel_lift_height !== null) {
              outLines.push(`G1 Z${cutZ.toFixed(4)} F${(feed * 0.5).toFixed(1)}`);
            }
          }
        }
      }
    }

    outLines.push(`G0 Z${zSafe.toFixed(4)}\n`);
    if (machinePath.length > 0) {
      const last = machinePath[machinePath.length - 1];
      machinePath.push({ x: last.x, y: last.y, z: zSafe });
    }

    let length = 0;
    for (let i = 0; i < machinePath.length - 1; i++) {
      length += dist3D(machinePath[i], machinePath[i + 1]);
    }

    processedContours.push({
      id: cIdx + 1,
      is_closed: contour.is_closed,
      vertices: machinePath,
      feedrate: feed,
      length,
    });
  }

  outLines.push("; Program Finish\nM30\n");

  return {
    processed_gcode: outLines.join("\n"),
    hud_stats: hudStats,
    original_contours: program.contours,
    processed_contours: processedContours,
    swivel_arcs: swivelArcs,
  };
}

export function executeClientDragKnife(
  gcode: string,
  config: DragKnifeConfig,
): DragKnifeResult {
  const program = parseGCode(gcode);
  const hudStats = analyzeProgram(program, config);
  return processDragKnifeProgram(program, config, hudStats);
}

export function executeClientAnalyze(
  gcode: string,
  config?: DragKnifeConfig,
): HUDStats {
  const program = parseGCode(gcode);
  const cfg = config ?? {
    blade_offset: 1.588,
    tolerance_angle_deg: 20.0,
    swivel_lift_height: null,
    swivel_feed: null,
    disable_spindle: true,
    unit_override: null,
  };
  return analyzeProgram(program, cfg);
}
