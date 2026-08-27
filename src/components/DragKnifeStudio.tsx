import { Component, Show, createSignal, onMount } from "solid-js";
import { VectricHeader } from "./VectricHeader";
import { VectorToolsSidebar, type VectorToolId } from "./VectorToolsSidebar";
import { SheetSettingsPanel } from "./SheetSettingsPanel";
import { HudStatsCard } from "./HudStatsCard";
import { ParameterControls } from "./ParameterControls";
import { VisualizerCanvas } from "./VisualizerCanvas";
import { GCodeInspector } from "./GCodeInspector";
import {
  type DragKnifeConfig,
  type DragKnifeResult,
  type HUDStats,
  type SheetConfig,
  type Unit,
} from "../types/dragknife";
import { analyzeGCode, processDragKnifeGCode } from "../lib/tauri";
import { SAMPLE_GCODE_FILES } from "../assets/sample-data";

export const DragKnifeStudio: Component = () => {
  const [currentFileContent, setCurrentFileContent] = createSignal<string>("");
  const [currentFilename, setCurrentFilename] = createSignal<string>("");
  const [projectName, setProjectName] = createSignal<string>("Blacklight Base v0*");
  const [activeSheetName, setActiveSheetName] = createSignal<string>("Base");
  const [unit, setUnit] = createSignal<Unit>("in");
  const [isProcessing, setIsProcessing] = createSignal<boolean>(false);
  const [activeTab, setActiveTab] = createSignal<"sheet" | "dragknife" | "hud" | "gcode">("sheet");
  const [activeVectorTool, setActiveVectorTool] = createSignal<VectorToolId>("select");

  let fileInputRef: HTMLInputElement | undefined;

  const [sheetConfig, setSheetConfig] = createSignal<SheetConfig>({
    width: 13,
    height: 74,
    thickness: 0.055,
    originX: 0,
    originY: 0,
    datumPosition: "bottom-left",
    zZero: "surface",
    clearanceGap: 2,
    plungeGap: 1,
    homeX: 0,
    homeY: 0,
    homeZ: 10,
    visible: true,
  });

  const [config, setConfig] = createSignal<DragKnifeConfig>({
    blade_offset: 0.0625, // Donek D2 ~1/16 in
    tolerance_angle_deg: 20.0,
    swivel_lift_height: 0.02,
    swivel_feed: 15.0,
    disable_spindle: true,
    unit_override: "in",
  });

  const [hudStats, setHudStats] = createSignal<HUDStats | null>(null);
  const [dragKnifeResult, setDragKnifeResult] = createSignal<DragKnifeResult | null>(null);

  const handleFileLoaded = async (content: string, filename: string) => {
    setCurrentFileContent(content);
    setCurrentFilename(filename);
    setProjectName(filename.replace(/\.(gcode|nc|tap|txt)$/i, ""));

    try {
      const stats = await analyzeGCode(content, config());
      setHudStats(stats);

      // Set active unit based on analysis
      if (stats.unit.includes("G20") || stats.unit.includes("Imperial")) {
        setUnit("in");
        if (config().blade_offset > 0.5) {
          setConfig((c) => ({ ...c, blade_offset: 0.0625, swivel_lift_height: 0.02, swivel_feed: 15.0 }));
        }
        setSheetConfig((s) => ({
          ...s,
          width: Math.max(13, Number((stats.bounds.width * 1.05).toFixed(1))),
          height: Math.max(74, Number((stats.bounds.height * 1.05).toFixed(1))),
        }));
      } else {
        setUnit("mm");
        if (config().blade_offset < 0.2) {
          setConfig((c) => ({ ...c, blade_offset: 1.588, swivel_lift_height: 0.5, swivel_feed: 400.0 }));
        }
        setSheetConfig((s) => ({
          ...s,
          width: Math.max(330, Number((stats.bounds.width * 1.05).toFixed(0))),
          height: Math.max(1880, Number((stats.bounds.height * 1.05).toFixed(0))),
          thickness: 1.4,
          clearanceGap: 50,
          plungeGap: 25,
          homeZ: 250,
        }));
      }

      await handleProcess(content);
    } catch (e) {
      console.error("Error analyzing G-code:", e);
    }
  };

  const handleUnitToggle = (newUnit: Unit) => {
    setUnit(newUnit);
    const currOffset = config().blade_offset;
    const isInch = newUnit === "in";

    const newOffset =
      isInch
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
      swivel_lift_height: isInch ? 0.02 : 0.5,
      swivel_feed: isInch ? 15.0 : 400.0,
    };
    setConfig(newCfg);

    // Convert sheet config units
    setSheetConfig((s) => ({
      ...s,
      width: isInch ? Number((s.width / 25.4).toFixed(1)) : Number((s.width * 25.4).toFixed(0)),
      height: isInch ? Number((s.height / 25.4).toFixed(1)) : Number((s.height * 25.4).toFixed(0)),
      thickness: isInch ? 0.055 : 1.4,
      clearanceGap: isInch ? 2 : 50,
      plungeGap: isInch ? 1 : 25,
      homeZ: isInch ? 10 : 250,
    }));

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

  const triggerOpenDialog = () => {
    fileInputRef?.click();
  };

  const handleNativeFileInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = (re) => {
        const text = re.target?.result as string;
        if (text) {
          handleFileLoaded(text, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  onMount(() => {
    if (SAMPLE_GCODE_FILES.length > 0) {
      const defaultSample = SAMPLE_GCODE_FILES[0];
      handleFileLoaded(defaultSample.gcode, defaultSample.filename);
    }
  });

  return (
    <div class="spark-app-layout">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gcode,.nc,.tap,.txt"
        style={{ display: "none" }}
        onChange={handleNativeFileInput}
      />

      {/* Top Vectric Spark Menu and Project Header */}
      <VectricHeader
        projectName={projectName()}
        onProjectNameChange={setProjectName}
        activeSheetName={activeSheetName()}
        onSelectSheet={setActiveSheetName}
        unit={unit()}
        onUnitToggle={handleUnitToggle}
        onOpenFile={triggerOpenDialog}
        onOpenSheetSettings={() => setActiveTab("sheet")}
        isSheetSettingsOpen={activeTab() === "sheet"}
        activeTab={activeTab()}
        onToggleTab={setActiveTab}
      />

      {/* Main Studio Viewport and Sidebars */}
      <div class="spark-main-workspace flex flex-1 overflow-hidden">
        {/* Left: Vector CAD Palette Toolbar */}
        <VectorToolsSidebar
          activeTool={activeVectorTool()}
          onSelectTool={setActiveVectorTool}
        />

        {/* Center: CAD Canvas Viewport with Material Sheet */}
        <main class="spark-canvas-area flex flex-col flex-1 relative overflow-hidden">
          <VisualizerCanvas
            originalContours={dragKnifeResult()?.original_contours ?? []}
            processedContours={dragKnifeResult()?.processed_contours ?? []}
            swivelArcs={dragKnifeResult()?.swivel_arcs ?? []}
            bladeOffset={config().blade_offset}
            unit={unit()}
            sheetConfig={sheetConfig()}
          />
        </main>

        {/* Right: Collapsible Inspector / Settings Panel */}
        <aside class="spark-right-sidebar">
          <Show when={activeTab() === "sheet"}>
            <SheetSettingsPanel
              sheetConfig={sheetConfig()}
              unit={unit()}
              onUpdateSheet={(s) => setSheetConfig(s)}
              onClose={() => setActiveTab("dragknife")}
            />
          </Show>

          <Show when={activeTab() === "dragknife"}>
            <div class="spark-panel-scroll">
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
          </Show>

          <Show when={activeTab() === "hud"}>
            <div class="spark-panel-scroll">
              <HudStatsCard
                stats={hudStats()}
                filename={currentFilename()}
                unit={unit()}
              />
            </div>
          </Show>

          <Show when={activeTab() === "gcode"}>
            <div class="spark-panel-scroll">
              <GCodeInspector
                originalGCode={currentFileContent()}
                processedGCode={dragKnifeResult()?.processed_gcode ?? ""}
                filename={currentFilename()}
              />
            </div>
          </Show>
        </aside>
      </div>
    </div>
  );
};

export default DragKnifeStudio;

