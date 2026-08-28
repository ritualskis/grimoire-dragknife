import { Component, Show, createSignal } from "solid-js";
import { VectricHeader } from "./VectricHeader";
import { SheetSettingsPanel } from "./SheetSettingsPanel";
import { VisualizerCanvas } from "./VisualizerCanvas";
import {
  type DragKnifeConfig,
  type DragKnifeResult,
  type HUDStats,
  type SheetConfig,
  type Unit,
} from "../types/dragknife";
import { analyzeGCode, processDragKnifeGCode } from "../lib/tauri";
import { embedDraggedManifest } from "../lib/dragknife-engine";

export const DragKnifeStudio: Component = () => {
  const [currentFileContent, setCurrentFileContent] = createSignal<string>("");
  const [currentFilename, setCurrentFilename] = createSignal<string>("");
  const [projectName, setProjectName] = createSignal<string>("");
  const [unit, setUnit] = createSignal<Unit>("in");
  const [isSidebarOpen, setIsSidebarOpen] = createSignal(true);

  let fileInputRef: HTMLInputElement | undefined;

  const [sheetConfig, setSheetConfig] = createSignal<SheetConfig>({
    width: 0,
    height: 0,
    thickness: 0,
    originX: 0,
    originY: 0,
    datumPosition: "bottom-left",
    zZero: "surface",
    clearanceGap: 0,
    plungeGap: 0,
    homeX: 0,
    homeY: 0,
    homeZ: 0,
    visible: true,
  });

  const [config, setConfig] = createSignal<DragKnifeConfig>({
    blade_offset: 1.588, // Donek D2
    tolerance_angle_deg: 20.0,
    swivel_lift_height: 0.5,
    swivel_feed: 400.0,
    disable_spindle: true,
    unit_override: null,
  });

  const [hudStats, setHudStats] = createSignal<HUDStats | null>(null);
  const [dragKnifeResult, setDragKnifeResult] = createSignal<DragKnifeResult | null>(null);

  const handleFileLoaded = async (content: string, filename: string) => {
    setCurrentFileContent(content);
    setCurrentFilename(filename);
    setProjectName(filename.replace(/\.(gcode|nc|tap|txt)$/i, ""));

    try {
      const stats = await analyzeGCode(content, { ...config(), unit_override: null });
      setHudStats(stats);

      const isImperial = stats.unit.includes("G20") || stats.unit.includes("Imperial");
      if (isImperial) {
        setUnit("in");
        const newCfg: DragKnifeConfig = {
          ...config(),
          blade_offset: 0.0625,
          swivel_lift_height: 0.02,
          swivel_feed: 15.0,
          unit_override: "in",
        };
        setConfig(newCfg);
        const w = Number((Math.max(1, stats.bounds.width * 1.06 + 0.5)).toFixed(2));
        const h = Number((Math.max(1, stats.bounds.height * 1.06 + 0.5)).toFixed(2));
        setSheetConfig({
          width: w,
          height: h,
          originX: Number(stats.bounds.min_x.toFixed(3)),
          originY: Number(stats.bounds.min_y.toFixed(3)),
          thickness: stats.plunge_depth ? Number(Math.abs(stats.plunge_depth).toFixed(3)) : 0.055,
          datumPosition: "bottom-left",
          zZero: "surface",
          clearanceGap: stats.travel_height !== null ? Number(stats.travel_height.toFixed(2)) : 2.0,
          plungeGap: stats.safe_height !== null ? Number(stats.safe_height.toFixed(2)) : 1.0,
          homeX: 0,
          homeY: 0,
          homeZ: stats.travel_height !== null ? Number(stats.travel_height.toFixed(2)) : 10.0,
          visible: true,
        });
        await handleProcess(content, newCfg);
      } else {
        setUnit("mm");
        const newCfg: DragKnifeConfig = {
          ...config(),
          blade_offset: 1.588,
          swivel_lift_height: 0.5,
          swivel_feed: 400.0,
          unit_override: "mm",
        };
        setConfig(newCfg);
        const w = Number((Math.max(10, stats.bounds.width * 1.06 + 10)).toFixed(1));
        const h = Number((Math.max(10, stats.bounds.height * 1.06 + 10)).toFixed(1));
        setSheetConfig({
          width: w,
          height: h,
          originX: Number(stats.bounds.min_x.toFixed(2)),
          originY: Number(stats.bounds.min_y.toFixed(2)),
          thickness: stats.plunge_depth ? Number(Math.abs(stats.plunge_depth).toFixed(2)) : 1.4,
          datumPosition: "bottom-left",
          zZero: "surface",
          clearanceGap: stats.travel_height !== null ? Number(stats.travel_height.toFixed(1)) : 50.0,
          plungeGap: stats.safe_height !== null ? Number(stats.safe_height.toFixed(1)) : 25.0,
          homeX: 0,
          homeY: 0,
          homeZ: stats.travel_height !== null ? Number(stats.travel_height.toFixed(1)) : 250.0,
          visible: true,
        });
        await handleProcess(content, newCfg);
      }
    } catch (e) {
      console.error("Error analyzing G-code:", e);
    }
  };

  const handleUnitToggle = (newUnit: Unit) => {
    if (newUnit === unit()) return;
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

    // Convert sheet config units accurately
    setSheetConfig((s) => ({
      ...s,
      width: isInch ? Number((s.width / 25.4).toFixed(2)) : Number((s.width * 25.4).toFixed(1)),
      height: isInch ? Number((s.height / 25.4).toFixed(2)) : Number((s.height * 25.4).toFixed(1)),
      originX: isInch ? Number((s.originX / 25.4).toFixed(3)) : Number((s.originX * 25.4).toFixed(2)),
      originY: isInch ? Number((s.originY / 25.4).toFixed(3)) : Number((s.originY * 25.4).toFixed(2)),
      thickness: isInch ? Number((s.thickness / 25.4).toFixed(3)) : Number((s.thickness * 25.4).toFixed(2)),
      clearanceGap: isInch ? Number((s.clearanceGap / 25.4).toFixed(2)) : Number((s.clearanceGap * 25.4).toFixed(1)),
      plungeGap: isInch ? Number((s.plungeGap / 25.4).toFixed(2)) : Number((s.plungeGap * 25.4).toFixed(1)),
      homeZ: isInch ? Number((s.homeZ / 25.4).toFixed(2)) : Number((s.homeZ * 25.4).toFixed(1)),
    }));

    if (currentFileContent()) {
      handleProcess(currentFileContent(), newCfg);
    }
  };

  const handleProcess = async (
    content = currentFileContent(),
    cfg = config(),
  ) => {
    if (!content) return;
    try {
      const result = await processDragKnifeGCode(content, cfg);
      setDragKnifeResult(result);
      setHudStats(result.hud_stats);
    } catch (err) {
      console.error("Failed to process drag knife toolpath:", err);
    }
  };

  const handleExportGCode = () => {
    const res = dragKnifeResult();
    if (!res || !res.processed_gcode) return;
    const rawGCode = currentFileContent();
    const unitStr = unit() === "in" ? "G20 (Inches)" : "G21 (Millimeters)";
    const finalExport = embedDraggedManifest(res.processed_gcode, rawGCode, unitStr);
    const blob = new Blob([finalExport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const originalName = currentFilename() || "toolpath.gcode";
    a.download = originalName.startsWith("Dragged_")
      ? originalName
      : `Dragged_${originalName}`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div class="spark-app-layout">
      {/* Hidden Native File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gcode,.nc,.tap,.txt"
        style={{ display: "none" }}
        onChange={handleNativeFileInput}
      />

      {/* Top Vectric Spark Header */}
      <VectricHeader
        projectName={projectName()}
        onProjectNameChange={setProjectName}
        unit={unit()}
        onUnitToggle={handleUnitToggle}
        onOpenFile={triggerOpenDialog}
        isSidebarOpen={isSidebarOpen()}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen())}
        onExport={handleExportGCode}
        hasFile={Boolean(currentFileContent())}
        isAlreadyProcessed={Boolean(dragKnifeResult()?.is_already_processed ?? hudStats()?.is_already_processed)}
      />

      {/* Main Studio Viewport and Sidebars */}
      <div class="spark-main-workspace flex flex-1 overflow-hidden">
        {/* Center: CAD Canvas Viewport with Material Sheet */}
        <main class="spark-canvas-area flex flex-col flex-1 relative overflow-hidden">
          {/* Floating Post-Processed Alert Banner */}
          <Show when={dragKnifeResult()?.is_already_processed || hudStats()?.is_already_processed}>
            <div class="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[92%] bg-slate-900/95 backdrop-blur border border-amber-500/50 shadow-2xl rounded-lg p-3 flex items-center justify-between gap-3 font-mono animate-in fade-in slide-in-from-top-2 duration-200">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="p-1.5 rounded-md bg-amber-500/20 text-amber-400 flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" />
                  </svg>
                </div>
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-amber-300">
                      Post-Processed G-Code Detected
                    </span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                      {dragKnifeResult()?.swivel_arcs.length || hudStats()?.swivel_arc_count || 0} Swivels
                    </span>
                  </div>
                  <span class="text-[11px] text-slate-300 truncate">
                    {dragKnifeResult()?.detection_reason || hudStats()?.detection_reason || "File contains Drag Knife corner swivel compensation. Grimoire visualizes the true spindle toolpath and swivels directly."}
                  </span>
                </div>
              </div>

              {/* Optional Revert to Raw Button if Embedded Original Exists */}
              <Show when={dragKnifeResult()?.restored_raw_gcode}>
                <button
                  type="button"
                  class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/40 rounded transition-colors cursor-pointer"
                  onClick={() => {
                    const raw = dragKnifeResult()?.restored_raw_gcode;
                    if (raw) {
                      handleFileLoaded(raw, currentFilename().replace(/^Dragged_/i, ""));
                    }
                  }}
                  title="Revert file back to raw un-compensated G-code"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <span>Revert to Raw</span>
                </button>
              </Show>
            </div>
          </Show>

          <VisualizerCanvas
            originalContours={dragKnifeResult()?.original_contours ?? []}
            processedContours={dragKnifeResult()?.processed_contours ?? []}
            swivelArcs={dragKnifeResult()?.swivel_arcs ?? []}
            bladeOffset={config().blade_offset}
            unit={unit()}
            sheetConfig={sheetConfig().width > 0 ? sheetConfig() : undefined}
          />
        </main>

        {/* Right: Read-Only Toolpath & Sheet Analysis Panel */}
        <Show when={isSidebarOpen()}>
          <SheetSettingsPanel
            sheetConfig={sheetConfig()}
            hudStats={hudStats()}
            filename={currentFilename()}
            unit={unit()}
            onClose={() => setIsSidebarOpen(false)}
          />
        </Show>
      </div>
    </div>
  );
};

export default DragKnifeStudio;

