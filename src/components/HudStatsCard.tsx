import { Component, For, Show } from "solid-js";
import type { HUDStats } from "../types/dragknife";
import { formatDistance, formatTime } from "../lib/formatters";
import { Tooltip } from "./Tooltip";

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
            <Tooltip
              title="COORDINATE SYSTEM UNITS"
              desc="Active machine coordinate format (G21 metric millimeters or G20 imperial inches)."
              source="Inferred from G20/G21 in G-Code or unit toggle."
            >
              <span class="hud-badge hud-unit-badge">{props.stats?.unit}</span>
            </Tooltip>

            <Tooltip
              title="TOTAL G-CODE LINES"
              desc="Total line count of the source CNC toolpath file."
              source="Loaded input file."
            >
              <span class="hud-badge hud-lines-badge">{props.stats?.total_lines} Lines</span>
            </Tooltip>

            <Tooltip
              title="CUTTING CYCLES & DEPTH PASSES"
              desc="Number of distinct plunge-to-retract cutting cycles and discrete Z depth passes."
              source="Analyzed from toolpath Z plunge and retract sequences."
            >
              <span class="hud-badge hud-cycles-badge">
                {props.stats?.cycle_count} {props.stats?.cycle_count === 1 ? "Cycle" : "Cycles"} (
                {props.stats?.depth_pass_count} {props.stats?.depth_pass_count === 1 ? "Pass" : "Passes"})
              </span>
            </Tooltip>
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
              <Tooltip
                title="BOUNDING ENVELOPE"
                desc="Total physical bounding box dimensions and coordinate extents across X and Y axes."
                source="Extrema of all X/Y coordinates in loaded G-Code."
              >
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
              </Tooltip>

              {/* Cutting & Travel Distance */}
              <Tooltip
                title="CUTTING LENGTH & RAPID TRAVEL"
                desc="Accumulated distance of all feed-rate cutting moves (G1, G2, G3) vs non-cutting rapid positioning transit (G0)."
                source="Sum of linear and circular toolpath segments in G-Code."
              >
                <div class="hud-stat-box surface-well">
                  <span class="hud-stat-label">CUTTING LENGTH</span>
                  <div class="hud-stat-main text-accent">
                    {formatDistance(stats().total_cut_distance, props.unit)}
                  </div>
                  <div class="hud-stat-sub">
                    <span>Rapid Travel: {formatDistance(stats().total_rapid_distance, props.unit)}</span>
                  </div>
                </div>
              </Tooltip>

              {/* Estimated Cycle Time */}
              <Tooltip
                title="ESTIMATED RUN TIME"
                desc="Projected total cycle duration calculated from programmed cut feedrates (F...) and rapid traverse speeds."
                source="Programmed feedrates and total distance in G-Code."
              >
                <div class="hud-stat-box surface-well">
                  <span class="hud-stat-label">ESTIMATED RUN TIME</span>
                  <div class="hud-stat-main text-success">
                    {formatTime(stats().estimated_cycle_time_seconds)}
                  </div>
                  <div class="hud-stat-sub">
                    <span>Cut Feed: {stats().cut_feedrate ? `${stats().cut_feedrate} ${props.unit}/min` : "N/A"}</span>
                  </div>
                </div>
              </Tooltip>

              {/* Corner Swivels Count */}
              <Tooltip
                title="CORNER SWIVELS & CONTOURS"
                desc="Count of stationary circular pivot arcs (G2/G3) generated at sharp corners where turn angle exceeds the tolerance threshold. Spindle halts forward feed and swivels the blade around the corner vertex."
                source="Calculated from Swivel Tolerance Angle in Parameters."
              >
                <div class="hud-stat-box surface-well">
                  <span class="hud-stat-label">CORNER SWIVELS</span>
                  <div class="hud-stat-main text-warning">
                    {stats().corner_count} <span class="hud-unit">Arcs</span>
                  </div>
                  <div class="hud-stat-sub">
                    <span>{stats().contour_count} Contours ({stats().closed_contour_count} closed, {stats().open_contour_count} open)</span>
                  </div>
                </div>
              </Tooltip>
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
                  <Tooltip
                    title="PLUNGE FEEDRATE"
                    desc="Vertical feedrate used when plunging the blade downward into the stock along the Z axis."
                    source="Programmed F value on vertical G1 Z moves."
                  >
                    <span>Plunge Feed: <strong class="text-primary">{stats().plunge_feedrate ? `${stats().plunge_feedrate} ${props.unit}/min` : "N/A"}</strong></span>
                  </Tooltip>

                  <span class="status-indicator"></span>
                  <Tooltip
                    title="SPINDLE SAFETY INTERLOCK"
                    desc="Confirms spindle rotation (M3/M4) is disabled so the drag knife collet is never rotated."
                    source="Configured via 'Strip Spindle RPM' safety toggle."
                  >
                    <span class="text-success font-semibold">SPINDLE OFF</span>
                  </Tooltip>
                </div>
              </div>

              <div class="hud-z-grid">
                {/* Travel Height */}
                <Tooltip
                  title="TRAVEL HEIGHT (G0)"
                  desc="Highest Z clearance plane used for rapid transit across the machine bed between separate cuts."
                  source="Programmed as 'Rapid Z Gap' or 'Home Z' in CAM software."
                >
                  <div class="hud-z-stat-card">
                    <span class="z-badge-label">TRAVEL HEIGHT (G0)</span>
                    <span class="z-value">
                      {stats().travel_height !== null
                        ? formatDistance(stats().travel_height!, props.unit)
                        : "N/A"}
                    </span>
                    <span class="z-desc">High rapid clearance</span>
                  </div>
                </Tooltip>

                {/* Safe Height */}
                <Tooltip
                  title="SAFE HEIGHT (Z_SAFE)"
                  desc="Approach clearance plane (Z > 0) where rapid motion stops before controlled vertical entry into material."
                  source="Programmed as 'Clearance Plane' in CAM software."
                >
                  <div class="hud-z-stat-card">
                    <span class="z-badge-label">SAFE HEIGHT (Z_SAFE)</span>
                    <span class="z-value text-info">
                      {stats().safe_height !== null
                        ? formatDistance(stats().safe_height!, props.unit)
                        : "N/A"}
                    </span>
                    <span class="z-desc">Approach / Retract plane</span>
                  </div>
                </Tooltip>

                {/* Target Plunge Depth */}
                <Tooltip
                  title="PLUNGE DEPTH (Z_CUT)"
                  desc="Lowest cutting floor reached during cutting moves, representing final cut-through depth into sacrificial backing."
                  source="Programmed as 'Cut Depth' in CAM profile toolpath."
                >
                  <div class="hud-z-stat-card">
                    <span class="z-badge-label">PLUNGE DEPTH (Z_CUT)</span>
                    <span class="z-value text-accent">
                      {stats().plunge_depth !== null
                        ? formatDistance(stats().plunge_depth!, props.unit)
                        : "N/A"}
                    </span>
                    <span class="z-desc">Maximum cut depth</span>
                  </div>
                </Tooltip>

                {/* Cutting Cycles & Passes */}
                <Tooltip
                  title="CUTTING CYCLES & PASSES"
                  desc="Total number of plunge-to-retract cutting cycles and distinct Z depth levels."
                  source="Count of rapid-to-plunge sequences in G-Code."
                >
                  <div class="hud-z-stat-card">
                    <span class="z-badge-label">CUTTING CYCLES</span>
                    <span class="z-value text-warning">
                      {stats().cycle_count} <span class="text-xs font-normal">({stats().depth_pass_count} {stats().depth_pass_count === 1 ? "depth pass" : "depth passes"})</span>
                    </span>
                    <span class="z-desc">Plunge & cut cycles</span>
                  </div>
                </Tooltip>
              </div>

              {/* Stepdown Height Breakdown */}
              <div class="hud-stepdowns-wrapper">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-tertiary">EACH STEPDOWN PASS HEIGHT (Δ INCREMENT)</span>
                  <Show when={stats().max_stepdown !== null}>
                    <Tooltip
                      title="MAXIMUM STEPDOWN INCREMENT"
                      desc="Largest vertical depth increment cut in a single pass across the entire toolpath."
                      source="Calculated from difference between consecutive Z levels."
                    >
                      <span class="text-xs text-secondary font-mono">
                        Max Stepdown: <strong class="text-primary">{formatDistance(stats().max_stepdown!, props.unit)}</strong>
                      </span>
                    </Tooltip>
                  </Show>
                </div>

                <div class="stepdowns-list flex gap-2">
                  <For each={stats().stepdowns}>
                    {(step) => (
                      <Tooltip
                        title={`STEPDOWN PASS #${step.pass_number}`}
                        desc={`Cutting pass at Z = ${step.z_level.toFixed(props.unit === "in" ? 4 : 2)} ${props.unit}, removing Δ ${formatDistance(step.stepdown_delta, props.unit)} material depth.`}
                        source="Configured via 'Pass Depth' in CAM tool database."
                      >
                        <div class="stepdown-chip surface-elevated flex items-center gap-2">
                          <span class="stepdown-pass-badge">Pass #{step.pass_number}</span>
                          <span class="stepdown-z-level font-mono">
                            Z {step.z_level.toFixed(props.unit === "in" ? 4 : 2)}
                          </span>
                          <span class="stepdown-delta-badge">
                            Δ {formatDistance(step.stepdown_delta, props.unit)}
                          </span>
                        </div>
                      </Tooltip>
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

