import { Component, createEffect, createSignal } from "solid-js";
import type { SheetConfig, SheetDatumPosition, Unit, ZZeroPosition } from "../types/dragknife";

interface SheetSettingsPanelProps {
  sheetConfig: SheetConfig;
  unit: Unit;
  onUpdateSheet: (config: SheetConfig) => void;
  onClose?: () => void;
}

export const SheetSettingsPanel: Component<SheetSettingsPanelProps> = (props) => {
  const [width, setWidth] = createSignal(props.sheetConfig.width);
  const [height, setHeight] = createSignal(props.sheetConfig.height);
  const [thickness, setThickness] = createSignal(props.sheetConfig.thickness);
  const [posX, setPosX] = createSignal(props.sheetConfig.originX);
  const [posY, setPosY] = createSignal(props.sheetConfig.originY);
  const [datum, setDatum] = createSignal<SheetDatumPosition>(props.sheetConfig.datumPosition);
  const [zZero, setZZero] = createSignal<ZZeroPosition>(props.sheetConfig.zZero);
  const [clearance, setClearance] = createSignal(props.sheetConfig.clearanceGap);
  const [plunge, setPlunge] = createSignal(props.sheetConfig.plungeGap);
  const [homeX, setHomeX] = createSignal(props.sheetConfig.homeX);
  const [homeY, setHomeY] = createSignal(props.sheetConfig.homeY);
  const [homeZ, setHomeZ] = createSignal(props.sheetConfig.homeZ);

  // Synchronize when analysis loads or parent props update
  createEffect(() => {
    setWidth(props.sheetConfig.width);
    setHeight(props.sheetConfig.height);
    setThickness(props.sheetConfig.thickness);
    setPosX(props.sheetConfig.originX);
    setPosY(props.sheetConfig.originY);
    setDatum(props.sheetConfig.datumPosition);
    setZZero(props.sheetConfig.zZero);
    setClearance(props.sheetConfig.clearanceGap);
    setPlunge(props.sheetConfig.plungeGap);
    setHomeX(props.sheetConfig.homeX);
    setHomeY(props.sheetConfig.homeY);
    setHomeZ(props.sheetConfig.homeZ);
  });

  const handleConfirm = () => {
    const updated: SheetConfig = {
      width: width(),
      height: height(),
      thickness: thickness(),
      originX: posX(),
      originY: posY(),
      datumPosition: datum(),
      zZero: zZero(),
      clearanceGap: clearance(),
      plungeGap: plunge(),
      homeX: homeX(),
      homeY: homeY(),
      homeZ: homeZ(),
      visible: true,
    };
    props.onUpdateSheet(updated);
  };

  const u = () => props.unit;

  return (
    <aside class="spark-sheet-settings-panel">
      {/* Panel Header */}
      <div class="sheet-header flex items-center justify-between">
        <h2 class="sheet-title font-bold text-white text-base">Sheet Settings</h2>
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

      <div class="sheet-scroll-body flex flex-col gap-4">
        {/* Section 1: Size */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Size</span>
          <div class="sheet-row-2">
            <div class="sheet-field">
              <label class="sheet-label">Width (X)</label>
              <div class="sheet-input-box">
                <input
                  type="number"
                  step={u() === "in" ? "0.1" : "1"}
                  value={width()}
                  onInput={(e) => setWidth(parseFloat(e.currentTarget.value) || 0)}
                  class="sheet-input"
                />
                <span class="sheet-unit-tag">{u()}</span>
              </div>
            </div>

            <div class="sheet-field">
              <label class="sheet-label">Length (Y)</label>
              <div class="sheet-input-box">
                <input
                  type="number"
                  step={u() === "in" ? "0.1" : "1"}
                  value={height()}
                  onInput={(e) => setHeight(parseFloat(e.currentTarget.value) || 0)}
                  class="sheet-input"
                />
                <span class="sheet-unit-tag">{u()}</span>
              </div>
            </div>
          </div>

          <div class="sheet-field mt-2">
            <label class="sheet-label">Thickness (Z)</label>
            <div class="sheet-input-box">
              <input
                type="number"
                step={u() === "in" ? "0.001" : "0.05"}
                value={thickness()}
                onInput={(e) => setThickness(parseFloat(e.currentTarget.value) || 0)}
                class="sheet-input"
              />
              <span class="sheet-unit-tag">{u()}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Position & Datum Quadrant Matrix */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Position</span>
          <div class="sheet-position-grid">
            <div class="sheet-xy-inputs flex flex-col gap-2">
              <div class="sheet-field">
                <label class="sheet-label">X</label>
                <div class="sheet-input-box">
                  <input
                    type="number"
                    step={u() === "in" ? "0.1" : "1"}
                    value={posX()}
                    onInput={(e) => setPosX(parseFloat(e.currentTarget.value) || 0)}
                    class="sheet-input"
                  />
                  <span class="sheet-unit-tag">{u()}</span>
                </div>
              </div>

              <div class="sheet-field">
                <label class="sheet-label">Y</label>
                <div class="sheet-input-box">
                  <input
                    type="number"
                    step={u() === "in" ? "0.1" : "1"}
                    value={posY()}
                    onInput={(e) => setPosY(parseFloat(e.currentTarget.value) || 0)}
                    class="sheet-input"
                  />
                  <span class="sheet-unit-tag">{u()}</span>
                </div>
              </div>
            </div>

            {/* 5-Point Datum Origin Selector Matrix */}
            <div class="datum-matrix-box">
              <div class="datum-matrix">
                {/* Top-Left */}
                <button
                  type="button"
                  class={`datum-dot ${datum() === "top-left" ? "active" : ""}`}
                  onClick={() => setDatum("top-left")}
                  title="Origin: Top-Left"
                />
                <span class="datum-guide-h" />
                {/* Top-Right */}
                <button
                  type="button"
                  class={`datum-dot ${datum() === "top-right" ? "active" : ""}`}
                  onClick={() => setDatum("top-right")}
                  title="Origin: Top-Right"
                />

                <span class="datum-guide-v" />
                {/* Center */}
                <button
                  type="button"
                  class={`datum-dot ${datum() === "center" ? "active" : ""}`}
                  onClick={() => setDatum("center")}
                  title="Origin: Center"
                />
                <span class="datum-guide-v" />

                {/* Bottom-Left (Default) */}
                <button
                  type="button"
                  class={`datum-dot ${datum() === "bottom-left" ? "active" : ""}`}
                  onClick={() => setDatum("bottom-left")}
                  title="Origin: Bottom-Left (Default)"
                />
                <span class="datum-guide-h" />
                {/* Bottom-Right */}
                <button
                  type="button"
                  class={`datum-dot ${datum() === "bottom-right" ? "active" : ""}`}
                  onClick={() => setDatum("bottom-right")}
                  title="Origin: Bottom-Right"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Z-Zero Position */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Z-Zero Position</span>
          <div class="sheet-z-zero-grid flex items-center justify-between">
            <div class="sheet-radio-group flex flex-col gap-2">
              <label class="sheet-radio-label">
                <input
                  type="radio"
                  name="z-zero"
                  checked={zZero() === "surface"}
                  onChange={() => setZZero("surface")}
                  class="sheet-radio"
                />
                <span>Sheet Surface</span>
              </label>

              <label class="sheet-radio-label">
                <input
                  type="radio"
                  name="z-zero"
                  checked={zZero() === "bed"}
                  onChange={() => setZZero("bed")}
                  class="sheet-radio"
                />
                <span>Machine Bed</span>
              </label>
            </div>

            {/* 3D Isometric Material Block Illustration */}
            <div class="z-zero-diagram">
              <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
                {/* 3D Block */}
                <polygon points="32,4 58,16 32,28 6,16" fill={zZero() === "surface" ? "#ef4444" : "#94a3b8"} opacity={zZero() === "surface" ? "1" : "0.7"} />
                <polygon points="6,16 32,28 32,44 6,32" fill="#b45309" opacity="0.85" />
                <polygon points="58,16 32,28 32,44 58,32" fill="#78350f" opacity="0.95" />
                {/* Top highlight outline */}
                <polygon points="32,4 58,16 32,28 6,16" stroke={zZero() === "surface" ? "#fca5a5" : "#cbd5e1"} stroke-width="1.2" fill="none" />
                {/* Bottom Bed outline if selected */}
                {zZero() === "bed" && (
                  <polygon points="6,32 32,44 58,32" stroke="#ef4444" stroke-width="2" fill="none" />
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* Section 4: Gaps Above Sheet */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Gaps Above Sheet</span>
          <div class="sheet-gaps-grid flex items-center justify-between">
            <div class="sheet-gaps-inputs flex flex-col gap-2 flex-1">
              <div class="sheet-field">
                <label class="sheet-label">Clearance (1)</label>
                <div class="sheet-input-box">
                  <input
                    type="number"
                    step={u() === "in" ? "0.1" : "1"}
                    value={clearance()}
                    onInput={(e) => setClearance(parseFloat(e.currentTarget.value) || 0)}
                    class="sheet-input"
                  />
                  <span class="sheet-unit-tag">{u()}</span>
                </div>
              </div>

              <div class="sheet-field">
                <label class="sheet-label">Plunge (2)</label>
                <div class="sheet-input-box">
                  <input
                    type="number"
                    step={u() === "in" ? "0.1" : "1"}
                    value={plunge()}
                    onInput={(e) => setPlunge(parseFloat(e.currentTarget.value) || 0)}
                    class="sheet-input"
                  />
                  <span class="sheet-unit-tag">{u()}</span>
                </div>
              </div>
            </div>

            {/* Clearance Diagram with Knife/Toolhead */}
            <div class="gaps-diagram">
              <svg width="74" height="60" viewBox="0 0 74 60" fill="none">
                {/* Workpiece */}
                <rect x="14" y="44" width="56" height="14" rx="2" fill="#d97706" opacity="0.8" />
                <line x1="10" y1="44" x2="72" y2="44" stroke="#fef3c7" stroke-width="1" />
                
                {/* Cutter body */}
                <rect x="50" y="6" width="6" height="14" fill="#cbd5e1" rx="1" />
                <polygon points="50,20 56,20 53,26" fill="#ef4444" />
                
                {/* Clearance line 1 (Top green) */}
                <line x1="14" y1="12" x2="50" y2="12" stroke="#22c55e" stroke-dasharray="2 2" />
                <circle cx="20" cy="12" r="6" fill="#1e293b" stroke="#22c55e" />
                <text x="20" y="15" font-size="8" font-family="sans-serif" font-weight="bold" fill="#22c55e" text-anchor="middle">1</text>
                
                {/* Plunge line 2 (Middle red/orange) */}
                <line x1="14" y1="28" x2="50" y2="28" stroke="#f97316" stroke-dasharray="2 2" />
                <circle cx="28" cy="28" r="6" fill="#1e293b" stroke="#f97316" />
                <text x="28" y="31" font-size="8" font-family="sans-serif" font-weight="bold" fill="#f97316" text-anchor="middle">2</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Section 5: Home Position */}
        <div class="sheet-section">
          <span class="sheet-section-heading">Home Position</span>
          <div class="sheet-row-2">
            <div class="sheet-field">
              <label class="sheet-label">X</label>
              <div class="sheet-input-box">
                <input
                  type="number"
                  step={u() === "in" ? "0.1" : "1"}
                  value={homeX()}
                  onInput={(e) => setHomeX(parseFloat(e.currentTarget.value) || 0)}
                  class="sheet-input"
                />
                <span class="sheet-unit-tag">{u()}</span>
              </div>
            </div>

            <div class="sheet-field">
              <label class="sheet-label">Y</label>
              <div class="sheet-input-box">
                <input
                  type="number"
                  step={u() === "in" ? "0.1" : "1"}
                  value={homeY()}
                  onInput={(e) => setHomeY(parseFloat(e.currentTarget.value) || 0)}
                  class="sheet-input"
                />
                <span class="sheet-unit-tag">{u()}</span>
              </div>
            </div>
          </div>

          <div class="sheet-field mt-2">
            <label class="sheet-label">Z Height Above Sheet</label>
            <div class="sheet-input-box">
              <input
                type="number"
                step={u() === "in" ? "0.1" : "1"}
                value={homeZ()}
                onInput={(e) => setHomeZ(parseFloat(e.currentTarget.value) || 0)}
                class="sheet-input"
              />
              <span class="sheet-unit-tag">{u()}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div class="sheet-actions flex flex-col gap-2 mt-2">
          <button
            type="button"
            class="sheet-confirm-btn"
            onClick={handleConfirm}
          >
            Confirm Sheet Settings
          </button>
          <button
            type="button"
            class="sheet-close-btn"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </aside>
  );
};
