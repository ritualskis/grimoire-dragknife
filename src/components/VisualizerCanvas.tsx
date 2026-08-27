import {
  Component,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Contour, SwivelArcInfo } from "../types/dragknife";

interface VisualizerCanvasProps {
  originalContours: Contour[];
  processedContours: Contour[];
  swivelArcs: SwivelArcInfo[];
  bladeOffset: number;
  unit: "mm" | "in";
}

export const VisualizerCanvas: Component<VisualizerCanvasProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  // Viewport Transform State
  const [zoom, setZoom] = createSignal(1.0);
  const [panX, setPanX] = createSignal(0);
  const [panY, setPanY] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [mouseCoord, setMouseCoord] = createSignal<{ x: number; y: number } | null>(null);

  // Layer Toggles
  const [showTarget, setShowTarget] = createSignal(true);
  const [showSpindlePath, setShowSpindlePath] = createSignal(true);
  const [showSwivelArcs, setShowSwivelArcs] = createSignal(true);
  const [showRapids, setShowRapids] = createSignal(true);
  const [showGrid, setShowGrid] = createSignal(true);

  // Calculate Bounding Box of all paths for auto-fit
  const getBounds = () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const checkPt = (x: number, y: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    for (const c of props.originalContours) {
      for (const v of c.vertices) checkPt(v.x, v.y);
    }
    for (const c of props.processedContours) {
      for (const v of c.vertices) checkPt(v.x, v.y);
    }

    if (minX === Infinity) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 100, height: 100 };
    }
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 10),
      height: Math.max(maxY - minY, 10),
    };
  };

  const zoomToFit = () => {
    if (!canvasRef) return;
    const bounds = getBounds();
    const padding = 50;
    const width = canvasRef.width - padding * 2;
    const height = canvasRef.height - padding * 2;

    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    const newZoom = Math.min(scaleX, scaleY, 20.0);

    setZoom(newZoom);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setPanX(canvasRef.width / 2 - centerX * newZoom);
    setPanY(canvasRef.height / 2 + centerY * newZoom);
  };

  const resetView = () => {
    zoomToFit();
  };

  // Convert Screen coordinates to Machine/CAD World coordinates
  const screenToWorld = (sx: number, sy: number) => {
    const z = zoom();
    const wx = (sx - panX()) / z;
    const wy = -(sy - panY()) / z;
    return { x: wx, y: wy };
  };

  // Convert Machine/CAD World coordinates to Screen coordinates
  const worldToScreen = (wx: number, wy: number) => {
    const z = zoom();
    const sx = panX() + wx * z;
    const sy = panY() - wy * z;
    return { x: sx, y: sy };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX(), y: e.clientY - panY() });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const world = screenToWorld(sx, sy);
    setMouseCoord(world);

    if (isDragging()) {
      setPanX(e.clientX - dragStart().x);
      setPanY(e.clientY - dragStart().y);
      draw();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const currentZoom = zoom();
    const nextZoom = Math.max(Math.min(currentZoom * zoomFactor, 200.0), 0.01);

    const mouseWorldX = (mouseScreenX - panX()) / currentZoom;
    const mouseWorldY = -(mouseScreenY - panY()) / currentZoom;

    const nextPanX = mouseScreenX - mouseWorldX * nextZoom;
    const nextPanY = mouseScreenY + mouseWorldY * nextZoom;

    setZoom(nextZoom);
    setPanX(nextPanX);
    setPanY(nextPanY);
    draw();
  };

  const resizeCanvas = () => {
    if (!canvasRef || !containerRef) return;
    canvasRef.width = containerRef.clientWidth;
    canvasRef.height = containerRef.clientHeight;
    draw();
  };

  const draw = () => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    const width = canvasRef.width;
    const height = canvasRef.height;

    // Clear background
    ctx.fillStyle = "#0e1014";
    ctx.fillRect(0, 0, width, height);

    // Draw Grid
    if (showGrid()) {
      drawGrid(ctx, width, height);
    }

    // Draw Coordinate Origin Axes (0,0)
    const origin = worldToScreen(0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();

    // 0. Draw Rapid Traverse (Dashed Gray Lines)
    if (showRapids()) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.setLineDash([4, 4]);

      const pContours = props.processedContours;
      if (pContours.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < pContours.length - 1; i++) {
          const endPt = pContours[i].vertices[pContours[i].vertices.length - 1];
          const nextStartPt = pContours[i + 1].vertices[0];
          const s1 = worldToScreen(endPt.x, endPt.y);
          const s2 = worldToScreen(nextStartPt.x, nextStartPt.y);
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 1. Draw Target Contours (Original Geometry in Green/Cyan)
    if (showTarget()) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#10b981"; // Success Green
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (const c of props.originalContours) {
        if (c.vertices.length < 2) continue;
        ctx.beginPath();
        const start = worldToScreen(c.vertices[0].x, c.vertices[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < c.vertices.length; i++) {
          const pt = worldToScreen(c.vertices[i].x, c.vertices[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        if (c.is_closed) {
          ctx.closePath();
        }
        ctx.stroke();

        // Draw vertex nodes
        ctx.fillStyle = "#10b981";
        for (const v of c.vertices) {
          const pt = worldToScreen(v.x, v.y);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 2. Draw Machine Spindle Path (Leading Offset in Orange)
    if (showSpindlePath()) {
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "#f59e0b"; // Spindle Amber/Orange
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (const c of props.processedContours) {
        if (c.vertices.length < 2) continue;
        ctx.beginPath();
        const start = worldToScreen(c.vertices[0].x, c.vertices[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < c.vertices.length; i++) {
          const pt = worldToScreen(c.vertices[i].x, c.vertices[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
    }

    // 3. Draw Corner Swivel Arcs (Cyan / Magenta)
    if (showSwivelArcs()) {
      for (const arc of props.swivelArcs) {
        const center = worldToScreen(arc.center.x, arc.center.y);
        const start = worldToScreen(arc.start.x, arc.start.y);
        const end = worldToScreen(arc.end.x, arc.end.y);

        // Center stationary pivot dot
        ctx.fillStyle = "#e63946"; // Crimson
        ctx.beginPath();
        ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Swivel arc arc-stroke
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#38bdf8"; // Bright Cyan
        ctx.beginPath();
        const rScreen = props.bladeOffset * zoom();
        const startAngle = -Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x);
        const endAngle = -Math.atan2(arc.end.y - arc.center.y, arc.end.x - arc.center.x);
        const isCCW = arc.direction === "CCW";

        ctx.arc(center.x, center.y, rScreen, startAngle, endAngle, isCCW);
        ctx.stroke();

        // Connectors (blade drag links)
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(start.x, start.y);
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const z = zoom();
    let step = 10;
    if (z > 5) step = 1;
    else if (z > 2) step = 5;
    else if (z < 0.2) step = 100;
    else if (z < 0.8) step = 50;

    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(width, height);

    const startX = Math.floor(topLeft.x / step) * step;
    const endX = Math.ceil(bottomRight.x / step) * step;
    const startY = Math.floor(bottomRight.y / step) * step;
    const endY = Math.ceil(topLeft.y / step) * step;

    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";

    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      const sx = worldToScreen(x, 0).x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = startY; y <= endY; y += step) {
      const sy = worldToScreen(0, y).y;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();
  };

  onMount(() => {
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mouseup", handleMouseUp);
    resizeCanvas();
    zoomToFit();
  });

  onCleanup(() => {
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("mouseup", handleMouseUp);
  });

  createEffect(() => {
    if (props.originalContours || props.processedContours || props.swivelArcs) {
      zoomToFit();
      draw();
    }
  });

  return (
    <div class="surface-card visualizer-container" ref={containerRef}>
      {/* Top Toolbar */}
      <div class="visualizer-toolbar flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="hud-badge-icon">👁️</span>
          <span class="visualizer-title">2D TOOLPATH & SWIVEL INSPECTOR</span>
        </div>

        {/* Layer Toggles */}
        <div class="layer-toggles flex items-center gap-3">
          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showTarget()}
              onChange={(e) => {
                setShowTarget(e.currentTarget.checked);
                draw();
              }}
            />
            <span class="legend-color legend-target"></span>
            <span class="text-xs">Target Cut</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showSpindlePath()}
              onChange={(e) => {
                setShowSpindlePath(e.currentTarget.checked);
                draw();
              }}
            />
            <span class="legend-color legend-spindle"></span>
            <span class="text-xs">Spindle Path</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showSwivelArcs()}
              onChange={(e) => {
                setShowSwivelArcs(e.currentTarget.checked);
                draw();
              }}
            />
            <span class="legend-color legend-swivel"></span>
            <span class="text-xs">Swivel Arcs ({props.swivelArcs.length})</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showRapids()}
              onChange={(e) => {
                setShowRapids(e.currentTarget.checked);
                draw();
              }}
            />
            <span class="text-xs text-secondary">Rapids</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showGrid()}
              onChange={(e) => {
                setShowGrid(e.currentTarget.checked);
                draw();
              }}
            />
            <span class="text-xs text-secondary">Grid</span>
          </label>
        </div>

        {/* View Actions */}
        <div class="flex items-center gap-1">
          <button class="tool-btn" onClick={zoomToFit} title="Zoom to Fit" type="button">
            ⛶ Fit
          </button>
          <button class="tool-btn" onClick={resetView} title="Reset View" type="button">
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div class="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          class="interactive-canvas"
        />

        {/* Floating Coordinate Readout */}
        <Show when={mouseCoord()}>
          {(coord) => (
            <div class="coord-readout surface-glass">
              <span>X: {coord().x.toFixed(3)} {props.unit}</span>
              <span>Y: {coord().y.toFixed(3)} {props.unit}</span>
              <span class="text-secondary">Zoom: {(zoom() * 100).toFixed(0)}%</span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};
