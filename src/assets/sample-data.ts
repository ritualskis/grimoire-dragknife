export interface SampleFile {
  id: string;
  name: string;
  filename: string;
  description: string;
  gcode: string;
}

export const SAMPLE_GCODE_FILES: SampleFile[] = [
  {
    id: "simple-right-angle",
    name: "90° Right Angle (Corner Pivot)",
    filename: "simple-right-angle.nc",
    description: "50x50 mm L-bracket with a single sharp 90-degree counter-clockwise corner",
    gcode: `; ==========================================================
; Simple 90-Degree Right Angle Test Cut (simple-right-angle.nc)
; Input Target Profile:
;   Start Plunge: (0.000, 0.000)
;   Leg 1 (East): (50.000, 0.000)   [Heading = 0 deg]
;   CORNER VERTEX: (50.000, 0.000)  [Sharp 90 deg counter-clockwise turn]
;   Leg 2 (North): (50.000, 50.000) [Heading = +90 deg]
; ==========================================================
G21 ; Millimeters
G90 ; Absolute positioning
G17 ; XY Plane
G0 Z5.0000
G0 X0.0000 Y0.0000
G1 Z-1.5000 F600
G1 X50.0000 Y0.0000 F1000 ; Move east 50mm to corner vertex
G1 X50.0000 Y50.0000 F1000 ; Turn sharp 90 deg north to (50, 50)
G0 Z5.0000
M30
`,
  },
  {
    id: "box-contour",
    name: "Closed Rectangle (100x60 mm)",
    filename: "closed-rectangle.nc",
    description: "Closed rectangular loop with 4 sharp 90-degree corners",
    gcode: `; ==========================================================
; Closed Box Perimeter Cut
; ==========================================================
G21
G90
G17
G0 Z5.0000
G0 X0.0000 Y0.0000
G1 Z-1.8000 F600
G1 X100.0000 Y0.0000 F1200
G1 X100.0000 Y60.0000 F1200
G1 X0.0000 Y60.0000 F1200
G1 X0.0000 Y0.0000 F1200
G0 Z5.0000
M30
`,
  },
  {
    id: "hairpin-slot",
    name: "180° Hairpin Slit",
    filename: "hairpin-slot.nc",
    description: "Reverse direction cut testing 180-degree hairpin stationary swivel",
    gcode: `; ==========================================================
; 180-Degree Hairpin Direction Reversal
; ==========================================================
G21
G90
G17
G0 Z5.0000
G0 X0.0000 Y0.0000
G1 Z-1.2000 F500
G1 X120.0000 Y0.0000 F1000
G1 X0.0000 Y0.0000 F1000
G0 Z5.0000
M30
`,
  },
  {
    id: "ski-base-sample",
    name: "Ritual Skis • Base Cutout Perimeter",
    filename: "Blacklight_Base_Cutout.nc",
    description: "Full ski base planform profile with tip & tail tapers and edge sidecut",
    gcode: `; ==========================================================
; Ritual Skis • Ski Base Perimeter Cutout
; Model: Blacklight 1840mm
; ==========================================================
G21
G90
G17
G0 Z5.0000
G0 X10.0000 Y-65.0000
G1 Z-1.8000 F500
G1 X100.0000 Y-65.0000 F1400
G1 X800.0000 Y-48.0000 F1400
G1 X1700.0000 Y-58.0000 F1400
G1 X1840.0000 Y-25.0000 F1400
G1 X1840.0000 Y25.0000 F1400
G1 X1700.0000 Y58.0000 F1400
G1 X800.0000 Y48.0000 F1400
G1 X100.0000 Y65.0000 F1400
G1 X10.0000 Y65.0000 F1400
G1 X0.0000 Y20.0000 F1400
G1 X0.0000 Y-20.0000 F1400
G1 X10.0000 Y-65.0000 F1400
G0 Z5.0000
M30
`,
  },
];
