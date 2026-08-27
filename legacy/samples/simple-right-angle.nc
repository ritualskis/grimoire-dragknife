; ==========================================================
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
