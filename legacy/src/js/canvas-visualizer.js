/**
 * Dragged /// Ritual Skis • 2D Canvas Visualizer & Scrubbable Drag Knife Simulator
 * Renders target geometry, machine spindle offset paths, corner swivels, and live animation.
 */


/**
 * Production-grade Reusable Canvas Tooltip Component
 * Measures exact font metrics via ctx.measureText and auto-sizes box dimensions
 * so text NEVER overflows or wraps past rounded card borders.
 */
class CADTooltipComponent {
  static render(ctx, canvasW, canvasH, opts) {
    const anchorX = opts.anchorX || 100;
    const anchorY = opts.anchorY || 100;
    const headerTitle = opts.headerTitle || "";
    const headerColor = opts.headerColor || "#38bdf8";
    const detailLines = opts.detailLines || [];
    const footerTip = opts.footerTip || null;

    ctx.save();

    // 1. Measure exact text metrics across fonts
    ctx.font = "bold 11px Fira Code, monospace";
    const headerWidth = ctx.measureText(headerTitle).width;

    ctx.font = "11px Fira Code, monospace";
    let maxLineW = headerWidth;
    detailLines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxLineW) maxLineW = w;
    });

    ctx.font = "10px Inter, system-ui, sans-serif";
    const footerW = footerTip ? ctx.measureText(footerTip).width : 0;
    if (footerW > maxLineW) maxLineW = footerW;

    // 2. Compute tight padding box dimensions (GUARANTEED NO OVERFLOW)
    const paddingX = 14;
    const paddingY = 12;
    const boxW = Math.max(270, Math.ceil(maxLineW + paddingX * 2 + 12));
    const totalLines = 1 + detailLines.length + (footerTip ? 1 : 0);
    const lineGap = 18;
    const boxH = Math.ceil(paddingY * 2 + totalLines * lineGap + 4);

    // 3. Clamp card position strictly inside canvas viewports
    let tipX = anchorX + 16;
    let tipY = anchorY - Math.round(boxH / 2);

    if (tipX + boxW > canvasW - 14) tipX = anchorX - boxW - 16;
    if (tipY < 12) tipY = 12;
    if (tipY + boxH > canvasH - 12) tipY = canvasH - boxH - 12;

    // 4. Render translucent dark matte card body
    ctx.fillStyle = "rgba(11, 16, 27, 0.95)";
    ctx.strokeStyle = headerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tipX, tipY, boxW, boxH, 10);
    else ctx.rect(tipX, tipY, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // 5. Accent header line
    ctx.fillStyle = headerColor;
    ctx.fillRect(tipX + 12, tipY, 44, 2.5);

    // 6. Draw text rows safely aligned inside box bounds
    let currY = tipY + 18;

    ctx.font = "bold 11px Fira Code, monospace";
    ctx.fillStyle = headerColor;
    ctx.fillText(headerTitle, tipX + paddingX, currY);
    currY += lineGap;

    ctx.font = "11px Fira Code, monospace";
    ctx.fillStyle = "#ffffff";
    detailLines.forEach(line => {
      ctx.fillText(line, tipX + paddingX, currY);
      currY += lineGap;
    });

    if (footerTip) {
      currY += 2;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(footerTip, tipX + paddingX, currY);
    }

    ctx.restore();
    return { tipX, tipY, boxW, boxH };
  }
}

class CanvasVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Viewport transform
    this.scale = 4.0;
    this.offsetX = 100;
    this.offsetY = 100;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // Visibility layer settings
    this.layers = {
      target: true,
      spindle: true,
      swivels: true,
      vectors: true
    };

    // Data state
    this.contours = [];
    this.spindleSegments = [];
    this.swivels = [];
    this.bladeOffset = 1.6;
    this.boundingBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    // Animation progress (0.0 to 1.0)
    this.simProgress = 0.0;
    this.hoverVertex = null;

    this.bindEvents();
    this.handleResize();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.handleResize());

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - this.offsetX;
      this.dragStartY = e.clientY - this.offsetY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;
        this.render();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const changed = this.updateHoverAtClient(e.clientX, e.clientY);
      if (changed) this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 20 : (e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY);
      const zoomFactor = Math.pow(1.0015, -delta);

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const minScale = 0.2;
      const maxScale = 5000;
      const targetScale = this.scale * zoomFactor;

      // Strict Zoom Depth Boundary Guard: If already at max zoom depth (or min zoom depth), freeze XY camera grid immutably
      if ((targetScale > maxScale && this.scale >= maxScale - 0.001) || (targetScale < minScale && this.scale <= minScale + 0.001)) {
        return;
      }

      const newScale = Math.max(minScale, Math.min(maxScale, targetScale));
      const actualZoomFactor = newScale / this.scale;

      this.offsetX = mouseX - (mouseX - this.offsetX) * actualZoomFactor;
      this.offsetY = mouseY + (this.offsetY - mouseY) * actualZoomFactor;
      this.scale = newScale;

      this.updateZoomDisplay();
      if (this.lastMousePos) {
        this.updateHoverAtClient(this.lastMousePos.clientX, this.lastMousePos.clientY);
      }
      this.render();
    }, { passive: false });
  }

  updateHoverAtClient(clientX, clientY) {
    this.lastMousePos = { clientX, clientY };
    if (!this.contours || this.contours.length === 0) {
      const c = Boolean(this.hoverVertex) || Boolean(this.hoverKnife) || Boolean(this.hoverSwivel);
      this.hoverVertex = null;
      this.hoverKnife = null;
      this.hoverSwivel = null;
      return c;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    // Priority A: Check Machine Spindle (+) Crosshair or Blade Tip (world space coordinates anchor!)
    let knifeFound = null;
    if (this.lastCutterWorldPos) {
      const pS = this.toScreen(this.lastCutterWorldPos.spindleX, this.lastCutterWorldPos.spindleY);
      const pT = this.toScreen(this.lastCutterWorldPos.tipX, this.lastCutterWorldPos.tipY);
      const dSpindle = Math.hypot(mx - pS.sx, my - pS.sy);
      const dTip = Math.hypot(mx - pT.sx, my - pT.sy);
      if (dSpindle < 34 || dTip < 34) {
        knifeFound = {
          spindleX: this.lastCutterWorldPos.spindleX,
          spindleY: this.lastCutterWorldPos.spindleY,
          tipX: this.lastCutterWorldPos.tipX,
          tipY: this.lastCutterWorldPos.tipY,
          offsetVal: this.bladeOffset,
          angleDeg: this.lastCutterWorldPos.angleDeg
        };
      }
    }

    // Priority B: Check Yellow Corner Swivel (+) Markers (world space anchor!)
    let swivelFound = null;
    if (this.layers.swivels && this.swivels && this.swivels.length > 0) {
      let minSDist = 28;
      for (let i = 0; i < this.swivels.length; i++) {
        const sw = this.swivels[i];
        const pPivot = this.toScreen(sw.pivotX, sw.pivotY);
        const dSw = Math.hypot(mx - pPivot.sx, my - pPivot.sy);
        if (dSw < minSDist) {
          minSDist = dSw;
          swivelFound = {
            pivotX: sw.pivotX,
            pivotY: sw.pivotY,
            turnAngleDeg: sw.turnAngleDeg || 0,
            radius: sw.radius || this.bladeOffset,
            cornerNum: i + 1
          };
        }
      }
    }

    // Priority C: Check Curve Segment Node Dots when target layer enabled (world space anchor!)
    let found = null;
    if (this.layers.target && this.contours && this.contours.length > 0) {
      let minDist = 14;
      for (const contour of this.contours) {
        const segs = contour.segments;
        if (!segs) continue;
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const pt = this.toScreen(seg.x2, seg.y2);
          const d = Math.hypot(mx - pt.sx, my - pt.sy);
          if (d < minDist) {
            minDist = d;
            found = {
              x: seg.x2,
              y: seg.y2,
              segIndex: i + 1,
              totalSegs: segs.length
            };
          }
        }
      }
    }

    // Strict Mutually Exclusive Hover Priority Cascade:
    // Knife Caster > Corner Swivel Pivot > Segment Vertex Endpoint Node
    if (knifeFound) {
      swivelFound = null;
      found = null;
    } else if (swivelFound) {
      found = null;
    }

    const vChanged = (Boolean(found) !== Boolean(this.hoverVertex)) || (found && this.hoverVertex && (found.x !== this.hoverVertex.x || found.y !== this.hoverVertex.y));
    const kChanged = (Boolean(knifeFound) !== Boolean(this.hoverKnife));
    const sChanged = (Boolean(swivelFound) !== Boolean(this.hoverSwivel));
    this.hoverVertex = found;
    this.hoverKnife = knifeFound;
    this.hoverSwivel = swivelFound;
    return vChanged || kChanged || sChanged;
  }

  getCssColor(varName, fallback) {
    if (!this._cachedComputedStyles) {
      this._cachedComputedStyles = getComputedStyle(document.documentElement);
    }
    const val = this._cachedComputedStyles.getPropertyValue(varName);
    return val && val.trim() ? val.trim() : fallback;
  }

  handleResize() {
    this._cachedComputedStyles = null; // Invalidate style cache on resize/theme change
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * dpr;
    this.canvas.height = parent.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.render();
  }

  fitToScreen() {
    if (!this.boundingBox) return;
    const pad = 70;
    const contentW = Math.max(10, this.boundingBox.maxX - this.boundingBox.minX);
    const contentH = Math.max(10, this.boundingBox.maxY - this.boundingBox.minY);

    const scaleX = (this.width - pad * 2) / contentW;
    const scaleY = (this.height - pad * 2) / contentH;
    this.scale = Math.min(scaleX, scaleY);
    this.scale = Math.max(0.5, Math.min(60, this.scale));

    // Center content (converting CNC Y-up to canvas Y-down)
    const midX = (this.boundingBox.minX + this.boundingBox.maxX) / 2;
    const midY = (this.boundingBox.minY + this.boundingBox.maxY) / 2;

    this.offsetX = this.width / 2 - midX * this.scale;
    this.offsetY = this.height / 2 + midY * this.scale; // Y-flipped

    this.updateZoomDisplay();
    this.render();
  }

  zoomBy(factor) {
    const midX = this.width / 2;
    const midY = this.height / 2;
    this.offsetX = midX - (midX - this.offsetX) * factor;
    this.offsetY = midY - (midY - this.offsetY) * factor;
    this.scale *= factor;
    this.scale = Math.max(0.05, Math.min(5000, this.scale));
    this.updateZoomDisplay();
    this.render();
  }

  updateZoomDisplay() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round(this.scale * 25)}%`;
  }

  /**
   * Convert physical CNC coordinate (X, Y) to Screen Pixels
   * Note: CNC Coordinate Y goes UP; HTML Canvas Y goes DOWN.
   */
  toScreen(x, y) {
    return {
      sx: this.offsetX + x * this.scale,
      sy: this.offsetY - y * this.scale
    };
  }

    setData(contours, spindleSegments, swivels, boundingBox, bladeOffset, preserveZoom = false, unitStr = 'G20') {
    this.unitStr = unitStr;
    this.contours = contours || [];
    this.spindleSegments = spindleSegments || [];
    this.swivels = swivels || [];
    this.boundingBox = boundingBox;
    this.bladeOffset = bladeOffset;
    this._cumDists = null; // Invalidate cached arc-length index table
    if (!preserveZoom || this.offsetX === 0 && this.offsetY === 0) {
      this.fitToScreen();
    } else {
      this.render();
    }
  }

  setLayerVisibility(layers) {
    this.layers = { ...this.layers, ...layers };
    this.render();
  }

  setSimulationProgress(progress) {
    this.simProgress = Math.max(0, Math.min(1, progress));
    this.render();
  }

  /**
   * Main Render Loop
   */
  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Draw Dark Engineering Grid
    this.drawGrid();

    // 1. LAYER: Desired Material Target Cut Profile (Vibrant Green)
    if (this.layers.target) {
      this.drawTargetCutProfile();
    }

    // 2. LAYER: Compensated Machine Spindle Center Path (Safety Orange)
    if (this.layers.spindle) {
      this.drawMachineSpindlePath();
    }

    // 3. LAYER: Stationary Corner Swivel Arcs & Markers (Cyan)
    if (this.layers.swivels) {
      this.drawSwivelPivotMarkers();
    }

    // 4. LAYER: Blade Trailing Caster Vector Lines
    if (this.layers.vectors) {
      this.drawBladeVectors();
    }

    // 5. ANIMATED SIMULATION BLADE AT CURRENT TIME STEP
    this.drawAnimatedDragKnife();
    this.drawCornerScaleRuler();
    this.drawHoverVertexTooltip();
    this.drawHoverKnifeTooltip();
    this.drawHoverSwivelTooltip();
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;

    // Determine active document coordinate unit string
    const activeUnitStr = this.unitStr || (typeof MasterUnitController !== 'undefined' ? MasterUnitController.activeUnit : (window.MasterUnitController ? window.MasterUnitController.activeUnit : 'G20'));
    const isMetric = activeUnitStr === 'G21';
    const unitLabel = isMetric ? 'mm' : 'in';

    // Calculate adaptive grid spacing based on zoom level
    // GUARANTEED LARGE GRID SQUARES: Enforce minimum 125 screen pixels per grid square
    const minSquarePx = 70; // Goldilocks middle-ground: splits difference between dense graph-paper and oversized boxes
    const candidateSteps = isMetric
      ? [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500]
      : [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1.0, 2.0, 5.0, 10.0, 25.0];

    let gridSpacing = candidateSteps[candidateSteps.length - 1];
    for (let i = 0; i < candidateSteps.length; i++) {
      if (candidateSteps[i] * this.scale >= minSquarePx) {
        gridSpacing = candidateSteps[i];
        break;
      }
    }
    this.currentGridSpacing = gridSpacing;
    this.currentUnitLabel = isMetric ? 'mm' : 'in';

    this.currentGridSpacing = gridSpacing;

    // Update floating HUD badge text
    const pitchEl = document.getElementById('legend-grid-pitch');
    if (pitchEl) {
      const fmtVal = isMetric ? (gridSpacing >= 1 ? gridSpacing.toFixed(0) : gridSpacing.toFixed(1)) : gridSpacing.toFixed(gridSpacing < 0.05 ? 3 : 2);
      pitchEl.textContent = '1 square = ' + fmtVal + ' ' + unitLabel;
    }

    const screenStep = gridSpacing * this.scale;
    const startX = (this.offsetX % screenStep);
    const startY = (this.offsetY % screenStep);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.beginPath();
    for (let x = startX; x < this.width; x += screenStep) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
    }
    for (let y = startY; y < this.height; y += screenStep) {
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // Draw Origin (0,0) axes
    const origin = this.toScreen(0, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(219, 232, 54, 0.3)';
    ctx.beginPath();
    ctx.moveTo(origin.sx - 20, origin.sy); ctx.lineTo(origin.sx + 40, origin.sy);
    ctx.moveTo(origin.sx, origin.sy - 40); ctx.lineTo(origin.sx, origin.sy + 20);
    ctx.stroke();

    ctx.fillStyle = 'rgba(219, 232, 54, 0.65)';
    ctx.font = '10px Fira Code';
    ctx.fillText('X', origin.sx + 44, origin.sy + 3);
    ctx.fillText('Y', origin.sx - 3, origin.sy - 44);

    ctx.restore();
  }

  /**
   * Draw target cut geometry (Green tip cut target)
   */
  drawTargetCutProfile() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = Math.max(2.4, 3.4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const contour of this.contours) {
      const segs = contour.segments;
      if (!segs || segs.length === 0) continue;

      // Only draw pure clean crisp vector contour outline without accidental open path webbing
      const p0 = this.toScreen(segs[0].x1, segs[0].y1);

      // Electric Blaze Orange (#df3800) CAD Wireframe Contour Stroke
      ctx.strokeStyle = this.getCssColor('--cad-target-green', '#00e676');
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      for (const seg of segs) {
        const pEnd = this.toScreen(seg.x2, seg.y2);
        ctx.lineTo(pEnd.sx, pEnd.sy);
      }
      ctx.stroke();

      // CAD Intersection Dot Nodes
      ctx.shadowBlur = 0;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const pt = this.toScreen(seg.x2, seg.y2);
        ctx.fillStyle = '#14b8a6';
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Inner white node center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Draw compensated CNC machine spindle centerline path (Orange)
   */
  drawMachineSpindlePath() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.getCssColor('--cad-spindle-orange', '#ff6600');
    ctx.lineWidth = Math.max(1.5, 2.2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (const seg of this.spindleSegments) {
      if (seg.type === 'RAPID') {
        ctx.stroke();
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        const p1 = this.toScreen(seg.x1, seg.y1);
        const p2 = this.toScreen(seg.x2, seg.y2);
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
      } else if (seg.type === 'LEAD') {
        const p1 = this.toScreen(seg.x1, seg.y1);
        const p2 = this.toScreen(seg.x2, seg.y2);
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
      } else if (seg.type === 'CUT' || seg.type === 'OVERCUT' || seg.type === 'SWIVEL_LINE') {
        const p1 = this.toScreen(seg.x1, seg.y1);
        const p2 = this.toScreen(seg.x2, seg.y2);
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
      } else if (seg.type === 'SWIVEL_ARC' || seg.type === 'LEAD_ARC' || seg.type === 'LEAD_OUT_ARC') {
        const center = this.toScreen(seg.pivotX, seg.pivotY);
        const rScr = seg.radius * this.scale;
        // In screen coords (Y flipped), CW and CCW angles swap sign
        const startAngScr = -seg.startAngle;
        const endAngScr = -seg.endAngle;

        ctx.arc(center.sx, center.sy, rScr, startAngScr, endAngScr, !seg.isCW);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawCornerScaleRuler() {
    const activeUnitStr = this.unitStr || (typeof MasterUnitController !== 'undefined' ? MasterUnitController.activeUnit : (window.MasterUnitController ? window.MasterUnitController.activeUnit : 'G20'));
    const isMetric = activeUnitStr === 'G21';
    const unitLabel = isMetric ? 'mm' : 'in';
    const gridSpacing = this.currentGridSpacing || (isMetric ? 5 : 0.25);
    const squarePx = gridSpacing * this.scale;
    if (squarePx < 4 || isNaN(squarePx)) return;

    const ctx = this.ctx;
    ctx.save();

    // Position graphical CAD scale ruler in bottom-right corner above simulation player
    const rulerBarWidth = Math.min(squarePx, this.width * 0.45);
    const boxW = Math.max(140, rulerBarWidth + 36);
    const boxH = 48;
    const rightMargin = 18;
    const bottomMargin = 82;

    const boxX = this.width - boxW - rightMargin;
    const boxY = this.height - boxH - bottomMargin;

    // Translucent dark matte panel pill
    ctx.fillStyle = 'rgba(14, 17, 26, 0.93)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 10);
    else ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // Graphical bracket matching 1 grid square on screen
    const rulerStartX = boxX + (boxW - rulerBarWidth) / 2;
    const rulerEndX = rulerStartX + rulerBarWidth;
    const lineY = boxY + 20;
    const tickH = 6;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(rulerStartX, lineY);
    ctx.lineTo(rulerEndX, lineY);
    ctx.moveTo(rulerStartX, lineY - tickH);
    ctx.lineTo(rulerStartX, lineY + tickH);
    ctx.moveTo(rulerStartX + rulerBarWidth * 0.5, lineY - tickH * 0.6);
    ctx.lineTo(rulerStartX + rulerBarWidth * 0.5, lineY + tickH * 0.6);
    ctx.moveTo(rulerEndX, lineY - tickH);
    ctx.lineTo(rulerEndX, lineY + tickH);
    ctx.stroke();

    const ufs = window.UnitFormatService;
    const labelText = ufs
      ? ufs.formatCornerScaleRulerText(gridSpacing, activeUnitStr)
      : ('1 Square = ' + (gridSpacing < 0.01 ? gridSpacing.toFixed(3) : (gridSpacing % 1 === 0 ? gridSpacing.toFixed(0) : gridSpacing.toString())) + ' ' + unitLabel);

    ctx.fillStyle = '#f2f4f8';
    ctx.font = '600 11px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, boxX + boxW / 2, boxY + 38);

    ctx.restore();
  }

  /**
   * Draw Stationary Corner Swivel Arc Rings & Angle Annotations (Cyan)
   */
  drawSwivelPivotMarkers() {
    const ctx = this.ctx;
    ctx.save();

    for (const sw of this.swivels) {
      const pPivot = this.toScreen(sw.pivotX, sw.pivotY);
      const pStart = this.toScreen(sw.startSpindleX, sw.startSpindleY);
      const pEnd = this.toScreen(sw.endSpindleX, sw.endSpindleY);
      const rScr = Math.max(5, sw.radius * this.scale);
      const isHovered = this.hoverSwivel && this.hoverSwivel.pivotX === sw.pivotX && this.hoverSwivel.pivotY === sw.pivotY;

      // CAD Smart LOD (Level-of-Detail): Adapt detail density based on zoomed screen circle size (rScr px)
      // Low Zoom (rScr < 16px): Hide outer guidelines and text tags to keep trajectory silhouette ultra-crisp
      const showGuidelines = rScr >= 16 || isHovered;
      const showDegreeTag = rScr >= 26 || isHovered;

      if (showGuidelines) {
        // Draw radius circle guideline around vertex point (Yellow Guideline)
        ctx.strokeStyle = this.getCssColor('--cad-swivel-yellow-subtle', 'rgba(250, 204, 21, 0.35)');
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pPivot.sx, pPivot.sy, rScr, 0, Math.PI * 2);
        ctx.stroke();

        // Radial arms from pivot center to spindle entry & exit
        ctx.strokeStyle = this.getCssColor('--cad-swivel-yellow-subtle', 'rgba(250, 204, 21, 0.50)');
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pPivot.sx, pPivot.sy); ctx.lineTo(pStart.sx, pStart.sy);
        ctx.moveTo(pPivot.sx, pPivot.sy); ctx.lineTo(pEnd.sx, pEnd.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Filled accent arc for swivel swing (ELECTRIC CYBER YELLOW)
      ctx.strokeStyle = this.getCssColor('--cad-swivel-yellow', '#facc15');
      ctx.lineWidth = showGuidelines ? 3.5 : 2.2;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(pPivot.sx, pPivot.sy, rScr, -sw.entryAngle, -sw.exitAngle, sw.deltaAngleDeg < 0);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pivot dot stationary tip marker (Yellow Center Pivot Pin)
      ctx.fillStyle = this.getCssColor('--cad-swivel-yellow', '#facc15');
      ctx.beginPath();
      ctx.arc(pPivot.sx, pPivot.sy, showGuidelines ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fill();

      // Swivel angle degree tag (only displayed when zoomed in high enough rScr >= 26px or actively hovered)
      if (showDegreeTag) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 10px "Fira Code", monospace';
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 3;
        const degStr = (sw.deltaAngleDeg > 0 ? '+' : '') + sw.deltaAngleDeg + "°";
        ctx.fillText(degStr, pPivot.sx + rScr + 6, pPivot.sy - 3);
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }

  /**
   * Draw light drag vector connectors showing blade trailing geometry
   */
  drawBladeVectors() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 64, 129, 0.22)';
    ctx.lineWidth = 1;

    for (const seg of this.spindleSegments) {
      if (seg.type === 'CUT' && seg.tipX2 !== undefined) {
        const pSpindle = this.toScreen(seg.x2, seg.y2);
        const pTip = this.toScreen(seg.tipX2, seg.tipY2);
        ctx.beginPath();
        ctx.moveTo(pSpindle.sx, pSpindle.sy);
        ctx.lineTo(pTip.sx, pTip.sy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Compute blade dynamic state (spindle position & tip position) at simulation timestamp T
   * Uniform arc-length parameterized across total physical travel distance.
   */
  getSimulationStateAt(tFraction) {
    if (!this.spindleSegments || this.spindleSegments.length === 0) return null;

    // Compute cumulative arc length table for uniform velocity scrub playback
    if (!this._cumDists || this._cumDists.length !== this.spindleSegments.length) {
      this._cumDists = [];
      let runSum = 0;
      for (let i = 0; i < this.spindleSegments.length; i++) {
        const s = this.spindleSegments[i];
        let len = 0;
        if (s.type === 'SWIVEL_ARC' || s.type === 'LEAD_ARC' || s.type === 'LEAD_OUT_ARC') {
          len = (s.radius || this.bladeOffset) * Math.abs(s.deltaAngle || (s.endAngle - s.startAngle) || 0);
        } else {
          len = Math.hypot((s.x2 || 0) - (s.x1 || 0), (s.y2 || 0) - (s.y1 || 0));
        }
        runSum += Math.max(0.00001, len);
        this._cumDists.push(runSum);
      }
      this._totalTravelDist = runSum;
    }

    const totalDist = this._totalTravelDist || 1;
    const targetDist = Math.max(0, Math.min(1, tFraction)) * totalDist;

    // Binary search segment corresponding to cumulative distance
    let index = 0;
    let prevCum = 0;
    for (let i = 0; i < this._cumDists.length; i++) {
      if (this._cumDists[i] >= targetDist) {
        index = i;
        prevCum = i > 0 ? this._cumDists[i - 1] : 0;
        break;
      }
      if (i === this._cumDists.length - 1) {
        index = i;
        prevCum = i > 0 ? this._cumDists[i - 1] : 0;
      }
    }

    const seg = this.spindleSegments[index];
    if (!seg) return null;

    const segLen = Math.max(0.00001, this._cumDists[index] - prevCum);
    const subFrac = Math.max(0, Math.min(1, (targetDist - prevCum) / segLen));

    let spindleX = seg.x1;
    let spindleY = seg.y1;
    let tipX = seg.x1;
    let tipY = seg.y1;
    let headingAngle = 0;
    let isSwiveling = false;
    let currentCornerIndex = 0;

    if (seg.type === 'RAPID') {
      spindleX = seg.x1 + (seg.x2 - seg.x1) * subFrac;
      spindleY = seg.y1 + (seg.y2 - seg.y1) * subFrac;
      headingAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
      tipX = spindleX - this.bladeOffset * Math.cos(headingAngle);
      tipY = spindleY - this.bladeOffset * Math.sin(headingAngle);

    } else if (seg.type === 'LEAD' || seg.type === 'CUT' || seg.type === 'OVERCUT' || seg.type === 'SWIVEL_LINE') {
      spindleX = seg.x1 + (seg.x2 - seg.x1) * subFrac;
      spindleY = seg.y1 + (seg.y2 - seg.y1) * subFrac;

      if (seg.tipX1 !== undefined && seg.tipX2 !== undefined) {
        // Use exact nominal material cut edge points stored during post-processing
        tipX = seg.tipX1 + (seg.tipX2 - seg.tipX1) * subFrac;
        tipY = seg.tipY1 + (seg.tipY2 - seg.tipY1) * subFrac;
        headingAngle = seg.angle !== undefined ? seg.angle : Math.atan2(spindleY - tipY, spindleX - tipX);
      } else {
        headingAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
        if (seg.angle !== undefined) headingAngle = seg.angle;
        tipX = spindleX - this.bladeOffset * Math.cos(headingAngle);
        tipY = spindleY - this.bladeOffset * Math.sin(headingAngle);
      }

    } else if (seg.type === 'SWIVEL_ARC' || seg.type === 'LEAD_ARC' || seg.type === 'LEAD_OUT_ARC') {
      isSwiveling = (seg.type === 'SWIVEL_ARC');
      if (seg.type === 'SWIVEL_ARC') {
        const dAng = seg.deltaAngle !== undefined ? seg.deltaAngle : (seg.endAngle - seg.startAngle);
        headingAngle = seg.startAngle + dAng * subFrac;
        tipX = seg.pivotX;
        tipY = seg.pivotY;
        spindleX = tipX + seg.radius * Math.cos(headingAngle);
        spindleY = tipY + seg.radius * Math.sin(headingAngle);
      } else {
        // Polar position along circular arc centered at pivotX, pivotY
        const dPolar = seg.deltaAngle !== undefined ? seg.deltaAngle : (seg.endAngle - seg.startAngle);
        const polar = seg.startAngle + dPolar * subFrac;
        spindleX = seg.pivotX + seg.radius * Math.cos(polar);
        spindleY = seg.pivotY + seg.radius * Math.sin(polar);

        // Knife blade heading angle smoothly merging into path
        if (seg.startHeading !== undefined && seg.endHeading !== undefined) {
          let dHeading = seg.endHeading - seg.startHeading;
          while (dHeading > Math.PI) dHeading -= 2 * Math.PI;
          while (dHeading < -Math.PI) dHeading += 2 * Math.PI;
          headingAngle = seg.startHeading + dHeading * subFrac;
        } else {
          headingAngle = polar + (seg.isCW ? -Math.PI / 2 : Math.PI / 2);
        }
        tipX = spindleX - this.bladeOffset * Math.cos(headingAngle);
        tipY = spindleY - this.bladeOffset * Math.sin(headingAngle);
      }
    }

    let z = seg.z !== undefined ? seg.z : (seg.type === 'RAPID' ? (this.unitStr === 'G20' ? 0.20 : 5.0) : (this.unitStr === 'G20' ? -0.055 : -1.40));
    let isRapid = (seg.type === 'RAPID');

    return {
      spindleX,
      spindleY,
      tipX,
      tipY,
      z,
      headingAngle,
      isSwiveling,
      isRapid,
      stepIndex: index,
      totalSteps: this.spindleSegments.length
    };
  }

  /**
   * Draw high-detail physical Drag-Knife Assembly & Razor Blade at scrubbed frame
   */
  drawAnimatedDragKnife() {
    const state = this.getSimulationStateAt(this.simProgress);
    if (!state) return;

    const ctx = this.ctx;
    const pSpindle = this.toScreen(state.spindleX, state.spindleY);
    const pTip = this.toScreen(state.tipX, state.tipY);
    this.lastCutterWorldPos = { spindleX: state.spindleX, spindleY: state.spindleY, tipX: state.tipX, tipY: state.tipY, angleDeg: Math.round(state.headingAngle * 180 / Math.PI) };

    ctx.save();

    const uLabel = this.unitStr === 'G20' ? 'in' : 'mm';
    const zVal = state.z !== undefined ? state.z : -1.40;
    const zFormatted = (zVal >= 0 ? '+' : '') + zVal.toFixed(this.unitStr === 'G20' ? 3 : 2) + ' ' + uLabel;

    // Update status footer text
    const statusEl = document.getElementById('sim-status-text');
    if (statusEl) {
      if (state.isRapid) {
        statusEl.textContent = `RAPID AIR TRANSIT (Z-LIFTED): X=${state.spindleX.toFixed(2)} Y=${state.spindleY.toFixed(2)} | Z=${zFormatted} (Safe Clearance)`;
        statusEl.style.color = this.getCssColor('--cad-text-muted', '#94a3b8');
      } else if (state.isSwiveling) {
        statusEl.textContent = `CORNER SWIVEL IN PROGRESS: Blade tip pinned at (${state.tipX.toFixed(2)}, ${state.tipY.toFixed(2)}) | Z=${zFormatted} (Micro-Lift)`;
        statusEl.style.color = this.getCssColor('--cad-text-accent', '#5eead4');
      } else {
        statusEl.textContent = `Cutting profile: X=${state.tipX.toFixed(2)} Y=${state.tipY.toFixed(2)} | Z=${zFormatted} [CUT DEPTH] | Blade angle: ${Math.round(state.headingAngle * 180 / Math.PI)}°`;
        statusEl.style.color = this.getCssColor('--cad-text-accent', '#5eead4');
      }
    }

    // If rapid in air, render blade semi-transparent to visually indicate Z-lifted state
    if (state.isRapid) {
      ctx.globalAlpha = 0.45;
    }

    // 1. Blade Body Rigid Bar connecting Spindle Axis to Blade Edge Tip
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, 4.5);
    ctx.lineCap = 'round';
    if (state.isRapid) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pSpindle.sx, pSpindle.sy);
    ctx.lineTo(pTip.sx, pTip.sy);
    ctx.stroke();
    if (state.isRapid) ctx.setLineDash([]);

    // 2. Trailing Razor Blade Wedge Shape (Red sharp triangle cut tip)
    const armPx = Math.hypot(pTip.sx - pSpindle.sx, pTip.sy - pSpindle.sy);
    const bladeAngle = Math.atan2(pTip.sy - pSpindle.sy, pTip.sx - pSpindle.sx);
    // Dynamic Proportional Razor Wedge Tip: Proportioned to screen caster arm length so icon never overwhelms small offsets like 1/16"
    const wedgeLen = Math.max(3.5, Math.min(15, armPx * 0.70));
    const wedgeWidth = wedgeLen * 0.40;

    ctx.save();
    ctx.translate(pTip.sx, pTip.sy);
    ctx.rotate(bladeAngle);

    // Razor Blade silhouette
    ctx.fillStyle = '#ff3366';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0); // Tip point piercing material
    ctx.lineTo(-wedgeLen, -wedgeWidth);
    ctx.lineTo(-wedgeLen * 0.85, 0);
    ctx.lineTo(-wedgeLen, wedgeWidth);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Machine Spindle Center Ring Assembly (Glowing Orange Axis Center)
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(pSpindle.sx, pSpindle.sy, Math.max(6, 8), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Crosshair target in machine center
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pSpindle.sx - 5, pSpindle.sy); ctx.lineTo(pSpindle.sx + 5, pSpindle.sy);
    ctx.moveTo(pSpindle.sx, pSpindle.sy - 5); ctx.lineTo(pSpindle.sx, pSpindle.sy + 5);
    ctx.stroke();

    // Trailing e= crude banner removed; hover inspection component explains drag-knife offset on demand

    ctx.restore();
  }

  /**
   * Draw interactive explanation hover tooltip over G-code segment endpoint nodes
   */
    drawHoverVertexTooltip() {
    if (!this.hoverVertex) return;
    const hv = this.hoverVertex;
    const ctx = this.ctx;
    const pt = this.toScreen(hv.x, hv.y);
    const activeUnitStr = this.unitStr || (typeof MasterUnitController !== "undefined" ? MasterUnitController.activeUnit : "G20");
    const isMetric = activeUnitStr === "G21";
    const uLabel = isMetric ? "mm" : "in";

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, 7.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const fmtX = isMetric ? hv.x.toFixed(2) : hv.x.toFixed(4);
    const fmtY = isMetric ? hv.y.toFixed(2) : hv.y.toFixed(4);

    CADTooltipComponent.render(ctx, this.width, this.height, {
      anchorX: pt.sx,
      anchorY: pt.sy,
      headerTitle: "G-CODE CURVE VERTEX ENDPOINT",
      headerColor: "#38bdf8",
      detailLines: [
        `Pt (${fmtX}, ${fmtY}) ${uLabel} • G1 Move ${hv.segIndex}/${hv.totalSegs}`
      ],
      footerTip: "CAM tools (Easel) tessellate curves into linear G1 segments."
    });
  }

  /**
   * Draw human-friendly Drag-Knife Caster Assembly hover tooltip explaining Blade Offset e
   * Dynamically re-projected from world coordinates so zooming never breaks hover positioning!
   */
  drawHoverKnifeTooltip() {
    if (!this.hoverKnife) return;
    const hk = this.hoverKnife;
    const ctx = this.ctx;
    const livePos = (this.lastCutterWorldPos && this.hoverKnife) ? this.lastCutterWorldPos : hk;
    const pSpindle = this.toScreen(livePos.spindleX, livePos.spindleY);
    const activeUnitStr = this.unitStr || (typeof MasterUnitController !== "undefined" ? MasterUnitController.activeUnit : "G20");
    const isMetric = activeUnitStr === "G21";
    const uLabel = isMetric ? "mm" : "in";
    const eInches = isMetric ? (hk.offsetVal / 25.4) : hk.offsetVal;
    const eMM = isMetric ? hk.offsetVal : (hk.offsetVal * 25.4);

    ctx.save();
    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pSpindle.sx, pSpindle.sy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    CADTooltipComponent.render(ctx, this.width, this.height, {
      anchorX: pSpindle.sx,
      anchorY: pSpindle.sy,
      headerTitle: "DRAG-KNIFE BLADE CASTER ASSEMBLY",
      headerColor: "#fb923c",
      detailLines: [
        `Blade Offset (e) = ${eInches.toFixed(3)}" (${eMM.toFixed(2)} mm)`,
        `Distance between Spindle Center (+) and Razor Tip (▲)`,
        `Heading: ${hk.angleDeg}° tangent to motion path`
      ],
      footerTip: "Blade caster e lets the razor swivel tangent through corners without tearing."
    });
  }

  /**
   * Draw yellow corner swivel pivot (+) hover tooltip explaining stationary swivel arcs
   * Dynamically re-projected from world coordinates so zooming never breaks hover positioning!
   */
  drawHoverSwivelTooltip() {
    if (!this.hoverSwivel) return;
    const hs = this.hoverSwivel;
    const ctx = this.ctx;
    const pPivot = this.toScreen(hs.pivotX, hs.pivotY);
    const activeUnitStr = this.unitStr || (typeof MasterUnitController !== "undefined" ? MasterUnitController.activeUnit : "G20");
    const isMetric = activeUnitStr === "G21";
    const uLabel = isMetric ? "mm" : "in";
    const px = isMetric ? hs.pivotX.toFixed(2) : hs.pivotX.toFixed(4);
    const py = isMetric ? hs.pivotY.toFixed(2) : hs.pivotY.toFixed(4);
    const rVal = isMetric ? hs.radius.toFixed(2) : hs.radius.toFixed(3);

    ctx.save();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pPivot.sx, pPivot.sy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const signStr = hs.turnAngleDeg > 0 ? "+" : "";
    CADTooltipComponent.render(ctx, this.width, this.height, {
      anchorX: pPivot.sx,
      anchorY: pPivot.sy,
      headerTitle: "STATIONARY CORNER SWIVEL PIVOT (+)",
      headerColor: "#facc15",
      detailLines: [
        `Corner Vertex: (${px}, ${py}) ${uLabel}`,
        `Sharp Corner Angle (Δθ): ${signStr}${hs.turnAngleDeg}° turn`,
        `Swivel Pivot Arc Radius: r = ${rVal} ${uLabel}`
      ],
      footerTip: "Spindle pauses at point + while blade pivots to align with outgoing leg."
    });
  }
}

window.CanvasVisualizer = CanvasVisualizer;
