import {
  Component,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Contour, SwivelArcInfo, Unit } from "../types/dragknife";
import { CadRenderer2D } from "../lib/cad-renderer";

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
  let renderer: CadRenderer2D | null = null;
  let animFrameId: number | null = null;

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [simProgress, setSimProgress] = createSignal(0.0);
  const [mouseCoord, setMouseCoord] = createSignal<{ x: number; y: number } | null>(null);

  // Layer state signals
  const [showTarget, setShowTarget] = createSignal(true);
  const [showSpindle, setShowSpindle] = createSignal(true);
  const [showSwivels, setShowSwivels] = createSignal(true);
  const [showRapids, setShowRapids] = createSignal(true);
  const [showVectors, setShowVectors] = createSignal(true);
  const [showGrid, setShowGrid] = createSignal(true);

  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

  const handleResize = () => {
    if (!containerRef || !renderer) return;
    renderer.resize(containerRef.clientWidth, containerRef.clientHeight);
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - (renderer?.offsetX || 0),
        y: e.clientY - (renderer?.offsetY || 0),
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!renderer || !canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isDragging()) {
      renderer.offsetX = e.clientX - dragStart().x;
      renderer.offsetY = e.clientY - dragStart().y;
      renderer.render();
      return;
    }

    const changed = renderer.updateHover(sx, sy);
    setMouseCoord(renderer.mouseWorldPos);
    if (changed) {
      renderer.render();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!renderer || !canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    renderer.zoomAt(sx, sy, zoomFactor);
  };

  const zoomToFit = () => {
    renderer?.fitToScreen();
  };

  const zoomIn = () => {
    if (!renderer) return;
    renderer.zoomAt(renderer.width / 2, renderer.height / 2, 1.25);
  };

  const zoomOut = () => {
    if (!renderer) return;
    renderer.zoomAt(renderer.width / 2, renderer.height / 2, 0.8);
  };

  const togglePlay = () => {
    const next = !isPlaying();
    setIsPlaying(next);
    if (next) {
      startAnimationLoop();
    } else if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  const startAnimationLoop = () => {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!isPlaying()) return;
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const durationSec = 8.0; // 8 seconds per full cut loop
      let nextProgress = simProgress() + dt / durationSec;
      if (nextProgress > 1.0) nextProgress = 0.0;

      setSimProgress(nextProgress);
      if (renderer) {
        renderer.simProgress = nextProgress;
        renderer.render();
      }

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);
  };

  const handleScrubberInput = (val: number) => {
    setSimProgress(val);
    if (renderer) {
      renderer.simProgress = val;
      renderer.render();
    }
  };

  onMount(() => {
    if (!canvasRef || !containerRef) return;
    renderer = new CadRenderer2D(canvasRef);
    renderer.setData(
      props.originalContours,
      props.processedContours,
      props.swivelArcs,
      props.bladeOffset,
      props.unit,
    );
    handleResize();

    window.addEventListener("resize", handleResize);
    window.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("mouseup", handleMouseUp);
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  createEffect(() => {
    if (renderer) {
      renderer.layers = {
        target: showTarget(),
        spindle: showSpindle(),
        swivels: showSwivels(),
        rapids: showRapids(),
        vectors: showVectors(),
        grid: showGrid(),
      };
      renderer.render();
    }
  });

  createEffect(() => {
    if (renderer) {
      renderer.setData(
        props.originalContours,
        props.processedContours,
        props.swivelArcs,
        props.bladeOffset,
        props.unit,
        true,
      );
    }
  });

  return (
    <div class="surface-card visualizer-container" ref={containerRef}>
      {/* Top Toolbar */}
      <div class="visualizer-toolbar flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="visualizer-title font-bold tracking-wider">
            2D CAD TOOLPATH & CORNER SWIVEL INSPECTOR
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
              checked={showVectors()}
              onChange={(e) => setShowVectors(e.currentTarget.checked)}
            />
            <span class="text-xs text-secondary">Vectors</span>
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
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          class="interactive-canvas"
        />

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
