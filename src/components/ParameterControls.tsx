import { Component, For, Show } from "solid-js";
import {
  type DragKnifeConfig,
  type Unit,
  DRAG_KNIFE_PRESETS,
} from "../types/dragknife";
import { Tooltip } from "./Tooltip";

interface ParameterControlsProps {
  config: DragKnifeConfig;
  unit: Unit;
  onConfigChange: (newConfig: DragKnifeConfig) => void;
  onUnitToggle: (unit: Unit) => void;
  onProcess: () => void;
  isProcessing: boolean;
  hasFile: boolean;
}

export const ParameterControls: Component<ParameterControlsProps> = (props) => {
  const handlePresetSelect = (presetId: string) => {
    const preset = DRAG_KNIFE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const offset = props.unit === "in" ? preset.blade_offset_in : preset.blade_offset_mm;
    props.onConfigChange({
      ...props.config,
      blade_offset: offset,
      tolerance_angle_deg: preset.tolerance_angle_deg,
    });
  };

  return (
    <div class="surface-card param-container">
      <div class="param-header flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h2 class="param-title">DRAG KNIFE PARAMETERS</h2>
        </div>
        <div class="unit-toggle flex items-center">
          <button
            class={`unit-btn ${props.unit === "mm" ? "active" : ""}`}
            onClick={() => props.onUnitToggle("mm")}
            type="button"
          >
            Metric (mm)
          </button>
          <button
            class={`unit-btn ${props.unit === "in" ? "active" : ""}`}
            onClick={() => props.onUnitToggle("in")}
            type="button"
          >
            Imperial (in)
          </button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div class="presets-section">
        <Tooltip
          title="BLADE CASTER PRESETS"
          desc="Standard manufacturer blade offset (e) presets for popular CNC drag knife holders (Donek D1/D2/D4, Roland vinyl plotters, and utility blade cartridges)."
          source="Factory blade specs or calibrated measurements."
        >
          <label class="param-label">TOOL PRESETS (Donek / Roland)</label>
        </Tooltip>
        <div class="preset-buttons-grid">
          <For each={DRAG_KNIFE_PRESETS}>
            {(preset) => (
              <Tooltip
                title={preset.name}
                desc={preset.description}
                source={`Offset: ${props.unit === "in" ? `${preset.blade_offset_in}"` : `${preset.blade_offset_mm}mm`}`}
              >
                <button
                  class="preset-btn"
                  onClick={() => handlePresetSelect(preset.id)}
                  type="button"
                >
                  <div class="preset-name">{preset.name}</div>
                  <div class="preset-offset">
                    {props.unit === "in"
                      ? `${preset.blade_offset_in.toFixed(4)}" offset`
                      : `${preset.blade_offset_mm.toFixed(3)}mm offset`}
                  </div>
                </button>
              </Tooltip>
            )}
          </For>
        </div>
      </div>

      <div class="param-fields-grid">
        {/* Blade Offset */}
        <div class="param-group">
          <Tooltip
            title="BLADE OFFSET (e)"
            desc="Physical distance from the CNC spindle rotation axis to the razor blade's cutting edge. The spindle leads ahead of this distance, and corner swivel arcs use this radius (r = e)."
            source="Calibrate with test cuts or knife holder specifications."
          >
            <div class="flex items-center justify-between">
              <label class="param-label" for="blade-offset">
                BLADE OFFSET ({props.unit})
              </label>
              <span class="param-hint">Center to blade tip</span>
            </div>
          </Tooltip>
          <div class="input-with-unit surface-well">
            <input
              id="blade-offset"
              type="number"
              step={props.unit === "in" ? "0.001" : "0.01"}
              min="0.001"
              value={props.config.blade_offset}
              onInput={(e) =>
                props.onConfigChange({
                  ...props.config,
                  blade_offset: parseFloat(e.currentTarget.value) || 0,
                })
              }
              class="param-input"
            />
            <span class="input-unit-label">{props.unit}</span>
          </div>
        </div>

        {/* Tolerance Angle */}
        <div class="param-group">
          <Tooltip
            title="SWIVEL TOLERANCE ANGLE"
            desc="Corner deflection angle threshold. Directional turns sharper than this angle trigger a stationary G2/G3 swivel arc to orient the blade. Shallow angles continue tangent without pausing."
            source="Vectric Gadget default is 20°."
          >
            <div class="flex items-center justify-between">
              <label class="param-label" for="tolerance-angle">
                SWIVEL TOLERANCE ANGLE
              </label>
              <span class="param-hint">{props.config.tolerance_angle_deg}° threshold</span>
            </div>
          </Tooltip>
          <div class="flex items-center gap-2">
            <input
              id="tolerance-angle"
              type="range"
              min="5"
              max="90"
              step="1"
              value={props.config.tolerance_angle_deg}
              onInput={(e) =>
                props.onConfigChange({
                  ...props.config,
                  tolerance_angle_deg: parseFloat(e.currentTarget.value),
                })
              }
              class="param-slider"
            />
            <div class="input-with-unit surface-well mini-input">
              <input
                type="number"
                min="1"
                max="90"
                value={props.config.tolerance_angle_deg}
                onInput={(e) =>
                  props.onConfigChange({
                    ...props.config,
                    tolerance_angle_deg: parseFloat(e.currentTarget.value) || 20,
                  })
                }
                class="param-input text-center"
              />
              <span class="input-unit-label">°</span>
            </div>
          </div>
        </div>

        {/* Swivel Z-Lift Height */}
        <div class="param-group">
          <Tooltip
            title="SWIVEL Z-LIFT (MICRO-RETRACT)"
            desc="Slightly lifts the knife along the Z-axis during corner swivels to reduce lateral drag and prevent tearing or dimpling on soft or fragile materials (foam, veneer, leather, cardboard)."
            source="Optional Vectric feature for delicate stocks."
          >
            <div class="flex items-center justify-between">
              <label class="param-label flex items-center gap-2" for="enable-z-lift">
                <input
                  id="enable-z-lift"
                  type="checkbox"
                  checked={props.config.swivel_lift_height !== null}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    props.onConfigChange({
                      ...props.config,
                      swivel_lift_height: enabled
                        ? props.unit === "in"
                          ? 0.02
                          : 0.5
                        : null,
                    });
                  }}
                />
                SWIVEL Z-LIFT (CORNER RETRACT)
              </label>
              <span class="param-hint">Protects material surface</span>
            </div>
          </Tooltip>
          <Show when={props.config.swivel_lift_height !== null}>
            <div class="input-with-unit surface-well">
              <input
                type="number"
                step={props.unit === "in" ? "0.001" : "0.1"}
                value={props.config.swivel_lift_height ?? 0.5}
                onInput={(e) =>
                  props.onConfigChange({
                    ...props.config,
                    swivel_lift_height: parseFloat(e.currentTarget.value) || 0,
                  })
                }
                class="param-input"
              />
              <span class="input-unit-label">{props.unit}</span>
            </div>
          </Show>
        </div>

        {/* Swivel Feedrate */}
        <div class="param-group">
          <Tooltip
            title="SWIVEL FEED OVERRIDE"
            desc="Dedicated feedrate used during stationary corner pivot arcs. Lowering this feedrate ensures smooth, precise corner swiveling without blade chatter or vibration."
            source="Custom feed override for G2/G3 swivel moves."
          >
            <div class="flex items-center justify-between">
              <label class="param-label flex items-center gap-2" for="enable-swivel-feed">
                <input
                  id="enable-swivel-feed"
                  type="checkbox"
                  checked={props.config.swivel_feed !== null}
                  onChange={(e) => {
                    const enabled = e.currentTarget.checked;
                    props.onConfigChange({
                      ...props.config,
                      swivel_feed: enabled ? (props.unit === "in" ? 15.0 : 400.0) : null,
                    });
                  }}
                />
                SWIVEL FEED OVERRIDE
              </label>
              <span class="param-hint">Corner pivot speed</span>
            </div>
          </Tooltip>
          <Show when={props.config.swivel_feed !== null}>
            <div class="input-with-unit surface-well">
              <input
                type="number"
                step="10"
                value={props.config.swivel_feed ?? (props.unit === "in" ? 15.0 : 400.0)}
                onInput={(e) =>
                  props.onConfigChange({
                    ...props.config,
                    swivel_feed: parseFloat(e.currentTarget.value) || 400,
                  })
                }
                class="param-input"
              />
              <span class="input-unit-label">{props.unit}/min</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Action Buttons */}
      <div class="param-actions flex items-center justify-between">
        <Tooltip
          title="SPINDLE SAFETY INTERLOCK"
          desc="Removes M3/M4 spindle start commands from the output G-Code to ensure the machine spindle is completely disabled."
          source="Crucial drag knife hardware safety rule."
        >
          <label class="spindle-safe-toggle flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.config.disable_spindle}
              onChange={(e) =>
                props.onConfigChange({
                  ...props.config,
                  disable_spindle: e.currentTarget.checked,
                })
              }
            />
            <span class="text-secondary text-sm">Strip Spindle RPM (M3/M4 Safety)</span>
          </label>
        </Tooltip>

        <button
          class="btn-primary glow-accent"
          disabled={!props.hasFile || props.isProcessing}
          onClick={props.onProcess}
          type="button"
        >
          {props.isProcessing ? "PROCESSING..." : "GENERATE DRAG KNIFE TOOLPATH"}
        </button>
      </div>
    </div>
  );
};

