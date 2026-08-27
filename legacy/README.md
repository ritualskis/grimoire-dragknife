# DragKnife Studio • G-Code Drag Knife Post-Processor & Visualizer

A specialized G-Code post-processor and visual simulation tool designed to convert standard CNC/laser/routing toolpaths into accurate **Drag Knife** toolpaths (such as for Donek D1/D2/D4 knives, Roland vinyl cutter blades, or utility blade drag attachments).

---

## Why Drag Knives Require Special Post-Processing

Unlike an endmill or laser beam centered directly on the machine's spindle coordinate $(X, Y)$, a **drag knife blade edge lags behind the spindle center** by a small fixed offset distance $e$ (the **Blade Offset** / C-offset):

1. **Straight Lines**: When driving straight, the machine spindle center leads ahead of the razor cut edge by $e$ along the movement direction vector.
2. **Sharp Corners**: At acute or right-angle corners ($90^\circ$, $45^\circ$, stars, notches), if the spindle turns sharply, the blade tip cuts a rounded arc or tears out the corner point.
3. **Corner Swivel Action**:
   - When the blade tip reaches the sharp corner point $(X_c, Y_c)$, the spindle stops progressive cut motion.
   - The CNC executes a circular pivot arc (**G2/G3**) centered on $(X_c, Y_c)$ with radius equal to blade offset $e$.
   - **During this pivot move, the sharp tip remains stationary pressed into the material corner while the blade body swivels in place** to align with the new cut heading!

---

## Web Application Features

Launch `index.html` in any browser to open **DragKnife Studio**:

- **Real-Time 2D Canvas Inspector**:
  - **Green Line**: Desired target cut profile in your material.
  - **Orange Line**: Calculated CNC machine spindle path (leading ahead by blade offset $e$).
  - **Cyan Rings & Markers**: Injected stationary corner swivel arcs with angle readout.
  - **Magenta Vectors**: Blade body drag caster links.
- **Scrubbable Drag-Knife Simulator**:
  - Animated 3D-styled spindle cone and trailing razor blade.
  - Step through or play back frame-by-frame to see exact stationary corner pivots.
- **Side-by-Side G-Code Diff View**:
  - Highlights modified lines (`G2/G3` swivel arcs, `lead-in`, `overcut`) next to your original source file.
- **Presets Included**:
  - Donek D2 ($1/16" / 1.588\text{ mm}$)
  - Donek D4 ($1/8" / 3.175\text{ mm}$)
  - Roland / Vinyl Plotter ($0.25\text{ mm}$)
  - DIY Box Cutter / Utility Blade ($2.50\text{ mm}$)
- **Advanced Features**:
  - **Corner Z-Swivel Lift**: Slightly lifts $Z$ height during dense corner swivels to prevent tearing cardboard/leather.
  - **Auto Straight Lead-In Entry**: Pre-aligns blade edge outside workpiece border.
  - **Closed-Loop Overcut**: Overlaps past finish vertex to sever shapes cleanly.

---

## Launching the Web App

You can open `index.html` directly in your browser, or spin up a local HTTP dev server:

```bash
# Serve the source web app:
cd src
python3 -m http.server 8000

# Or open dist/Dragged_RitualSkis_Portable.html directly in any browser
```
Then visit: [http://localhost:8000](http://localhost:8000)

---

## Python CLI Tool Usage

For CLI pipelines, script integration, or automated CAM workflows:

```bash
python3 drag_knife_postprocessor.py input.gcode -o output_dragknife.gcode --offset 1.588 --min-angle 15

# Or use the SST Drag Knife preset flag:
python3 drag_knife_postprocessor.py input.gcode --sst -o output_sst.gcode
```

### Options:
- `-e, --offset`: Blade offset $e$ in mm or inches (default: `1.588`)
- `-a, --min-angle`: Angle threshold in degrees to trigger swivel action (default: `15°`)
- `--z-lift`: Enable Z lift during corner swivels
- `--z-lift-height`: Distance to retract $Z$ during corner swivel (default: `0.8 mm`)
- `--no-lead-in`: Disable straight lead-in entry
- `--no-overcut`: Disable perimeter overlap end cut
