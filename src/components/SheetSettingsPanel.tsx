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
          <span class="w-1.5 h-3 bg-rose-500 rounded-sm" />
          <h2 class="sheet-title">TOOLPATH & SHEET ANALYSIS</h2>
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
        <div class="sheet-card flex flex-col gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-white font-mono truncate" title={props.filename || "No File Loaded"}>
                {props.filename || "No File Loaded"}
              </span>
            </div>
            <Show when={h()}>
              {(stats) => (
                <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 whitespace-nowrap flex-shrink-0">
                  {stats().unit}
                </span>
              )}
            </Show>
          </div>

          <Show when={h()}>
            {(stats) => (
              <>
                {/* Compensation Status Indicator */}
                <div
                  class={`p-2 rounded border text-xs font-mono flex flex-col gap-0.5 ${
                    stats().is_already_processed
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  }`}
                >
                  <div class="flex items-center gap-1.5 font-bold">
                    <span
                      class={`w-2 h-2 rounded-full ${
                        stats().is_already_processed ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                      }`}
                    />
                    <span>
                      {stats().is_already_processed
                        ? "Post-Processed G-Code"
                        : "Raw CAD/CAM Toolpath"}
                    </span>
                  </div>
                  <span class="text-[10px] text-slate-400 pl-3.5 leading-tight">
                    {stats().is_already_processed
                      ? stats().detection_reason || "Pre-existing Donek / Vectric corner swivels"
                      : "Ready for Donek drag knife compensation"}
                  </span>
                </div>

                <div class="grid grid-cols-3 gap-1 pt-1 border-t border-white/5 text-[10px] text-slate-400 font-mono text-center">
                  <div class="bg-black/30 py-1 rounded">
                    <strong class="text-slate-200 block">{stats().total_lines}</strong> Lines
                  </div>
                  <div class="bg-black/30 py-1 rounded">
                    <strong class="text-slate-200 block">{stats().depth_pass_count}</strong>{" "}
                    {stats().depth_pass_count === 1 ? "Pass" : "Passes"}
                  </div>
                  <div class="bg-black/30 py-1 rounded">
                    <strong class="text-slate-200 block">{stats().cycle_count}</strong>{" "}
                    {stats().cycle_count === 1 ? "Cycle" : "Cycles"}
                  </div>
                </div>
              </>
            )}
          </Show>
        </div>

        {/* Section 1: Material Size (Parsed Bounds) */}
        <div class="sheet-card">
          <span class="sheet-section-title">Material Stock (Envelope)</span>
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
        <div class="sheet-card">
          <span class="sheet-section-title">Datum & Origin</span>
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
              <span class="text-[8px] text-slate-400 text-center font-mono mt-1 tracking-tighter">X0 Y0</span>
            </div>
          </div>
        </div>

        {/* Section 3: Z-Zero Reference */}
        <div class="sheet-card">
          <span class="sheet-section-title">Z-Zero Reference</span>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span class="text-xs font-semibold text-slate-200">Material Top (Z=0)</span>
            </div>

            {/* 3D Isometric Material Block */}
            <div class="z-zero-diagram">
              <svg width="48" height="34" viewBox="0 0 64 48" fill="none">
                <polygon points="32,4 58,16 32,28 6,16" fill="#e63946" opacity="0.9" />
                <polygon points="6,16 32,28 32,44 6,32" fill="#1e2330" />
                <polygon points="58,16 32,28 32,44 58,32" fill="#14171d" />
                <polygon points="32,4 58,16 32,28 6,16" stroke="#fca5a5" stroke-width="1.2" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        {/* Section 4: Z Travel & Plunge Heights */}
        <div class="sheet-card">
          <span class="sheet-section-title">G-Code Kinematics</span>
          <div class="sheet-gaps-grid flex items-center justify-between gap-3">
            <div class="flex flex-col gap-2 flex-1">
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
            <div class="gaps-diagram flex-shrink-0">
              <svg width="60" height="48" viewBox="0 0 74 60" fill="none">
                <rect x="14" y="44" width="56" height="14" rx="2" fill="#1e2330" stroke="#334155" stroke-width="1" />
                <rect x="50" y="6" width="6" height="14" fill="#64748b" rx="1" />
                <polygon points="50,20 56,20 53,26" fill="#e63946" />
                <line x1="14" y1="12" x2="50" y2="12" stroke="#10b981" stroke-dasharray="2 2" />
                <circle cx="20" cy="12" r="5" fill="#090a0d" stroke="#10b981" />
                <text x="20" y="15" font-size="7" font-family="sans-serif" font-weight="bold" fill="#10b981" text-anchor="middle">Z</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Section 5: Cutting Metrics */}
        <Show when={h()}>
          {(stats) => (
            <div class="sheet-card">
              <span class="sheet-section-title">Cutting Metrics</span>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-400">Cut Distance</span>
                  <span class="font-mono font-semibold text-purple-400">
                    {formatDistance(stats().total_cut_distance, props.unit)}
                  </span>
                </div>

                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-400">Rapid Travel</span>
                  <span class="font-mono text-slate-300">
                    {formatDistance(stats().total_rapid_distance, props.unit)}
                  </span>
                </div>

                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-400">Corner Swivels</span>
                  <span class="font-mono font-semibold text-cyan-400">
                    {stats().swivel_arc_count} Arcs
                  </span>
                </div>

                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-400">Programmed Feed</span>
                  <span class="font-mono text-slate-200">
                    {stats().cut_feedrate ? stats().cut_feedrate!.toFixed(0) : "Auto"} {props.unit}/min
                  </span>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                  <span class="font-medium text-slate-300">Estimated Time</span>
                  <span class="font-mono font-bold text-emerald-400">
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
