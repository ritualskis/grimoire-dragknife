import type { Contour, Point2D, Point3D, SwivelArcInfo, Unit } from "../types/dragknife";

export interface LayerVisibility {
  target: boolean;
  spindle: boolean;
  swivels: boolean;
  rapids: boolean;
  vectors: boolean;
  grid: boolean;
}

export interface HoverVertexInfo {
  x: number;
  y: number;
  segIndex: number;
  totalSegs: number;
}

export interface HoverSwivelInfo {
  pivotX: number;
  pivotY: number;
  turnAngleDeg: number;
  radius: number;
  cornerNum: number;
  direction: string;
}

export interface HoverKnifeInfo {
  spindleX: number;
  spindleY: number;
  tipX: number;
  tipY: number;
  offsetVal: number;
  angleDeg: number;
}

export interface SimulationState {
  progress: number; // 0.0 to 1.0
  spindleX: number;
  spindleY: number;
  tipX: number;
  tipY: number;
  headingAngle: number;
  isSwiveling: boolean;
  isRapid: boolean;
  zHeight: number;
}

export class CADTooltipRenderer {
  static render(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    opts: {
      anchorX: number;
      anchorY: number;
      headerTitle: string;
      headerColor?: string;
      detailLines: string[];
      footerTip?: string;
    },
  ) {
    const anchorX = opts.anchorX || 100;
    const anchorY = opts.anchorY || 100;
    const headerTitle = opts.headerTitle || "";
    const headerColor = opts.headerColor || "#38bdf8";
    const detailLines = opts.detailLines || [];
    const footerTip = opts.footerTip || null;

    ctx.save();

    ctx.font = "bold 11px ui-monospace, 'Fira Code', Menlo, monospace";
    const headerWidth = ctx.measureText(headerTitle).width;

    ctx.font = "11px ui-monospace, 'Fira Code', Menlo, monospace";
    let maxLineW = headerWidth;
    for (const line of detailLines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineW) maxLineW = w;
    }

    ctx.font = "10px system-ui, -apple-system, sans-serif";
    const footerW = footerTip ? ctx.measureText(footerTip).width : 0;
    if (footerW > maxLineW) maxLineW = footerW;

    const paddingX = 14;
    const paddingY = 12;
    const boxW = Math.max(260, Math.ceil(maxLineW + paddingX * 2 + 12));
    const totalLines = 1 + detailLines.length + (footerTip ? 1 : 0);
    const lineGap = 18;
    const boxH = Math.ceil(paddingY * 2 + totalLines * lineGap + 4);

    let tipX = anchorX + 16;
    let tipY = anchorY - Math.round(boxH / 2);

    if (tipX + boxW > canvasW - 14) tipX = anchorX - boxW - 16;
    if (tipY < 12) tipY = 12;
    if (tipY + boxH > canvasH - 12) tipY = canvasH - boxH - 12;

    ctx.fillStyle = "rgba(14, 18, 26, 0.95)";
    ctx.strokeStyle = headerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(tipX, tipY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = headerColor;
    ctx.fillRect(tipX + 12, tipY, 36, 2.5);

    let currY = tipY + 18;
    ctx.font = "bold 11px ui-monospace, 'Fira Code', Menlo, monospace";
    ctx.fillStyle = headerColor;
    ctx.fillText(headerTitle, tipX + paddingX, currY);
    currY += lineGap;

    ctx.font = "11px ui-monospace, 'Fira Code', Menlo, monospace";
    ctx.fillStyle = "#ffffff";
    for (const line of detailLines) {
      ctx.fillText(line, tipX + paddingX, currY);
      currY += lineGap;
    }

    if (footerTip) {
      currY += 2;
      ctx.font = "10px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(footerTip, tipX + paddingX, currY);
    }

    ctx.restore();
  }
}

