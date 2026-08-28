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

    plotter.loadDragKnifeData({
      targetContours: props.originalContours,
      spindleContours: props.processedContours,
      swivelArcs: props.swivelArcs,
      sheetConfig: props.sheetConfig,
      autoFit,
    });
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

    plotter.onCursorMove = (pos) => {
      setMouseCoord(pos);
    };

    plotter.on("telemetry", (t: LiveMotionTelemetry) => {
      setSimProgress(t.progress);
    });

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
    if (plotter) plotter.destroy();
  });

  createEffect(() => {
    if (plotter) {
      plotter.setLayers({
        target: showTarget(),
        spindle: showSpindle(),
        swivels: showSwivels(),
        rapids: showRapids(),
        grid: showGrid(),
      });
    }
  });

  let prevTargetCount = -1;
  createEffect(() => {
    if (plotter) {
      const count = props.originalContours.length;
      const isNewFile = count !== prevTargetCount;
      prevTargetCount = count;
      updatePlotterData(isNewFile);
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

        {/* Top Floating Controls Bar */}
        <div class="spark-canvas-header-bar">
          {/* Left: View/Zoom Tools + Layer Visibility */}
          <div class="spark-control-group">
            <button type="button" class="spark-viewmode-btn active" title="2D Orthogonal View">
              2D
            </button>
            <button type="button" class="spark-zoom-icon-btn" onClick={zoomIn} title="Zoom In (+)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <button type="button" class="spark-zoom-icon-btn" onClick={zoomOut} title="Zoom Out (-)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <button type="button" class="spark-zoom-icon-btn" onClick={zoomToFit} title="Zoom to Fit View (F)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 9v6M3 9v6" />
                <rect x="7" y="7" width="10" height="10" rx="1" />
              </svg>
            </button>

            <div class="h-4 w-px bg-white/10 mx-1" />

            <button
              type="button"
              class={`spark-layer-pill ${showTarget() ? "active" : ""}`}
              onClick={() => setShowTarget(!showTarget())}
              title="Toggle Target Contour"
            >
              <span class="legend-dot legend-target" />
              <span>Target</span>
            </button>

            <button
              type="button"
              class={`spark-layer-pill ${showSpindle() ? "active" : ""}`}
              onClick={() => setShowSpindle(!showSpindle())}
              title="Toggle Spindle Path"
            >
              <span class="legend-dot legend-spindle" />
              <span>Spindle</span>
            </button>

            <button
              type="button"
              class={`spark-layer-pill ${showSwivels() ? "active" : ""}`}
              onClick={() => setShowSwivels(!showSwivels())}
              title="Toggle Swivels"
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

          {/* Right: Precision Coordinate HUD */}
          <Show when={mouseCoord()}>
            {(coord) => (
              <div class="coord-readout font-mono">
                <span>X: <strong class="text-white">{coord().x.toFixed(3)}</strong> {props.unit}</span>
                <span class="coord-divider">|</span>
                <span>Y: <strong class="text-white">{coord().y.toFixed(3)}</strong> {props.unit}</span>
              </div>
            )}
          </Show>
        </div>

        {/* Empty State Overlay */}
        <Show when={props.originalContours.length === 0}>
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div class="p-6 rounded-xl bg-black/75 border border-white/10 backdrop-blur text-center max-w-sm shadow-2xl">
              <svg class="mx-auto mb-3 text-slate-500" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <h3 class="text-sm font-semibold text-slate-200 mb-1">No G-Code Toolpath Loaded</h3>
              <p class="text-xs text-slate-400">Click <strong>Open G-Code</strong> in the top bar to inspect your CNC toolpath and generate drag knife compensation.</p>
            </div>
          </div>
        </Show>
      </div>

      {/* Bottom Animation & Scrubber Footer Bar */}
      <div class="spark-canvas-footer-bar">
        <div class="sim-control-bar">
          <button
            type="button"
            class={`sim-play-btn ${isPlaying() ? "playing" : ""}`}
            onClick={togglePlay}
            title={isPlaying() ? "Pause Simulator" : "Play Blade Motion Simulation"}
          >
            {isPlaying() ? "PAUSE" : "PLAY"}
          </button>

          <div class="sim-slider-container">
            <span class="text-[11px] font-mono text-slate-400">Timeline</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={simProgress()}
              onInput={(e) => handleScrubberInput(parseFloat(e.currentTarget.value))}
              class="sim-scrubber"
            />
            <span class="text-[11px] font-mono font-bold text-slate-200 w-9 text-right">
              {(simProgress() * 100).toFixed(0)}%
            </span>
          </div>

          <div class="sim-speed-pill">
            <button
              type="button"
              class={`sim-speed-btn ${speedMultiplier() === 0.5 ? "active" : ""}`}
              onClick={() => handleSpeedChange(0.5)}
            >
              0.5x
            </button>
            <button
              type="button"
              class={`sim-speed-btn ${speedMultiplier() === 1.0 ? "active" : ""}`}
              onClick={() => handleSpeedChange(1.0)}
            >
              1x
            </button>
            <button
              type="button"
              class={`sim-speed-btn ${speedMultiplier() === 2.0 ? "active" : ""}`}
              onClick={() => handleSpeedChange(2.0)}
            >
              2x
            </button>
          </div>
        </div>

        {/* Navigation Hint */}
        <div class="sim-nav-hint hidden md:block">
          Pan: <span class="text-slate-300">Drag / Middle-Click</span> · Zoom: <span class="text-slate-300">Scroll</span> · Fit: <span class="text-slate-300">F</span>
        </div>
      </div>
    </div>
  );
};
