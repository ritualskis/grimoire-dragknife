import { Component, For, Show } from "solid-js";
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
      {/* HUD Header Bar */}
      <div class="hud-header flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="hud-title">HEADS-UP DISPLAY</h2>
          <Show when={props.filename}>
            <span class="hud-filename truncate">{props.filename}</span>
          </Show>
        </div>
        <Show when={props.stats}>
          <div class="flex items-center gap-2">
            <span class="hud-badge hud-unit-badge">{props.stats?.unit}</span>
            <span class="hud-badge hud-lines-badge">{props.stats?.total_lines} Lines</span>
            <span class="hud-badge hud-cycles-badge">
              {props.stats?.cycle_count} {props.stats?.cycle_count === 1 ? "Cycle" : "Cycles"} (
              {props.stats?.depth_pass_count} {props.stats?.depth_pass_count === 1 ? "Pass" : "Passes"})
            </span>
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
          <div class="hud-content-wrapper flex flex-col gap-3">
            {/* Primary Grid: Dimensions, Distance, Cycle Time, Swivels */}
            <div class="hud-grid">
              {/* Bounding Box Dimensions */}
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

              {/* Cutting & Travel Distance */}
              <div class="hud-stat-box surface-well">
                <span class="hud-stat-label">CUTTING LENGTH</span>
                <div class="hud-stat-main text-accent">
                  {formatDistance(stats().total_cut_distance, props.unit)}
                </div>
                <div class="hud-stat-sub">
                  <span>Rapid Travel: {formatDistance(stats().total_rapid_distance, props.unit)}</span>
                </div>
              </div>

              {/* Estimated Cycle Time */}
              <div class="hud-stat-box surface-well">
                <span class="hud-stat-label">ESTIMATED RUN TIME</span>
                <div class="hud-stat-main text-success">
                  {formatTime(stats().estimated_cycle_time_seconds)}
                </div>
                <div class="hud-stat-sub">
                  <span>Cut Feed: {stats().cut_feedrate ? `${stats().cut_feedrate} ${props.unit}/min` : "N/A"}</span>
                </div>
              </div>

              {/* Corner Swivels Count */}
              <div class="hud-stat-box surface-well">
                <span class="hud-stat-label">CORNER SWIVELS</span>
                <div class="hud-stat-main text-warning">
                  {stats().corner_count} <span class="hud-unit">Arcs</span>
                </div>
                <div class="hud-stat-sub">
                  <span>{stats().contour_count} Contours ({stats().closed_contour_count} closed, {stats().open_contour_count} open)</span>
                </div>
              </div>
            </div>

            {/* Z-Kinematics & Stepdowns Detailed Section */}
            <div class="hud-z-section surface-well">
              <div class="hud-z-header flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold tracking-wider text-secondary">
                    Z HEIGHTS & STEPDOWNS
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-secondary">
                  <span>Plunge Feed: <strong class="text-primary">{stats().plunge_feedrate ? `${stats().plunge_feedrate} ${props.unit}/min` : "N/A"}</strong></span>
                  <span class="status-indicator"></span>
                  <span class="text-success font-semibold">SPINDLE OFF</span>
                </div>
              </div>

              <div class="hud-z-grid">
                {/* Travel Height */}
                <div class="hud-z-stat-card">
                  <span class="z-badge-label">TRAVEL HEIGHT (G0)</span>
                  <span class="z-value">
                    {stats().travel_height !== null
                      ? formatDistance(stats().travel_height!, props.unit)
                      : "N/A"}
                  </span>
                  <span class="z-desc">High rapid clearance</span>
                </div>

                {/* Safe Height */}
                <div class="hud-z-stat-card">
                  <span class="z-badge-label">SAFE HEIGHT (Z_SAFE)</span>
                  <span class="z-value text-info">
                    {stats().safe_height !== null
                      ? formatDistance(stats().safe_height!, props.unit)
                      : "N/A"}
                  </span>
                  <span class="z-desc">Approach / Retract plane</span>
                </div>

                {/* Target Plunge Depth */}
                <div class="hud-z-stat-card">
                  <span class="z-badge-label">PLUNGE DEPTH (Z_CUT)</span>
                  <span class="z-value text-accent">
                    {stats().plunge_depth !== null
                      ? formatDistance(stats().plunge_depth!, props.unit)
                      : "N/A"}
                  </span>
                  <span class="z-desc">Maximum cut depth</span>
                </div>

                {/* Cutting Cycles & Passes */}
                <div class="hud-z-stat-card">
                  <span class="z-badge-label">CUTTING CYCLES</span>
                  <span class="z-value text-warning">
                    {stats().cycle_count} <span class="text-xs font-normal">({stats().depth_pass_count} {stats().depth_pass_count === 1 ? "depth pass" : "depth passes"})</span>
                  </span>
                  <span class="z-desc">Plunge & cut cycles</span>
                </div>
              </div>

              {/* Stepdown Height Breakdown */}
              <div class="hud-stepdowns-wrapper">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-tertiary">EACH STEPDOWN PASS HEIGHT (Δ INCREMENT)</span>
                  <Show when={stats().max_stepdown !== null}>
                    <span class="text-xs text-secondary font-mono">
                      Max Stepdown: <strong class="text-primary">{formatDistance(stats().max_stepdown!, props.unit)}</strong>
                    </span>
                  </Show>
                </div>

                <div class="stepdowns-list flex gap-2">
                  <For each={stats().stepdowns}>
                    {(step) => (
                      <div class="stepdown-chip surface-elevated flex items-center gap-2">
                        <span class="stepdown-pass-badge">Pass #{step.pass_number}</span>
                        <span class="stepdown-z-level font-mono">
                          Z {step.z_level.toFixed(props.unit === "in" ? 4 : 2)}
                        </span>
                        <span class="stepdown-delta-badge">
                          Δ {formatDistance(step.stepdown_delta, props.unit)}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
