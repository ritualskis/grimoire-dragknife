# Grimoire DragKnife 🔪⚡

**Grimoire DragKnife** is a high-precision, barebones CNC G-Code Drag Knife post-processor, live toolpath analyzer, and Heads-Up Display (HUD) studio developed for [Ritual Skis](https://github.com/ritualskis).

Built with **Rust** and **Tauri v2 + SolidJS**, Grimoire DragKnife adheres to the exact, mathematically pure corner swivel kinematics of the **Vectric Drag Knife Gadget** without overcomplicated heuristics or bloated overrides.

---

## 🎯 Design Philosophy: Super Barebones & Vectric-Accurate

Traditional CAM software generates toolpaths designed for circular rotary cutters or lasers positioned directly at the machine spindle center $(X, Y)$. When utilizing a trailing drag knife blade (such as a Donek D1/D2/D4 knife, Roland plotter blade, or utility blade attachment), the razor cutting tip lags behind the spindle center by fixed distance $e$ (the **Blade Offset**).

Grimoire DragKnife performs the exact transformations implemented by the Vectric Drag Knife gadget:

1. **Tangent Spindle Lead**:
   - For straight cuts along unit heading $\vec{u}$, the CNC spindle leads ahead of the razor cut edge by $e \cdot \vec{u}$.
2. **Stationary Corner Swivels (G2 / G3)**:
   - When the trailing blade tip reaches corner vertex $P_c$, the tool stops forward progression.
   - If the turning deflection angle $|\Delta\theta| > \text{Tolerance Angle}$ (default: $20^\circ$), the machine executes a circular arc centered on vertex $P_c$ with radius $e$.
   - **The sharp razor tip stays stationary pressed in the material corner while the knife body swivels in place** to align with the next heading ($\Delta\theta > 0 \implies \text{G3 CCW}$, $\Delta\theta < 0 \implies \text{G2 CW}$).
3. **Optional Swivel Z-Lift**:
   - Retracts $Z$ slightly during stationary swivel pivots to prevent surface scuffing or tearing on delicate materials.
4. **Spindle Safety Protection**:
   - Strips or disables spindle rotation commands (`M3`/`M4`/`S...`) to protect knife collets and blades.

---

## 📊 Heads-Up Display (HUD) Telemetry

Upon opening any `.gcode`, `.nc`, or `.tap` toolpath file, Grimoire DragKnife instantly analyzes the geometry and renders a live **Heads-Up Display (HUD)**:

- **Units Mode**: Auto-detects `G20` (Imperial inches) vs `G21` (Metric millimeters).
- **Bounding Box Envelope**: $X_{min} \dots X_{max}$, $Y_{min} \dots Y_{max}$, $Z_{min} \dots Z_{max}$ and $W \times H \times D$ dimensions.
- **Cutting vs Rapid Distances**: Exact trajectory lengths.
- **Corner Swivel Counter**: Counts exact sharp corners requiring stationary swivel moves.
- **Contour Hierarchy**: Number of continuous contours, distinguishing closed loops from open slit paths.
- **Cycle Time Estimation**: Estimated machining duration computed from programmed feedrates.
- **Z-Plunge / Retract Summary**: Cut depth $Z_{cut}$ and rapid clearance height $Z_{safe}$.

---

## 🏗️ Architecture: Standalone & Integrated

Grimoire DragKnife is designed for dual deployment:

```
grimoire-dragknife/
├── crates/
│   └── grimoire-dragknife/     # Standalone Pure Rust Core Crate (zero GUI deps)
│       ├── src/
│       │   ├── parser.rs       # G-Code tokenizer & modal state tracker
│       │   ├── geometry.rs     # 2D/3D vectors, turn angles & arc math
│       │   ├── analyzer.rs     # HUD stats calculation
│       │   ├── processor.rs    # Vectric drag knife compensation algorithm
│       │   ├── emitter.rs      # G-Code generator
│       │   └── lib.rs          # Public Rust API
│       └── tests/              # Rust integration & edge-case test suite
├── src-tauri/                  # Tauri v2 Desktop Backend (IPC commands)
├── src/                        # SolidJS + TypeScript Frontend (Ritual Skis Design System)
│   ├── components/             # HudStatsCard, VisualizerCanvas, ParameterControls, etc.
│   └── lib/                    # dragknife-engine.ts & tauri.ts
└── Cargo.toml                  # Workspace manifest
```

### 1. Standalone Application
Runs as a native desktop application (via Tauri v2) or lightweight browser app with interactive 2D canvas simulation, file drag-and-drop, and `.nc` file export.

### 2. Integrated Mode (Future Grimoire / Grimoire-CAM Integration)
Because the core engine is a standalone, pure Rust crate with zero Tauri dependencies, `grimoire` can directly include it in `Cargo.toml`:
```toml
grimoire-dragknife = { path = "../grimoire-dragknife/crates/grimoire-dragknife" }
```
allowing Grimoire CAM workflows (such as ski base cutouts and topsheet processing) to invoke drag knife compensation natively in its pipeline.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (v1.75+)

### Installation & Development
```bash
# Clone the repository
git clone https://github.com/ritualskis/grimoire-dragknife.git
cd grimoire-dragknife

# Install frontend dependencies
npm install

# Run desktop app in development mode
npm run tauri dev

# Or run frontend in browser dev server
npm run dev
```

### Testing
```bash
# Run all Rust core engine tests
npm run test:cargo

# Run TypeScript / Vitest unit tests
npm test

# Run all test suites & typechecks
npm run test:all
```

---

## 📄 License

MIT © [Ritual Skis](https://github.com/ritualskis)