export class CadRenderer2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public scale = 4.0;
  public offsetX = 100;
  public offsetY = 100;
  public width = 800;
  public height = 600;

  public layers: LayerVisibility = {
    target: true,
    spindle: true,
    swivels: true,
    rapids: true,
    vectors: true,
    grid: true,
  };

  public originalContours: Contour[] = [];
  public processedContours: Contour[] = [];
  public swivelArcs: SwivelArcInfo[] = [];
  public bladeOffset = 1.588;
  public unit: Unit = "mm";

  public simProgress = 0.0;
  public isAnimating = false;

  public hoverVertex: HoverVertexInfo | null = null;
  public hoverSwivel: HoverSwivelInfo | null = null;
  public hoverKnife: HoverKnifeInfo | null = null;
  public mouseWorldPos: Point2D | null = null;

  private lastCutterPos: SimulationState | null = null;
  private cumDistances: { dist: number; pt: Point3D; isSwivel: boolean }[] = [];
  private totalTrajectoryDist = 0;

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
    const context = canvasElement.getContext("2d");
    if (!context) throw new Error("Could not acquire 2D canvas context");
    this.ctx = context;
  }

  public resize(parentWidth: number, parentHeight: number) {
    const dpr = window.devicePixelRatio || 1;
    this.width = parentWidth;
    this.height = parentHeight;

    this.canvas.width = Math.round(parentWidth * dpr);
    this.canvas.height = Math.round(parentHeight * dpr);
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  public setData(
    originalContours: Contour[],
    processedContours: Contour[],
    swivelArcs: SwivelArcInfo[],
    bladeOffset: number,
    unit: Unit,
    preserveView = false,
  ) {
    this.originalContours = originalContours;
    this.processedContours = processedContours;
    this.swivelArcs = swivelArcs;
    this.bladeOffset = bladeOffset;
    this.unit = unit;

    this.buildTrajectoryTable();

    if (!preserveView || (this.offsetX === 100 && this.offsetY === 100)) {
      this.fitToScreen();
    } else {
      this.render();
    }
  }

  private buildTrajectoryTable() {
    this.cumDistances = [];
    let acc = 0;

    for (const c of this.processedContours) {
      if (c.vertices.length < 2) continue;
      for (let i = 0; i < c.vertices.length; i++) {
        if (i > 0) {
          const prev = c.vertices[i - 1];
          const curr = c.vertices[i];
          acc += Math.hypot(curr.x - prev.x, curr.y - prev.y, curr.z - prev.z);
        }
        this.cumDistances.push({
          dist: acc,
          pt: c.vertices[i],
          isSwivel: false,
        });
      }
    }
    this.totalTrajectoryDist = acc;
  }

  public toScreen(x: number, y: number): { sx: number; sy: number } {
    return {
      sx: this.offsetX + x * this.scale,
      sy: this.offsetY - y * this.scale,
    };
  }

  public toWorld(sx: number, sy: number): Point2D {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: -(sy - this.offsetY) / this.scale,
    };
  }

  public fitToScreen() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const check = (x: number, y: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    for (const c of this.originalContours) {
      for (const v of c.vertices) check(v.x, v.y);
    }
    for (const c of this.processedContours) {
      for (const v of c.vertices) check(v.x, v.y);
    }

    if (minX === Infinity) {
      minX = 0;
      maxX = this.unit === "in" ? 4 : 100;
      minY = 0;
      maxY = this.unit === "in" ? 3 : 60;
    }

    const pad = 60;
    const contentW = Math.max(0.1, maxX - minX);
    const contentH = Math.max(0.1, maxY - minY);

    const scaleX = (this.width - pad * 2) / contentW;
    const scaleY = (this.height - pad * 2) / contentH;
    this.scale = Math.max(0.05, Math.min(scaleX, scaleY, 200.0));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    this.offsetX = this.width / 2 - midX * this.scale;
    this.offsetY = this.height / 2 + midY * this.scale;
    this.render();
  }

  public zoomAt(screenX: number, screenY: number, factor: number) {
    const minScale = 0.05;
    const maxScale = 5000;
    const targetScale = Math.max(minScale, Math.min(maxScale, this.scale * factor));
    const actualFactor = targetScale / this.scale;

    this.offsetX = screenX - (screenX - this.offsetX) * actualFactor;
    this.offsetY = screenY + (this.offsetY - screenY) * actualFactor;
    this.scale = targetScale;
    this.render();
  }

  public updateHover(screenX: number, screenY: number): boolean {
    this.mouseWorldPos = this.toWorld(screenX, screenY);

    let knifeFound: HoverKnifeInfo | null = null;
    if (this.lastCutterPos) {
      const pS = this.toScreen(this.lastCutterPos.spindleX, this.lastCutterPos.spindleY);
      const pT = this.toScreen(this.lastCutterPos.tipX, this.lastCutterPos.tipY);
      if (
        Math.hypot(screenX - pS.sx, screenY - pS.sy) < 28 ||
        Math.hypot(screenX - pT.sx, screenY - pT.sy) < 28
      ) {
        knifeFound = {
          spindleX: this.lastCutterPos.spindleX,
          spindleY: this.lastCutterPos.spindleY,
          tipX: this.lastCutterPos.tipX,
          tipY: this.lastCutterPos.tipY,
          offsetVal: this.bladeOffset,
          angleDeg: Math.round((this.lastCutterPos.headingAngle * 180) / Math.PI),
        };
      }
    }

    let swivelFound: HoverSwivelInfo | null = null;
    if (this.layers.swivels && this.swivelArcs.length > 0) {
      let minSDist = 24;
      for (let i = 0; i < this.swivelArcs.length; i++) {
        const sw = this.swivelArcs[i];
        const pP = this.toScreen(sw.center.x, sw.center.y);
        const d = Math.hypot(screenX - pP.sx, screenY - pP.sy);
        if (d < minSDist) {
          minSDist = d;
          swivelFound = {
            pivotX: sw.center.x,
            pivotY: sw.center.y,
            turnAngleDeg: sw.angle_deg,
            radius: sw.radius,
            cornerNum: i + 1,
            direction: sw.direction,
          };
        }
      }
    }

    let vertexFound: HoverVertexInfo | null = null;
    if (this.layers.target && this.originalContours.length > 0) {
      let minVDist = 14;
      for (const c of this.originalContours) {
        for (let i = 0; i < c.vertices.length; i++) {
          const pt = this.toScreen(c.vertices[i].x, c.vertices[i].y);
          const d = Math.hypot(screenX - pt.sx, screenY - pt.sy);
          if (d < minVDist) {
            minVDist = d;
            vertexFound = {
              x: c.vertices[i].x,
              y: c.vertices[i].y,
              segIndex: i + 1,
              totalSegs: c.vertices.length,
            };
          }
        }
      }
    }

    if (knifeFound) {
      swivelFound = null;
      vertexFound = null;
    } else if (swivelFound) {
      vertexFound = null;
    }

    const changed =
      Boolean(knifeFound) !== Boolean(this.hoverKnife) ||
      Boolean(swivelFound) !== Boolean(this.hoverSwivel) ||
      Boolean(vertexFound) !== Boolean(this.hoverVertex);

    this.hoverKnife = knifeFound;
    this.hoverSwivel = swivelFound;
    this.hoverVertex = vertexFound;
    return changed;
  }

  public render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Dark Precision CAD Background & Grid
    ctx.fillStyle = "#0c0f17";
    ctx.fillRect(0, 0, w, h);

    if (this.layers.grid) {
      this.drawGrid();
    }

    // Origin Axes
    this.drawOriginAxes();

    // 2. Rapids Layer (Dashed Slate)
    if (this.layers.rapids && this.processedContours.length > 1) {
      this.drawRapids();
    }

    // 3. Target Cut Profile Layer (Vibrant Green)
    if (this.layers.target) {
      this.drawTargetCutProfile();
    }

    // 4. Spindle Lead Path Layer (Safety Orange)
    if (this.layers.spindle) {
      this.drawMachineSpindlePath();
    }

    // 5. Stationary Swivel Arcs Layer (Cyan)
    if (this.layers.swivels) {
      this.drawSwivelArcs();
    }

    // 6. Directional Tangent Vectors
    if (this.layers.vectors) {
      this.drawDirectionalVectors();
    }

    // 7. Animated Drag Knife Assembly
    this.drawAnimatedDragKnife();

    // 8. Scale Ruler & Coordinate Tooltips
    this.drawScaleRuler();
    this.drawTooltips();
  }

  private drawOriginAxes() {
    const ctx = this.ctx;
    const origin = this.toScreen(0, 0);

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";

    ctx.beginPath();
    ctx.moveTo(origin.sx, 0);
    ctx.lineTo(origin.sx, this.height);
    ctx.moveTo(0, origin.sy);
    ctx.lineTo(this.width, origin.sy);
    ctx.stroke();

    // Origin Crosshair Box
    ctx.strokeStyle = "#38bdf8";
    ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
    ctx.beginPath();
    ctx.arc(origin.sx, origin.sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = "9px ui-monospace, 'Fira Code', Menlo, monospace";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("(0,0)", origin.sx + 7, origin.sy - 7);
    ctx.restore();
  }

  private drawGrid() {
    const ctx = this.ctx;
    const isMetric = this.unit === "mm";

    const candidateSteps = isMetric
      ? [0.1, 0.5, 1, 5, 10, 20, 50, 100, 250, 500]
      : [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0];

    const minPixelSpacing = 65;
    let step = candidateSteps[candidateSteps.length - 1];
    for (const c of candidateSteps) {
      if (c * this.scale >= minPixelSpacing) {
        step = c;
        break;
      }
    }

    const topLeft = this.toWorld(0, 0);
    const bottomRight = this.toWorld(this.width, this.height);

    const startX = Math.floor(topLeft.x / step) * step;
    const endX = Math.ceil(bottomRight.x / step) * step;
    const startY = Math.floor(bottomRight.y / step) * step;
    const endY = Math.ceil(topLeft.y / step) * step;

    ctx.save();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";

    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      const sx = this.toScreen(x, 0).sx;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.height);
    }
    for (let y = startY; y <= endY; y += step) {
      const sy = this.toScreen(0, y).sy;
      ctx.moveTo(0, sy);
      ctx.lineTo(this.width, sy);
    }
    ctx.stroke();

    // Subtle Coordinate Numbers along margins
    ctx.font = "9px ui-monospace, 'Fira Code', Menlo, monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

    for (let x = startX; x <= endX; x += step) {
      const sx = this.toScreen(x, 0).sx;
      if (sx > 40 && sx < this.width - 40) {
        ctx.fillText(x.toFixed(isMetric ? 0 : 2), sx + 2, this.height - 8);
      }
    }
    for (let y = startY; y <= endY; y += step) {
      const sy = this.toScreen(0, y).sy;
      if (sy > 40 && sy < this.height - 40) {
        ctx.fillText(y.toFixed(isMetric ? 0 : 2), 8, sy - 2);
      }
    }

    ctx.restore();
  }

  private drawRapids() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    for (let i = 0; i < this.processedContours.length - 1; i++) {
      const c1 = this.processedContours[i];
      const c2 = this.processedContours[i + 1];
      if (c1.vertices.length === 0 || c2.vertices.length === 0) continue;
      const end1 = this.toScreen(
        c1.vertices[c1.vertices.length - 1].x,
        c1.vertices[c1.vertices.length - 1].y,
      );
      const start2 = this.toScreen(c2.vertices[0].x, c2.vertices[0].y);
      ctx.moveTo(end1.sx, end1.sy);
      ctx.lineTo(start2.sx, start2.sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawTargetCutProfile() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#22c55e"; // Vibrant Green
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const c of this.originalContours) {
      if (c.vertices.length < 2) continue;
      ctx.beginPath();
      const s0 = this.toScreen(c.vertices[0].x, c.vertices[0].y);
      ctx.moveTo(s0.sx, s0.sy);
      for (let i = 1; i < c.vertices.length; i++) {
        const si = this.toScreen(c.vertices[i].x, c.vertices[i].y);
        ctx.lineTo(si.sx, si.sy);
      }
      if (c.is_closed) ctx.closePath();
      ctx.stroke();

      // Node Dots
      ctx.fillStyle = "#22c55e";
      for (const v of c.vertices) {
        const pt = this.toScreen(v.x, v.y);
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawMachineSpindlePath() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "#f97316"; // Safety Orange
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const c of this.processedContours) {
      if (c.vertices.length < 2) continue;
      ctx.beginPath();
      const s0 = this.toScreen(c.vertices[0].x, c.vertices[0].y);
      ctx.moveTo(s0.sx, s0.sy);
      for (let i = 1; i < c.vertices.length; i++) {
        const si = this.toScreen(c.vertices[i].x, c.vertices[i].y);
        ctx.lineTo(si.sx, si.sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSwivelArcs() {
    const ctx = this.ctx;
    ctx.save();

    for (const arc of this.swivelArcs) {
      const center = this.toScreen(arc.center.x, arc.center.y);
      const start = this.toScreen(arc.start.x, arc.start.y);
      const end = this.toScreen(arc.end.x, arc.end.y);

      // Center stationary pivot dot with target ring
      ctx.fillStyle = "#ef4444"; // Red pivot vertex
      ctx.beginPath();
      ctx.arc(center.sx, center.sy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Radial caster connectors
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
      ctx.beginPath();
      ctx.moveTo(center.sx, center.sy);
      ctx.lineTo(start.sx, start.sy);
      ctx.moveTo(center.sx, center.sy);
      ctx.lineTo(end.sx, end.sy);
      ctx.stroke();

      // Cyan Swivel Arc
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "#06b6d4"; // Bright Cyan
      ctx.beginPath();
      const rPx = arc.radius * this.scale;
      const startAngle = -Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x);
      const endAngle = -Math.atan2(arc.end.y - arc.center.y, arc.end.x - arc.center.x);
      const isCCW = arc.direction === "CCW";
      ctx.arc(center.sx, center.sy, rPx, startAngle, endAngle, isCCW);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDirectionalVectors() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#22c55e";

    for (const c of this.originalContours) {
      for (let i = 0; i < c.vertices.length - 1; i++) {
        const p1 = c.vertices[i];
        const p2 = c.vertices[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len * this.scale < 25) continue;

        const pMid = this.toScreen(midX, midY);
        const angle = -Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(pMid.sx, pMid.sy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private getInterpolatedState(progress: number): SimulationState {
    if (this.cumDistances.length < 2) {
      return {
        progress,
        spindleX: 0,
        spindleY: 0,
        tipX: 0,
        tipY: 0,
        headingAngle: 0,
        isSwiveling: false,
        isRapid: false,
        zHeight: 0,
      };
    }

    const targetDist = progress * this.totalTrajectoryDist;
    let idx = 0;
    while (idx < this.cumDistances.length - 1 && this.cumDistances[idx + 1].dist < targetDist) {
      idx++;
    }

    const p0 = this.cumDistances[idx];
    const p1 = this.cumDistances[Math.min(idx + 1, this.cumDistances.length - 1)];
    const segLen = p1.dist - p0.dist;
    const t = segLen > 1e-6 ? (targetDist - p0.dist) / segLen : 0;

    const curX = p0.pt.x + (p1.pt.x - p0.pt.x) * t;
    const curY = p0.pt.y + (p1.pt.y - p0.pt.y) * t;
    const curZ = p0.pt.z + (p1.pt.z - p0.pt.z) * t;

    const dx = p1.pt.x - p0.pt.x;
    const dy = p1.pt.y - p0.pt.y;
    const heading = Math.atan2(dy, dx);

    // Tip is offset behind spindle along heading
    const uX = Math.cos(heading);
    const uY = Math.sin(heading);
    const tipX = curX - uX * this.bladeOffset;
    const tipY = curY - uY * this.bladeOffset;

    return {
      progress,
      spindleX: curX,
      spindleY: curY,
      tipX,
      tipY,
      headingAngle: heading,
      isSwiveling: p1.isSwivel,
      isRapid: curZ > 0.0,
      zHeight: curZ,
    };
  }

  private drawAnimatedDragKnife() {
    const state = this.getInterpolatedState(this.simProgress);
    this.lastCutterPos = state;

    const ctx = this.ctx;
    const pSpindle = this.toScreen(state.spindleX, state.spindleY);
    const pTip = this.toScreen(state.tipX, state.tipY);

    ctx.save();

    if (state.isRapid) {
      ctx.globalAlpha = 0.4;
    }

    // 1. Connecting Caster Bar (Rigid link from spindle center to blade tip)
    ctx.lineWidth = 3.0;
    ctx.strokeStyle = "#fb923c"; // Amber
    ctx.beginPath();
    ctx.moveTo(pSpindle.sx, pSpindle.sy);
    ctx.lineTo(pTip.sx, pTip.sy);
    ctx.stroke();

    // 2. Machine Spindle Center Circle with Crosshairs (+)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fb923c";
    ctx.fillStyle = "rgba(251, 146, 60, 0.3)";
    ctx.beginPath();
    ctx.arc(pSpindle.sx, pSpindle.sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pSpindle.sx - 11, pSpindle.sy);
    ctx.lineTo(pSpindle.sx + 11, pSpindle.sy);
    ctx.moveTo(pSpindle.sx, pSpindle.sy - 11);
    ctx.lineTo(pSpindle.sx, pSpindle.sy + 11);
    ctx.stroke();

    // 3. Trailing Razor Blade Triangular Tip (▲)
    const angle = -state.headingAngle;
    ctx.save();
    ctx.translate(pTip.sx, pTip.sy);
    ctx.rotate(angle);

    ctx.fillStyle = "#ef4444"; // Crimson Razor Tip
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private drawScaleRuler() {
    const ctx = this.ctx;
    const isMetric = this.unit === "mm";

    const candidateRulers = isMetric
      ? [1, 2, 5, 10, 20, 50, 100, 250, 500]
      : [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];

    const targetPx = 90;
    let rulerVal = candidateRulers[0];
    for (const r of candidateRulers) {
      if (r * this.scale >= targetPx) {
        rulerVal = r;
        break;
      }
    }
    const rulerPx = rulerVal * this.scale;

    const startX = 20;
    const startY = this.height - 24;

    ctx.save();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(startX, startY - 4);
    ctx.lineTo(startX, startY);
    ctx.lineTo(startX + rulerPx, startY);
    ctx.lineTo(startX + rulerPx, startY - 4);
    ctx.stroke();

    ctx.font = "bold 10px ui-monospace, 'Fira Code', Menlo, monospace";
    ctx.fillStyle = "#ffffff";
    const label = `${rulerVal} ${this.unit}`;
    ctx.fillText(label, startX + 4, startY - 6);
    ctx.restore();
  }

  private drawTooltips() {
    const ctx = this.ctx;

    if (this.hoverKnife) {
      const hk = this.hoverKnife;
      const pS = this.toScreen(hk.spindleX, hk.spindleY);
      CADTooltipRenderer.render(ctx, this.width, this.height, {
        anchorX: pS.sx,
        anchorY: pS.sy,
        headerTitle: "DRAG-KNIFE BLADE CASTER ASSEMBLY",
        headerColor: "#fb923c",
        detailLines: [
          `Blade Offset (e) = ${hk.offsetVal.toFixed(3)} ${this.unit}`,
          `Spindle: (${hk.spindleX.toFixed(2)}, ${hk.spindleY.toFixed(2)}) ${this.unit}`,
          `Blade Tip: (${hk.tipX.toFixed(2)}, ${hk.tipY.toFixed(2)}) ${this.unit}`,
          `Heading: ${hk.angleDeg}° tangent to motion path`,
        ],
        footerTip: "Razor tip lags behind spindle center to swivel smoothly through corners.",
      });
    } else if (this.hoverSwivel) {
      const hs = this.hoverSwivel;
      const pP = this.toScreen(hs.pivotX, hs.pivotY);
      CADTooltipRenderer.render(ctx, this.width, this.height, {
        anchorX: pP.sx,
        anchorY: pP.sy,
        headerTitle: `CORNER #${hs.cornerNum} STATIONARY SWIVEL`,
        headerColor: "#06b6d4",
        detailLines: [
          `Corner Vertex: (${hs.pivotX.toFixed(2)}, ${hs.pivotY.toFixed(2)}) ${this.unit}`,
          `Deflection Angle: ${hs.turnAngleDeg.toFixed(1)}° (${hs.direction})`,
          `Pivot Arc Radius: r = ${hs.radius.toFixed(3)} ${this.unit}`,
        ],
        footerTip: "Spindle halts forward cut & pivots around corner point to align with next cut.",
      });
    } else if (this.hoverVertex) {
      const hv = this.hoverVertex;
      const pV = this.toScreen(hv.x, hv.y);
      CADTooltipRenderer.render(ctx, this.width, this.height, {
        anchorX: pV.sx,
        anchorY: pV.sy,
        headerTitle: "TOOLPATH VERTEX NODE",
        headerColor: "#22c55e",
        detailLines: [
          `Point: (${hv.x.toFixed(3)}, ${hv.y.toFixed(3)}) ${this.unit}`,
          `Vertex Node ${hv.segIndex} of ${hv.totalSegs}`,
        ],
      });
    }
  }
}
