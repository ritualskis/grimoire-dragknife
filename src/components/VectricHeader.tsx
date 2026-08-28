import { Component, Show } from "solid-js";
import type { Unit } from "../types/dragknife";

interface VectricHeaderProps {
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  unit: Unit;
  onUnitToggle: (unit: Unit) => void;
  onOpenFile: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onExport?: () => void;
  hasFile?: boolean;
}

export const VectricHeader: Component<VectricHeaderProps> = (props) => {
  return (
    <header class="spark-main-header">
      <div class="spark-app-menubar flex items-center justify-between px-3 py-1">
        {/* Left: Branding & Open File */}
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="spark-logo-icon font-black text-black">
              <span>DK</span>
            </div>
            <span class="font-bold text-white text-sm tracking-wide">Grimoire DragKnife</span>
          </div>

          <div class="h-4 w-px bg-slate-700 mx-1" />

          {/* Open Local G-Code Button */}
          <button
            type="button"
            class="sheet-confirm-btn flex items-center gap-1.5 px-3 py-1 text-xs font-semibold"
            onClick={props.onOpenFile}
            title="Open G-Code / NC File from Disk"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Open G-Code</span>
          </button>

          {/* Current Loaded File Badge */}
          <div class="spark-sheet-pill flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span class="font-medium text-xs text-slate-200 truncate max-w-[260px]">
              {props.projectName || "No File Loaded"}
            </span>
          </div>
        </div>

        {/* Right: Unit Toggle, Export & Sidebar Collapse */}
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
              class="spark-icon-btn flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10"
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

          {/* Sidebar Toggle Button */}
          <button
            type="button"
            class="spark-icon-btn flex items-center justify-center p-1.5 text-xs"
            onClick={props.onToggleSidebar}
            title={props.isSidebarOpen ? "Collapse Analysis Panel" : "Open Analysis Panel"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
