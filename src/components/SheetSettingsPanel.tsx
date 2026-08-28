import { Component, Show } from "solid-js";
import type { HUDStats, SheetConfig, Unit } from "../types/dragknife";
import { formatDistance, formatTime } from "../lib/formatters";

interface SheetSettingsPanelProps {
  sheetConfig: SheetConfig;
  hudStats: HUDStats | null;
  filename?: string;
  unit: Unit;
  onClose?: () => void;
}

export const SheetSettingsPanel: Component<SheetSettingsPanelProps> = (props) => {
  const u = () => props.unit;
  const s = () => props.sheetConfig;
  const h = () => props.hudStats;

  return (
    <aside class="spark-sheet-settings-panel">
      {/* Panel Header */}
      <div class="sheet-header flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h2 class="sheet-title font-bold text-white text-sm tracking-wide">
            TOOLPATH & SHEET ANALYSIS
          </h2>
        </div>
        <button
          type="button"
          class="sheet-collapse-btn"
          onClick={props.onClose}
          title="Collapse Panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div class="sheet-scroll-body flex flex-col gap-3">
        {/* File / Program Badge */}
        <div class="sheet-section surface-card p-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-300 truncate max-w-[200px]">
              {props.filename || "No File Loaded"}
            </span>
            <Show when={h()}>
              {(stats) => (
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
                  {stats().unit}
                </span>
              )}
            </Show>
          </div>
          <Show when={h()}>
            {(stats) => (
              <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
                <span>{stats().total_lines} Lines</span>
                <span>{stats().depth_pass_count} {stats().depth_pass_count === 1 ? "Pass" : "Passes"}</span>
                <span>{stats().cycle_count} {stats().cycle_count === 1 ? "Cycle" : "Cycles"}</span>
              </div>
            )}
          </Show>
        </div>

        {/* Section 1: Material Size (Parsed Bounds) */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Material Stock (Envelope)</span>
          <div class="sheet-row-2">
            <div class="sheet-field">
              <span class="sheet-label">Width (X)</span>
              <div class="sheet-stat-display font-mono">
                <span class="sheet-stat-val">{s().width.toFixed(2)}</span>
                <span class="sheet-stat-unit">{u()}</span>
              </div>
            </div>

            <div class="sheet-field">
              <span class="sheet-label">Length (Y)</span>
              <div class="sheet-stat-display font-mono">
                <span class="sheet-stat-val">{s().height.toFixed(2)}</span>
                <span class="sheet-stat-unit">{u()}</span>
              </div>
            </div>
          </div>

          <div class="sheet-field mt-2">
            <span class="sheet-label">Cut Thickness (Z)</span>
            <div class="sheet-stat-display font-mono">
              <span class="sheet-stat-val text-amber-400">{s().thickness.toFixed(3)}</span>
              <span class="sheet-stat-unit">{u()}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Position & Datum Origin */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Datum & Origin</span>
          <div class="sheet-position-grid">
            <div class="sheet-xy-inputs flex flex-col gap-2">
              <div class="sheet-field">
                <span class="sheet-label">Origin X</span>
                <div class="sheet-stat-display font-mono">
                  <span class="sheet-stat-val">{s().originX.toFixed(3)}</span>
                  <span class="sheet-stat-unit">{u()}</span>
                </div>
              </div>

              <div class="sheet-field">
                <span class="sheet-label">Origin Y</span>
                <div class="sheet-stat-display font-mono">
                  <span class="sheet-stat-val">{s().originY.toFixed(3)}</span>
                  <span class="sheet-stat-unit">{u()}</span>
                </div>
              </div>
            </div>

            {/* 5-Point Datum Origin Quadrant Indicator */}
            <div class="datum-matrix-box">
              <div class="datum-matrix">
                <div class="datum-dot" title="Top-Left" />
                <span class="datum-guide-h" />
                <div class="datum-dot" title="Top-Right" />
                <span class="datum-guide-v" />
                <div class="datum-dot" title="Center" />
                <span class="datum-guide-v" />
                <div class="datum-dot active" title="Bottom-Left (Program Zero)" />
                <span class="datum-guide-h" />
                <div class="datum-dot" title="Bottom-Right" />
              </div>
              <span class="text-[9px] text-slate-400 text-center font-mono mt-1">X0 Y0</span>
            </div>
          </div>
        </div>

        {/* Section 3: Z-Zero Reference */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Z-Zero Reference</span>
          <div class="sheet-z-zero-grid flex items-center justify-between">
            <div class="sheet-readout-badge flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400" />
              <span class="text-xs font-semibold text-slate-200">Material Top Surface (Z=0)</span>
            </div>

            {/* 3D Isometric Material Block Illustration */}
            <div class="z-zero-diagram">
              <svg width="56" height="40" viewBox="0 0 64 48" fill="none">
                <polygon points="32,4 58,16 32,28 6,16" fill="#ef4444" opacity="1" />
                <polygon points="6,16 32,28 32,44 6,32" fill="#b45309" opacity="0.85" />
                <polygon points="58,16 32,28 32,44 58,32" fill="#78350f" opacity="0.95" />
                <polygon points="32,4 58,16 32,28 6,16" stroke="#fca5a5" stroke-width="1.2" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        {/* Section 4: Z Travel & Plunge Heights */}
        <div class="sheet-section">
          <span class="sheet-section-heading">G-Code Kinematics</span>
          <div class="sheet-gaps-grid flex items-center justify-between">
            <div class="sheet-gaps-inputs flex flex-col gap-2 flex-1">
              <div class="sheet-field">
                <span class="sheet-label">Rapid Clearance (Z)</span>
                <div class="sheet-stat-display font-mono">
                  <span class="sheet-stat-val text-emerald-400">{s().clearanceGap.toFixed(2)}</span>
                  <span class="sheet-stat-unit">{u()}</span>
                </div>
              </div>

              <div class="sheet-field">
                <span class="sheet-label">Safe Plunge Height</span>
                <div class="sheet-stat-display font-mono">
                  <span class="sheet-stat-val text-amber-400">{s().plungeGap.toFixed(2)}</span>
                  <span class="sheet-stat-unit">{u()}</span>
                </div>
              </div>
            </div>

            {/* Clearance Diagram with Knife */}
            <div class="gaps-diagram">
              <svg width="68" height="54" viewBox="0 0 74 60" fill="none">
                <rect x="14" y="44" width="56" height="14" rx="2" fill="#d97706" opacity="0.8" />
                <line x1="10" y1="44" x2="72" y2="44" stroke="#fef3c7" stroke-width="1" />
                <rect x="50" y="6" width="6" height="14" fill="#cbd5e1" rx="1" />
                <polygon points="50,20 56,20 53,26" fill="#ef4444" />
                <line x1="14" y1="12" x2="50" y2="12" stroke="#22c55e" stroke-dasharray="2 2" />
                <circle cx="20" cy="12" r="5" fill="#1e293b" stroke="#22c55e" />
                <text x="20" y="15" font-size="7" font-family="sans-serif" font-weight="bold" fill="#22c55e" text-anchor="middle">Z</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Section 5: Cutting Metrics */}
        <Show when={h()}>
          {(stats) => (
            <div class="sheet-section">
              <span class="sheet-section-heading">Cutting Metrics</span>
              <div class="sheet-metrics-grid flex flex-col gap-2">
                <div class="sheet-metric-row flex items-center justify-between">
                  <span class="text-xs text-slate-400">Cut Distance</span>
                  <span class="font-mono text-xs font-semibold text-purple-400">
                    {formatDistance(stats().total_cut_distance, props.unit)}
                  </span>
                </div>

                <div class="sheet-metric-row flex items-center justify-between">
                  <span class="text-xs text-slate-400">Rapid Travel</span>
                  <span class="font-mono text-xs text-slate-300">
                    {formatDistance(stats().total_rapid_distance, props.unit)}
                  </span>
                </div>

                <div class="sheet-metric-row flex items-center justify-between">
                  <span class="text-xs text-slate-400">Corner Swivels</span>
                  <span class="font-mono text-xs font-semibold text-cyan-400">
                    {stats().swivel_arc_count} Arcs
                  </span>
                </div>

                <div class="sheet-metric-row flex items-center justify-between">
                  <span class="text-xs text-slate-400">Programmed Feed</span>
                  <span class="font-mono text-xs text-slate-200">
                    {stats().cut_feedrate ? stats().cut_feedrate!.toFixed(0) : "Auto"} {props.unit}/min
                  </span>
                </div>

                <div class="sheet-metric-row flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-xs font-medium text-slate-300">Estimated Time</span>
                  <span class="font-mono text-xs font-bold text-emerald-400">
                    {formatTime(stats().estimated_cycle_time_seconds)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </aside>
  );
};
