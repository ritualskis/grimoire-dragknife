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

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [simProgress, setSimProgress] = createSignal(0.0);
  const [mouseCoord, setMouseCoord] = createSignal<{ x: number; y: number } | null>(null);

  // Layer state signals
  const [showTarget, setShowTarget] = createSignal(true);
  const [showSpindle, setShowSpindle] = createSignal(true);
  const [showSwivels, setShowSwivels] = createSignal(true);
  const [showRapids, setShowRapids] = createSignal(true);
  const [showGrid, setShowGrid] = createSignal(true);

  const handleResize = () => {
    if (!containerRef || !plotter) return;
    plotter.resize(containerRef.clientWidth, containerRef.clientHeight);
  };

  const updatePlotterData = (autoFit = true) => {
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
    if (!canvasRef || !containerRef) return;
    plotter = new GrimoirePlotter2D(canvasRef, {
      unit: props.unit,
      toolhead: {
        type: "dragknife",
        bladeOffset: props.bladeOffset,
        toleranceAngleDeg: 20,
        swivelLiftHeight: 0.5,
      },
    });

    plotter.on("telemetry", (t: LiveMotionTelemetry) => {
      setSimProgress(t.progress);
    });

    plotter.on("hover", (data: any) => {
      if (data && data.worldPos) {
        setMouseCoord(data.worldPos);
      }
    });

    updatePlotterData(true);
    handleResize();

    window.addEventListener("resize", handleResize);
  });

  onCleanup(() => {
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
    if (next) plotter.startPlayback();
    else plotter.pausePlayback();
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

        {/* Layer Checkboxes */}
        <div class="layer-toggles flex items-center gap-3">
          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showTarget()}
              onChange={(e) => setShowTarget(e.currentTarget.checked)}
            />
            <span class="legend-color legend-target"></span>
            <span class="text-xs">Target Cut</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showSpindle()}
              onChange={(e) => setShowSpindle(e.currentTarget.checked)}
            />
            <span class="legend-color legend-spindle"></span>
            <span class="text-xs">Spindle Path</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showSwivels()}
              onChange={(e) => setShowSwivels(e.currentTarget.checked)}
            />
            <span class="legend-color legend-swivel"></span>
            <span class="text-xs">Swivels ({props.swivelArcs.length})</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showRapids()}
              onChange={(e) => setShowRapids(e.currentTarget.checked)}
            />
            <span class="text-xs text-secondary">Rapids</span>
          </label>

          <label class="layer-item flex items-center gap-1">
            <input
              type="checkbox"
              checked={showGrid()}
              onChange={(e) => setShowGrid(e.currentTarget.checked)}
            />
            <span class="text-xs text-secondary">Grid</span>
          </label>
        </div>

        {/* Zoom & Fit Actions */}
        <div class="flex items-center gap-1">
          <button class="tool-btn" onClick={zoomIn} title="Zoom In" type="button">
            +
          </button>
          <button class="tool-btn" onClick={zoomOut} title="Zoom Out" type="button">
            -
          </button>
          <button class="tool-btn" onClick={zoomToFit} title="Fit to Viewport" type="button">
            Fit
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <div class="canvas-wrapper">
        <canvas ref={canvasRef} class="interactive-canvas" />

        {/* Floating Readout */}
        <Show when={mouseCoord()}>
          {(coord) => (
            <div class="coord-readout surface-glass font-mono text-xs">
              <span>X: {coord().x.toFixed(3)} {props.unit}</span>
              <span>Y: {coord().y.toFixed(3)} {props.unit}</span>
            </div>
          )}
        </Show>
      </div>

      {/* Bottom Animation & Scrubber Bar */}
      <div class="sim-control-bar flex items-center gap-3">
        <button
          type="button"
          class="sim-play-btn"
          onClick={togglePlay}
          title={isPlaying() ? "Pause Simulator" : "Play Blade Simulation"}
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
        <span class="text-xs font-mono text-primary" style={{ width: "45px", "text-align": "right" }}>
          {(simProgress() * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
