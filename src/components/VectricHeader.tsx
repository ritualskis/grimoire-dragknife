import { Component, For, Show, createSignal } from "solid-js";
import type { Unit } from "../types/dragknife";
import { SAMPLE_GCODE_FILES, type SampleFile } from "../assets/sample-data";

interface VectricHeaderProps {
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  unit: Unit;
  onUnitToggle: (unit: Unit) => void;
  onOpenFile: () => void;
  onSelectSample?: (sample: SampleFile) => void;
  activeTab: "sheet" | "dragknife" | "hud" | "gcode";
  onToggleTab: (tab: "sheet" | "dragknife" | "hud" | "gcode") => void;
  onExport?: () => void;
  hasFile?: boolean;
}

export const VectricHeader: Component<VectricHeaderProps> = (props) => {
  const [isSampleMenuOpen, setIsSampleMenuOpen] = createSignal(false);

  return (
    <header class="spark-main-header">
      <div class="spark-app-menubar flex items-center justify-between px-3 py-1">
        {/* Left: Branding & Current File */}
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="spark-logo-icon font-black text-black">
              <span>DK</span>
            </div>
            <span class="font-bold text-white text-sm tracking-wide">Grimoire DragKnife</span>
          </div>

          <div class="h-4 w-px bg-slate-700 mx-1" />

          {/* Current File / Sample Selector Dropdown */}
          <div class="relative">
            <button
              type="button"
              class="spark-sheet-pill flex items-center gap-2"
              onClick={() => setIsSampleMenuOpen(!isSampleMenuOpen())}
              title="Select Sample or View Loaded File"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span class="font-medium text-xs text-white truncate max-w-[220px]">
                {props.projectName || "No File Loaded"}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <Show when={isSampleMenuOpen()}>
              <div class="spark-dropdown-menu">
                <div class="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider border-b border-slate-700">
                  Load Sample Toolpath
                </div>
                <For each={SAMPLE_GCODE_FILES}>
                  {(sample) => (
                    <div
                      class="spark-dropdown-item"
                      onClick={() => {
                        props.onSelectSample?.(sample);
                        setIsSampleMenuOpen(false);
                      }}
                    >
                      <div class="font-semibold text-slate-200">{sample.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">{sample.filename}</div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Open Local G-Code Button */}
          <button
            type="button"
            class="spark-icon-btn flex items-center gap-1.5 px-2.5 py-1 text-xs"
            onClick={props.onOpenFile}
            title="Open G-Code / NC File from Disk"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Open File</span>
          </button>
        </div>

        {/* Center: Navigation Tabs for Right Panel */}
        <div class="spark-nav-tabs flex items-center">
          <button
            type="button"
            class={`spark-tab-btn ${props.activeTab === "sheet" ? "active" : ""}`}
            onClick={() => props.onToggleTab("sheet")}
          >
            Sheet Settings
          </button>
          <button
            type="button"
            class={`spark-tab-btn ${props.activeTab === "dragknife" ? "active" : ""}`}
            onClick={() => props.onToggleTab("dragknife")}
          >
            Knife Parameters
          </button>
          <button
            type="button"
            class={`spark-tab-btn ${props.activeTab === "hud" ? "active" : ""}`}
            onClick={() => props.onToggleTab("hud")}
          >
            Telemetry HUD
          </button>
          <button
            type="button"
            class={`spark-tab-btn ${props.activeTab === "gcode" ? "active" : ""}`}
            onClick={() => props.onToggleTab("gcode")}
          >
            G-Code Inspector
          </button>
        </div>

        {/* Right: Unit Toggle & Export */}
        <div class="flex items-center gap-2.5">
          {/* Unit Selector */}
          <div class="spark-unit-pill flex items-center">
            <button
              type="button"
              class={`spark-unit-btn ${props.unit === "in" ? "active" : ""}`}
              onClick={() => props.onUnitToggle("in")}
            >
              IN
            </button>
            <button
              type="button"
              class={`spark-unit-btn ${props.unit === "mm" ? "active" : ""}`}
              onClick={() => props.onUnitToggle("mm")}
            >
              MM
            </button>
          </div>

          {/* Export Button */}
          <Show when={props.hasFile}>
            <button
              type="button"
              class="sheet-confirm-btn flex items-center gap-1.5 px-3 py-1 text-xs font-semibold"
              onClick={props.onExport}
              title="Download Processed Drag Knife G-Code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export NC</span>
            </button>
          </Show>
        </div>
      </div>
    </header>
  );
};
