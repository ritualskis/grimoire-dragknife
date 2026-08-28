import {
  Component,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Contour, SheetConfig, SwivelArcInfo, Unit } from "../types/dragknife";
import {
  GrimoirePlotter2D,
  DragKnifePlotterAdapter,
  type LiveMotionTelemetry,
} from "@grimoire/plotter-2d";

interface VisualizerCanvasProps {
  originalContours: Contour[];
  processedContours: Contour[];
  swivelArcs: SwivelArcInfo[];
  bladeOffset: number;
  unit: Unit;
  sheetConfig?: SheetConfig;
}

export const VisualizerCanvas: Component<VisualizerCanvasProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let plotter: GrimoirePlotter2D | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [simProgress, setSimProgress] = createSignal(0.0);
  const [speedMultiplier, setSpeedMultiplier] = createSignal(1.0);
  const [mouseCoord, setMouseCoord] = createSignal<{ x: number; y: number } | null>(null);

  // Layer state signals
  const [showTarget, setShowTarget] = createSignal(true);
  const [showSpindle, setShowSpindle] = createSignal(true);
  const [showSwivels, setShowSwivels] = createSignal(true);
  const [showRapids, setShowRapids] = createSignal(true);
  const [showGrid, setShowGrid] = createSignal(true);

  let wrapperRef: HTMLDivElement | undefined;
  let resizeRaf: number | null = null;
  const handleResize = () => {
    if (!wrapperRef || !plotter) return;
    if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      if (!wrapperRef || !plotter) return;
      const w = wrapperRef.clientWidth;
      const h = wrapperRef.clientHeight;
      if (w > 0 && h > 0) {
        plotter.resize(w, h);
      }
    });
  };

  const updatePlotterData = (autoFit = false) => {
    if (!plotter) return;

    plotter.setUnit(props.unit);
    plotter.setToolhead({
      type: "dragknife",
      bladeOffset: props.bladeOffset,
      toleranceAngleDeg: 20,
      swivelLiftHeight: 0.5,
    });

    const targetGeometry = DragKnifePlotterAdapter.contoursToGeometry(
      props.originalContours.map((c) => ({
        id: String(c.id),
        vertices: c.vertices,
        is_closed: c.is_closed,
        cut_depth: 0,
      })),
      "target_contours",
    );

    const spindleSegments = DragKnifePlotterAdapter.contoursToToolpaths(
      props.processedContours.map((c) => ({
        id: String(c.id),
        vertices: c.vertices,
        is_closed: c.is_closed,
        cut_depth: 0,
      })),
      1500,
      "spindle_path",
    );

    const swivelSegments = DragKnifePlotterAdapter.swivelsToToolpaths(
      props.swivelArcs.map((sw) => ({
        center: sw.center,
        start: sw.start,
        end: sw.end,
        radius: sw.radius,
        angle_deg: sw.angle_deg,
        direction: sw.direction === "CW" ? "CW" : "CCW",
      })),
      "swivels",
    );

    if (props.sheetConfig) {
      plotter.setSheetConfig(props.sheetConfig, false);
    }

    plotter.loadGeometry(targetGeometry, false);
    plotter.loadToolpath([...spindleSegments, ...swivelSegments], autoFit);
  };

  onMount(() => {
    if (!canvasRef || !wrapperRef) return;
    const initW = wrapperRef.clientWidth > 0 ? wrapperRef.clientWidth : 800;
    const initH = wrapperRef.clientHeight > 0 ? wrapperRef.clientHeight : 500;

    plotter = new GrimoirePlotter2D(canvasRef, {
      unit: props.unit,
      toolhead: {
        type: "dragknife",
        bladeOffset: props.bladeOffset,
        toleranceAngleDeg: 20,
        swivelLiftHeight: 0.5,
      },
    });

    if (props.sheetConfig) {
      plotter.setSheetConfig(props.sheetConfig, false);
    }

    plotter.resize(initW, initH);

    plotter.on("telemetry", (t: LiveMotionTelemetry) => {
      setSimProgress(t.progress);
    });

    plotter.on("hover", (data: any) => {
      if (data && data.worldPos) {
        setMouseCoord(data.worldPos);
      }
    });

    updatePlotterData(true);

    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(wrapperRef);

    window.addEventListener("resize", handleResize);
  });

  onCleanup(() => {
    if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener("resize", handleResize);
    if (plotter) plotter.pausePlayback();
  });

  createEffect(() => {
    if (plotter) {
      plotter.layerManager.setLayerVisibility("target_contours", showTarget());
      plotter.layerManager.setLayerVisibility("spindle_path", showSpindle());
      plotter.layerManager.setLayerVisibility("swivels", showSwivels());
      plotter.layerManager.setLayerVisibility("rapids", showRapids());
      plotter.isGridVisible = showGrid();
      if (props.sheetConfig) {
        plotter.setSheetConfig(props.sheetConfig, false);
      }
      plotter.render();
    }
  });

  createEffect(() => {
    if (plotter) {
      updatePlotterData(false);
    }
  });

  const togglePlay = () => {
    if (!plotter) return;
    const next = !isPlaying();
    setIsPlaying(next);
    if (next) {
      plotter.playbackEngine.speedMultiplier = speedMultiplier();
      plotter.startPlayback();
    } else {
      plotter.pausePlayback();
    }
  };

  const handleSpeedChange = (mult: number) => {
    setSpeedMultiplier(mult);
    if (plotter) {
      plotter.playbackEngine.speedMultiplier = mult;
    }
  };

  const handleScrubberInput = (val: number) => {
    setSimProgress(val);
    if (plotter) plotter.scrubTo(val);
  };

  const zoomToFit = () => plotter?.fitView();
  const zoomIn = () => plotter?.zoomAt(plotter.width / 2, plotter.height / 2, 1.25);
  const zoomOut = () => plotter?.zoomAt(plotter.width / 2, plotter.height / 2, 0.8);

  return (
    <div class="spark-visualizer-container flex flex-col flex-1 relative" ref={containerRef}>
      {/* Interactive Canvas Viewport */}
      <div class="canvas-wrapper flex-1 relative" ref={wrapperRef}>
        <canvas ref={canvasRef} class="interactive-canvas" />

        {/* Top-Right Spark View Mode & Zoom Controls */}
        <div class="spark-canvas-top-controls flex items-center gap-1.5 absolute top-3 right-3 z-10">
          <button type="button" class="spark-viewmode-btn active" title="2D Orthogonal View">
            2D
          </button>
          <button type="button" class="spark-zoom-icon-btn" onClick={zoomIn} title="Zoom In (+)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button type="button" class="spark-zoom-icon-btn" onClick={zoomOut} title="Zoom Out (-)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button type="button" class="spark-zoom-icon-btn" onClick={zoomToFit} title="Zoom to Fit Sheet & Vectors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 9v6M3 9v6" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </svg>
          </button>
        </div>

        {/* Top-Left Layer Badges */}
        <div class="spark-layer-pills flex items-center gap-1.5 absolute top-3 left-3 z-10">
          <button
            type="button"
            class={`spark-layer-pill ${showTarget() ? "active" : ""}`}
            onClick={() => setShowTarget(!showTarget())}
            title="Toggle Target Cut Shape"
          >
            <span class="legend-dot legend-target" />
            <span>Target Contour</span>
          </button>

          <button
            type="button"
            class={`spark-layer-pill ${showSpindle() ? "active" : ""}`}
            onClick={() => setShowSpindle(!showSpindle())}
            title="Toggle Spindle Center Offset Toolpath"
          >
            <span class="legend-dot legend-spindle" />
            <span>Spindle Path</span>
          </button>

          <button
            type="button"
            class={`spark-layer-pill ${showSwivels() ? "active" : ""}`}
            onClick={() => setShowSwivels(!showSwivels())}
            title="Toggle Swivel Arcs"
          >
            <span class="legend-dot legend-swivel" />
            <span>Swivels</span>
          </button>

          <button
            type="button"
            class={`spark-layer-pill ${showRapids() ? "active" : ""}`}
            onClick={() => setShowRapids(!showRapids())}
            title="Toggle Rapid Moves"
          >
            <span class="legend-dot legend-rapid" />
            <span>Rapids</span>
          </button>

          <button
            type="button"
            class={`spark-layer-pill ${showGrid() ? "active" : ""}`}
            onClick={() => setShowGrid(!showGrid())}
            title="Toggle Grid"
          >
            <span>Grid</span>
          </button>
        </div>

        {/* Precision Coordinate HUD */}
        <Show when={mouseCoord()}>
          {(coord) => (
            <div class="coord-readout font-mono absolute bottom-12 left-4 z-10">
              <span class="coord-item">X: <strong class="text-primary">{coord().x.toFixed(3)}</strong> {props.unit}</span>
              <span class="coord-divider">|</span>
              <span class="coord-item">Y: <strong class="text-primary">{coord().y.toFixed(3)}</strong> {props.unit}</span>
            </div>
          )}
        </Show>

        {/* Floating Bottom Hint Ribbon */}
        <div class="spark-bottom-hint-ribbon absolute bottom-2 inset-x-8 z-10">
          <div class="hint-pill flex items-center justify-between">
            <span class="hint-text truncate">
              Drag or Middle-Click to pan | Scroll or Pinch to zoom | Double-click or press <strong>F</strong> to fit workpiece | Space + Drag to navigate
            </span>
            <span class="hint-question-btn" title="Double click canvas to fit view">?</span>
          </div>
        </div>
      </div>

      {/* Bottom Animation & Scrubber Transport Bar */}
      <div class="sim-control-bar flex items-center gap-3">
        <button
          type="button"
          class={`sim-play-btn ${isPlaying() ? "playing" : ""}`}
          onClick={togglePlay}
          title={isPlaying() ? "Pause Simulator" : "Play Blade Motion Simulation"}
        >
          {isPlaying() ? "PAUSE" : "PLAY"}
        </button>

        <span class="text-xs font-mono text-secondary">Timeline:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={simProgress()}
          onInput={(e) => handleScrubberInput(parseFloat(e.currentTarget.value))}
          class="sim-scrubber flex-1"
        />

        <div class="speed-selector flex items-center gap-1">
          <button
            type="button"
            class={`speed-btn ${speedMultiplier() === 0.5 ? "active" : ""}`}
            onClick={() => handleSpeedChange(0.5)}
          >
            0.5x
          </button>
          <button
            type="button"
            class={`speed-btn ${speedMultiplier() === 1.0 ? "active" : ""}`}
            onClick={() => handleSpeedChange(1.0)}
          >
            1x
          </button>
          <button
            type="button"
            class={`speed-btn ${speedMultiplier() === 2.0 ? "active" : ""}`}
            onClick={() => handleSpeedChange(2.0)}
          >
            2x
          </button>
        </div>

        <span class="text-xs font-mono text-primary progress-indicator">
          {(simProgress() * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
