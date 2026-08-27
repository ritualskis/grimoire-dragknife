import { Component, createSignal, onMount } from "solid-js";
import { FileUploader } from "./FileUploader";
import { HudStatsCard } from "./HudStatsCard";
import { ParameterControls } from "./ParameterControls";
import { VisualizerCanvas } from "./VisualizerCanvas";
import { GCodeInspector } from "./GCodeInspector";
import {
  type DragKnifeConfig,
  type DragKnifeResult,
  type HUDStats,
  type Unit,
} from "../types/dragknife";
import { analyzeGCode, processDragKnifeGCode } from "../lib/tauri";
import { SAMPLE_GCODE_FILES } from "../assets/sample-data";

export const DragKnifeStudio: Component = () => {
  const [currentFileContent, setCurrentFileContent] = createSignal<string>("");
  const [currentFilename, setCurrentFilename] = createSignal<string>("");
  const [unit, setUnit] = createSignal<Unit>("mm");
  const [isProcessing, setIsProcessing] = createSignal<boolean>(false);

  const [config, setConfig] = createSignal<DragKnifeConfig>({
    blade_offset: 1.588, // ~1/16 in Donek D2 in mm
    tolerance_angle_deg: 20.0,
    swivel_lift_height: null,
    swivel_feed: null,
    disable_spindle: true,
    unit_override: null,
  });

  const [hudStats, setHudStats] = createSignal<HUDStats | null>(null);
  const [dragKnifeResult, setDragKnifeResult] = createSignal<DragKnifeResult | null>(null);

  const handleFileLoaded = async (content: string, filename: string) => {
    setCurrentFileContent(content);
    setCurrentFilename(filename);

    try {
      const stats = await analyzeGCode(content, config());
      setHudStats(stats);

      // Set active unit based on analysis
      if (stats.unit.includes("G20") || stats.unit.includes("Imperial")) {
        setUnit("in");
        if (config().blade_offset > 0.5) {
          // Switch default offset to inch
          setConfig((c) => ({ ...c, blade_offset: 0.0625 }));
        }
      } else {
        setUnit("mm");
        if (config().blade_offset < 0.2) {
          setConfig((c) => ({ ...c, blade_offset: 1.588 }));
        }
      }

      // Automatically process with current config
      await handleProcess(content);
    } catch (e) {
      console.error("Error analyzing G-code:", e);
    }
  };

  const handleUnitToggle = (newUnit: Unit) => {
    setUnit(newUnit);
    const currOffset = config().blade_offset;
    const newOffset =
      newUnit === "in"
        ? currOffset > 0.5
          ? Number((currOffset / 25.4).toFixed(4))
          : currOffset
        : currOffset < 0.5
          ? Number((currOffset * 25.4).toFixed(3))
          : currOffset;

    const newCfg: DragKnifeConfig = {
      ...config(),
      blade_offset: newOffset,
      unit_override: newUnit,
    };
    setConfig(newCfg);
    if (currentFileContent()) {
      handleProcess(currentFileContent(), newCfg);
    }
  };

  const handleConfigChange = (newConfig: DragKnifeConfig) => {
    setConfig(newConfig);
    if (currentFileContent()) {
      handleProcess(currentFileContent(), newConfig);
    }
  };

  const handleProcess = async (
    content = currentFileContent(),
    cfg = config(),
  ) => {
    if (!content) return;
    setIsProcessing(true);
    try {
      const result = await processDragKnifeGCode(content, cfg);
      setDragKnifeResult(result);
      setHudStats(result.hud_stats);
    } catch (err) {
      console.error("Failed to process drag knife toolpath:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  onMount(() => {
    // Load initial sample
    if (SAMPLE_GCODE_FILES.length > 0) {
      const defaultSample = SAMPLE_GCODE_FILES[0];
      handleFileLoaded(defaultSample.gcode, defaultSample.filename);
    }
  });

  return (
    <div class="dragknife-studio-layout">
      {/* Top Header */}
      <header class="app-header flex items-center justify-between surface-card">
        <div class="flex items-center gap-3">
          <span class="app-logo">🔪⚡</span>
          <div>
            <h1 class="app-title">GRIMOIRE DRAGKNIFE</h1>
            <span class="app-subtitle">Ritual Skis • Barebones Vectric Drag Knife Post-Processor</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="badge-status">STANDALONE ENGINE READY</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div class="studio-workspace">
        {/* Top: File Loader & HUD Stats */}
        <div class="studio-top-section">
          <FileUploader
            onFileLoaded={handleFileLoaded}
            currentFilename={currentFilename()}
          />
          <HudStatsCard
            stats={hudStats()}
            filename={currentFilename()}
            unit={unit()}
          />
        </div>

        {/* Center: Split View (Visualizer + Controls) */}
        <div class="studio-center-section">
          <div class="visualizer-pane">
            <VisualizerCanvas
              originalContours={dragKnifeResult()?.original_contours ?? []}
              processedContours={dragKnifeResult()?.processed_contours ?? []}
              swivelArcs={dragKnifeResult()?.swivel_arcs ?? []}
              bladeOffset={config().blade_offset}
              unit={unit()}
            />
          </div>

          <div class="controls-pane">
            <ParameterControls
              config={config()}
              unit={unit()}
              onConfigChange={handleConfigChange}
              onUnitToggle={handleUnitToggle}
              onProcess={() => handleProcess()}
              isProcessing={isProcessing()}
              hasFile={Boolean(currentFileContent())}
            />
          </div>
        </div>

        {/* Bottom: G-Code Inspector & Diff */}
        <div class="studio-bottom-section">
          <GCodeInspector
            originalGCode={currentFileContent()}
            processedGCode={dragKnifeResult()?.processed_gcode ?? ""}
            filename={currentFilename()}
          />
        </div>
      </div>
    </div>
  );
};
