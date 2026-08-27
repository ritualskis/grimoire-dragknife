import { Component, Show } from "solid-js";
import type { HUDStats } from "../types/dragknife";
import { formatDistance, formatTime } from "../lib/formatters";

interface HudStatsCardProps {
  stats: HUDStats | null;
  filename?: string;
  unit: "mm" | "in";
}

export const HudStatsCard: Component<HudStatsCardProps> = (props) => {
  return (
    <div class="surface-card hud-container">
      <div class="hud-header flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="hud-badge-icon">📊</span>
          <h2 class="hud-title">FILE HEADS-UP DISPLAY</h2>
          <Show when={props.filename}>
            <span class="hud-filename truncate">{props.filename}</span>
          </Show>
        </div>
        <Show when={props.stats}>
          <div class="flex items-center gap-2">
            <span class="hud-badge hud-unit-badge">{props.stats?.unit}</span>
            <span class="hud-badge hud-lines-badge">{props.stats?.total_lines} Lines</span>
          </div>
        </Show>
      </div>

      <Show
        when={props.stats}
        fallback={
          <div class="hud-empty-state">
            <p class="text-secondary">Load a G-Code file to view live telemetry and cut statistics.</p>
          </div>
        }
      >
        {(stats) => (
          <div class="hud-grid">
            {/* Primary Geometry & Dimensions */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">BOUNDING ENVELOPE</span>
              <div class="hud-stat-main">
                {formatDistance(stats().bounds.width, props.unit)} ×{" "}
                {formatDistance(stats().bounds.height, props.unit)}
              </div>
              <div class="hud-stat-sub">
                <span>X: {stats().bounds.min_x.toFixed(2)} → {stats().bounds.max_x.toFixed(2)}</span>
                <span>Y: {stats().bounds.min_y.toFixed(2)} → {stats().bounds.max_y.toFixed(2)}</span>
              </div>
            </div>

            {/* Path & Cutting Distance */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">CUTTING LENGTH</span>
              <div class="hud-stat-main text-accent">
                {formatDistance(stats().total_cut_distance, props.unit)}
              </div>
              <div class="hud-stat-sub">
                <span>Rapid Travel: {formatDistance(stats().total_rapid_distance, props.unit)}</span>
              </div>
            </div>

            {/* Corner Swivels & Contours */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">CORNERS & CONTOURS</span>
              <div class="hud-stat-main text-warning">
                {stats().corner_count} <span class="hud-unit">Swivels</span>
              </div>
              <div class="hud-stat-sub">
                <span>{stats().contour_count} Total ({stats().closed_contour_count} closed, {stats().open_contour_count} open)</span>
              </div>
            </div>

            {/* Estimated Cycle Time */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">ESTIMATED CYCLE TIME</span>
              <div class="hud-stat-main text-success">
                {formatTime(stats().estimated_cycle_time_seconds)}
              </div>
              <div class="hud-stat-sub">
                <span>Feeds: {stats().feedrates.length > 0 ? stats().feedrates.join(", ") : "N/A"}</span>
              </div>
            </div>

            {/* Z-Depths */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">Z-HEIGHTS</span>
              <div class="hud-stat-main">
                <span class="text-secondary">Cut: </span>
                {stats().z_cut !== null ? formatDistance(stats().z_cut!, props.unit) : "Auto"}
              </div>
              <div class="hud-stat-sub">
                <span>Clearance: {stats().z_clearance !== null ? formatDistance(stats().z_clearance!, props.unit) : "5.0 mm"}</span>
              </div>
            </div>

            {/* Spindle Safety */}
            <div class="hud-stat-box surface-well">
              <span class="hud-stat-label">SPINDLE SAFETY</span>
              <div class="hud-stat-main text-success flex items-center gap-1">
                <span class="status-indicator"></span> SPINDLE OFF
              </div>
              <div class="hud-stat-sub">
                <span>Collet safe for drag knife blade</span>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
