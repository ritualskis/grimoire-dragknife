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
    const blob = new Blob([res.processed_gcode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename()
      ? currentFilename().replace(/\.(gcode|nc|tap|txt)$/i, "_dragknife.nc")
      : "dragknife_output.nc";
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
      />

      {/* Main Studio Viewport and Sidebars */}
      <div class="spark-main-workspace flex flex-1 overflow-hidden">
        {/* Center: CAD Canvas Viewport with Material Sheet */}
        <main class="spark-canvas-area flex flex-col flex-1 relative overflow-hidden">
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

