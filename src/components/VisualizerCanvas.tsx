import {
  Component,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Contour, SwivelArcInfo, Unit } from "../types/dragknife";
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
    <div class="surface-card visualizer-container" ref={containerRef}>
      {/* Top Toolbar */}
      <div class="visualizer-toolbar flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="visualizer-title font-bold tracking-wider">
            TOOLPATH PREVIEW
          </span>
        </div>

        {/* Segmented Layer Badges */}
        <div class="layer-toggles flex items-center gap-2">
          <button
            type="button"
            class={`layer-chip ${showTarget() ? "active" : ""}`}
            onClick={() => setShowTarget(!showTarget())}
            title="Toggle Target Cut Geometry"
          >
            <span class="legend-dot legend-target" />
            <span>Target Cut</span>
          </button>

          <button
            type="button"
            class={`layer-chip ${showSpindle() ? "active" : ""}`}
            onClick={() => setShowSpindle(!showSpindle())}
            title="Toggle Spindle Center Offset Toolpath"
          >
            <span class="legend-dot legend-spindle" />
            <span>Spindle Path</span>
          </button>

          <button
            type="button"
            class={`layer-chip ${showSwivels() ? "active" : ""}`}
            onClick={() => setShowSwivels(!showSwivels())}
            title="Toggle Corner Swivel Arc Moves"
          >
            <span class="legend-dot legend-swivel" />
            <span>Swivels ({props.swivelArcs.length})</span>
          </button>

          <button
            type="button"
            class={`layer-chip ${showRapids() ? "active" : ""}`}
            onClick={() => setShowRapids(!showRapids())}
            title="Toggle Rapid Travel Moves"
          >
            <span class="legend-dot legend-rapid" />
            <span>Rapids</span>
          </button>

          <button
            type="button"
            class={`layer-chip ${showGrid() ? "active" : ""}`}
            onClick={() => setShowGrid(!showGrid())}
            title="Toggle CAD Engineering Grid"
          >
            <span>Grid</span>
          </button>
        </div>

        {/* Zoom & Viewport Actions */}
        <div class="viewport-actions flex items-center gap-1">
          <button class="tool-btn" onClick={zoomIn} title="Zoom In (+)" type="button">
            +
          </button>
          <button class="tool-btn" onClick={zoomOut} title="Zoom Out (-)" type="button">
            -
          </button>
          <button class="tool-btn fit-btn" onClick={zoomToFit} title="Fit Entire Toolpath to Viewport" type="button">
            Fit
          </button>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div class="canvas-wrapper" ref={wrapperRef}>
        <canvas ref={canvasRef} class="interactive-canvas" />

        {/* Precision Coordinate HUD */}
        <Show when={mouseCoord()}>
          {(coord) => (
            <div class="coord-readout font-mono">
              <span class="coord-item">X: <strong class="text-primary">{coord().x.toFixed(3)}</strong> {props.unit}</span>
              <span class="coord-divider">|</span>
              <span class="coord-item">Y: <strong class="text-primary">{coord().y.toFixed(3)}</strong> {props.unit}</span>
            </div>
          )}
        </Show>
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
