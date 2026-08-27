import { Component, For, Show, createSignal } from "solid-js";
import type { Unit } from "../types/dragknife";

interface VectricHeaderProps {
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  activeSheetName: string;
  onSelectSheet?: (name: string) => void;
  unit: Unit;
  onUnitToggle: (unit: Unit) => void;
  onOpenFile: () => void;
  onOpenSheetSettings: () => void;
  isSheetSettingsOpen: boolean;
  onToggleTab: (tab: "sheet" | "dragknife" | "hud" | "gcode") => void;
  activeTab: "sheet" | "dragknife" | "hud" | "gcode";
}

export const VectricHeader: Component<VectricHeaderProps> = (props) => {
  const [isSheetMenuOpen, setIsSheetMenuOpen] = createSignal(false);
  const [isEditingName, setIsEditingName] = createSignal(false);

  const sheets = ["Base", "Top Sheet", "Core", "Tip Spacer", "Tail Spacer"];

  return (
    <header class="spark-main-header">
      {/* Row 1: Desktop Application Menu */}
      <div class="spark-app-menubar flex items-center justify-between">
        <div class="flex items-center gap-4 text-xs text-secondary select-none">
          <div class="flex items-center gap-1.5 font-semibold text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
              <path d="M12 2L2 22h20L12 2zm0 3.8L18.5 19H5.5L12 5.8z" />
            </svg>
            <span>Spark</span>
          </div>
          <span class="spark-menu-item" onClick={props.onOpenFile}>File</span>
          <span class="spark-menu-item">Edit</span>
          <span class="spark-menu-item" onClick={props.onOpenSheetSettings}>Machining Setup</span>
          <span class="spark-menu-item">Window</span>
          <span class="spark-menu-item">Help</span>
        </div>

        <div class="flex items-center gap-3 text-xs text-secondary">
          {/* Quick Unit Selector */}
          <div class="spark-unit-pill flex items-center">
            <button
              type="button"
              class={`spark-unit-btn ${props.unit === "in" ? "active" : ""}`}
              onClick={() => props.onUnitToggle("in")}
            >
              Inches
            </button>
            <button
              type="button"
              class={`spark-unit-btn ${props.unit === "mm" ? "active" : ""}`}
              onClick={() => props.onUnitToggle("mm")}
            >
              mm
            </button>
          </div>

          {/* Quick Sidebar Tab Selector */}
          <div class="spark-nav-tabs flex items-center">
            <button
              type="button"
              class={`spark-tab-btn ${props.activeTab === "sheet" ? "active" : ""}`}
              onClick={() => props.onToggleTab("sheet")}
            >
              Sheet
            </button>
            <button
              type="button"
              class={`spark-tab-btn ${props.activeTab === "dragknife" ? "active" : ""}`}
              onClick={() => props.onToggleTab("dragknife")}
            >
              Knife Setup
            </button>
            <button
              type="button"
              class={`spark-tab-btn ${props.activeTab === "hud" ? "active" : ""}`}
              onClick={() => props.onToggleTab("hud")}
            >
              Telemetry
            </button>
            <button
              type="button"
              class={`spark-tab-btn ${props.activeTab === "gcode" ? "active" : ""}`}
              onClick={() => props.onToggleTab("gcode")}
            >
              G-Code Diff
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Window Controls & Project / Sheet Selector Bar */}
      <div class="spark-project-bar flex items-center justify-between">
        {/* Left: Window Dots & Project Name */}
        <div class="flex items-center gap-3">
          <div class="spark-window-dots flex items-center gap-1.5">
            <span class="dot dot-close" />
            <span class="dot dot-minimize" />
            <span class="dot dot-maximize" />
          </div>

          <div class="spark-project-badge flex items-center gap-2">
            <div class="spark-logo-icon">
              <span>V</span>
            </div>
            <Show
              when={isEditingName()}
              fallback={
                <span
                  class="spark-project-title truncate"
                  onClick={() => setIsEditingName(true)}
                  title="Click to rename project"
                >
                  {props.projectName || "Blacklight Base v0*"}
                </span>
              }
            >
              <input
                type="text"
                value={props.projectName}
                onBlur={(e) => {
                  props.onProjectNameChange?.(e.currentTarget.value);
                  setIsEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    props.onProjectNameChange?.(e.currentTarget.value);
                    setIsEditingName(false);
                  }
                }}
                class="spark-title-input"
                autofocus
              />
            </Show>
          </div>
        </div>

        {/* Center: Layer / Sheet Dropdown Pill */}
        <div class="spark-center-sheet-selector relative">
          <button
            type="button"
            class="spark-sheet-pill flex items-center gap-2"
            onClick={() => setIsSheetMenuOpen(!isSheetMenuOpen())}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span class="font-medium text-xs text-white">{props.activeSheetName || "Base"}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <Show when={isSheetMenuOpen()}>
            <div class="spark-dropdown-menu">
              <For each={sheets}>
                {(sheet) => (
                  <div
                    class={`spark-dropdown-item ${props.activeSheetName === sheet ? "active" : ""}`}
                    onClick={() => {
                      props.onSelectSheet?.(sheet);
                      setIsSheetMenuOpen(false);
                    }}
                  >
                    <span>{sheet}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Right: User Avatar & Quick Actions */}
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="spark-icon-btn"
            onClick={props.onOpenFile}
            title="Load G-Code or DXF Toolpath"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>

          <div class="spark-user-avatar" title="Ritual Skis Workshop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
        </div>
      </div>
    </header>
  );
};
