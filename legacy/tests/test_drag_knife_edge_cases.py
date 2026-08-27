#!/usr/bin/env python3
"""
DragKnife Studio • Automated Mathematical Edge-Case & Stress Test Harness
Tests every conceivable G-code geometric & kinematic edge case for drag knives.
"""

import os, subprocess, sys

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'js')

# 12 Conceivable Torture Edge Cases in NC format
EDGE_CASE_TESTS = {
    "1. Micro-Noise Sub-Threshold Segments (<0.0001in)": """
G20
G1 X0.000000 Y0.000000 F60
G1 X0.000002 Y0.000001
G1 X0.000004 Y0.000002
G1 X1.000000 Y0.000000
    """,
    "2. Collinear 0-Degree Chain (No False Corner Swivels)": """
G20
G1 X0 Y0 F60
G1 X1 Y0
G1 X2 Y0
G1 X3 Y0
G1 X4 Y0
    """,
    "3. Exact 180-Degree Hairpin Slit Reversal": """
G20
G1 X0 Y0 F60
G1 X2.0 Y0
G1 X0.0 Y0
    """,
    "4. Acute Diamond Needle Point (170-Degree Turn)": """
G20
G1 X0 Y0 F60
G1 X2.0 Y0
G1 X0.1 Y0.3
    """,
    "5. Sub-Threshold Gentle Spline Curves (<12 deg step)": """
G20
G1 X0.00 Y0.00 F60
G1 X0.50 Y0.02
G1 X1.00 Y0.07
G1 X1.50 Y0.15
G1 X2.00 Y0.26
G1 X2.50 Y0.40
    """,
    "6. Easel Multi-Pass Pendulum Z-Ramp Retract Shuttles": """
G20
G1 X0 Y0 Z0.00 F60
G1 X0 Y1 Z-0.05
G1 X0 Y0 Z-0.10
G1 X0 Y1 Z-0.14
G1 X0 Y8 Z-0.14
    """,
    "7. Closed Loop Smaller Than Blade Offset (R < e)": """
G20
G1 X0.02 Y0.00 F60
G1 X0.00 Y0.02
G1 X-0.02 Y0.00
G1 X0.00 Y-0.02
G1 X0.02 Y0.00
    """,
    "8. Mixed G20 (Inches) vs G21 (Metric) Unit Scaling": """
G21
G1 X0 Y0 F1000
G1 X50.0 Y0.0
G1 X50.0 Y50.0
G1 X0.0 Y50.0
G1 X0.0 Y0.0
    """,
    "9. Spindle Speed & Active M3/M4 Stripping Safety": """
G20
S18000 M3
G1 X0 Y0 F60
G1 X1 Y0
M5
    """,
    "10. All-Negative Quadrant WCS Offset (-X, -Y)": """
G20
G1 X-10.0 Y-10.0 F60
G1 X-5.0 Y-10.0
G1 X-5.0 Y-5.0
G1 X-10.0 Y-5.0
G1 X-10.0 Y-10.0
    """,
    "11. Rapid G0 Plunge & High Feedrate Transitions": """
G20
G0 X0 Y0 Z0.2
G1 Z-0.07 F30
G1 X2.0 Y0 F800
G0 Z0.2
G0 X3.0 Y3.0
G1 Z-0.07 F30
G1 X5.0 Y3.0 F800
    """,
    "12. Duplicate Zero-Distance Coordinates (PtA == PtB)": """
G20
G1 X1.0 Y1.0 F60
G1 X1.0 Y1.0
G1 X1.0 Y1.0
G1 X2.0 Y1.0
    """,
    "13. Multi-Depth Stepdown Cutout De-Duplication (Single-Pass 2D Consolidation)": """
G20
G90
; Pass 1 (Z = -0.05)
G0 X0 Y0
G1 Z-0.05 F30
G1 X2 Y0 F60
G1 X2 Y2
G1 X0 Y2
G1 X0 Y0
; Pass 2 (Z = -0.10)
G1 Z-0.10 F30
G1 X2 Y0 F60
G1 X2 Y2
G1 X0 Y2
G1 X0 Y0
G0 Z0.5
    """,
    "14. Multi-Cutout Tabbed Profile Consolidation": """
G20
G90
G0 X0 Y0
G1 Z-0.08 F30
G1 X4 Y0 F60
G0 Z0.01
G1 X4.1 Y0
G1 Z-0.08
G1 X8 Y0
G1 X8 Y4
G1 X0 Y4
G1 X0 Y0
G0 Z0.5
    """,
    "15. Lead-In Ramp Overlap Closure (No-Tab Closed Loop Contour)": """
G20
G90
G0 X0 Y0
G1 Z0 F30
G1 X0.25 Y0 Z-0.10 F30
G1 X4 Y0 F60
G1 X4 Y4
G1 X0 Y4
G1 X0 Y0
G1 X0.25 Y0
G1 X0.30 Y0 Z-0.12 F30
G1 X4 Y0 F60
G1 X4 Y4
G1 X0 Y4
G1 X0 Y0
G1 X0.30 Y0
G0 Z0.5
    """
}

def run_js_suite():
    jsc_bin = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
    use_jsc = os.path.exists(jsc_bin)

    # Build automated test execution code inside JS
    js_test_runner = f"""
    var print = typeof print !== 'undefined' ? print : console.log;
    var load = typeof load !== 'undefined' ? load : function(p) {{ require('vm').runInThisContext(require('fs').readFileSync(p, 'utf8')); }};
    var window = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {{}});
    if (typeof global !== 'undefined') global.window = window;
    if (!window.addEventListener) window.addEventListener = function() {{}};
    var document = typeof document !== 'undefined' ? document : {{ addEventListener: function() {{}} }};
    if (typeof global !== 'undefined') global.document = document;
    load('{os.path.join(BASE_DIR, 'gcode-parser.js')}');
    load('{os.path.join(BASE_DIR, 'drag-knife-processor.js')}');

    var parser = new GCodeParser();
    var processor = new DragKnifeProcessor();
    var tests = {list(EDGE_CASE_TESTS.keys())};
    var ncs = {list(EDGE_CASE_TESTS.values())};

    var passed = 0;
    var failed = 0;

    for (var i = 0; i < tests.length; i++) {{
      var title = tests[i];
      var nc = ncs[i];
      try {{
        var pRes = parser.parse(nc);
        var unitStr = pRes.isMetric ? 'G21' : 'G20';
        var offset = unitStr === 'G20' ? 0.071 : 1.80;
        var out = processor.process(pRes.contours, {{
          bladeOffset: offset,
          minSwivelAngleDeg: 12,
          enableLeadIn: true,
          unitStr: unitStr,
          relocateToLongestStraight: true,
          filterZRamps: true
        }});

        // Invariant Verifications
        var errs = [];
        if (!out.outputGCode || out.outputGCode.length === 0) errs.push('Empty output G-code');
        if (/NaN/i.test(out.outputGCode)) errs.push('NaN value generated in output');
        if (/Infinity/i.test(out.outputGCode)) errs.push('Infinity generated in output');
        if (/S\\d+/i.test(out.outputGCode)) errs.push('Unstripped spindle S command');

        // Check verification of specific cases
        if (i === 1) {{ // Collinear zero-deg chain
          var swivelCount = out.visualSwivels ? out.visualSwivels.length : 0;
          if (swivelCount > 0) errs.push('False positive swivels on straight collinear chain: ' + swivelCount);
        }}
        if (i === 2) {{ // Hairpin 180 deg
          var swivelCount = out.visualSwivels ? out.visualSwivels.length : 0;
          if (swivelCount === 0) errs.push('Failed to generate 180-deg hairpin swivel arc');
        }}
        if (i === 5) {{ // Z ramp
          var countLines = out.outputGCode.split('\\n').length;
          if (countLines > 40) errs.push('Failed to eliminate multi-pass Z ramp shuttle passes');
        }}
        if (i === 12) {{ // Multi-depth stepdown deduplication
          var contourMatches = out.outputGCode.match(/--- Contour #/g) || [];
          if (contourMatches.length !== 1) errs.push('Expected exactly 1 deduplicated contour, got ' + contourMatches.length);
          if (!/Z-0.10/i.test(out.outputGCode)) errs.push('Failed to preserve deepest cut depth Z-0.10');
        }}
        if (i === 13) {{ // Tabbed profile stitch
          var contourMatches = out.outputGCode.match(/--- Contour #/g) || [];
          if (contourMatches.length !== 1) errs.push('Expected stitched tabbed contour, got ' + contourMatches.length);
        }}
        if (i === 14) {{ // Lead-in ramp overlap deduplication
          var contourMatches = out.outputGCode.match(/--- Contour #/g) || [];
          if (contourMatches.length !== 1) errs.push('Expected exactly 1 deduplicated contour, got ' + contourMatches.length);
          if (!/Z-0.12/i.test(out.outputGCode)) errs.push('Failed to preserve deepest cut depth Z-0.12');
        }}

        if (errs.length === 0) {{
          print('[PASS] ' + title + ' (' + out.spindlePathSegments.length + ' segs, ' + out.visualSwivels.length + ' swivels)');
          passed++;
        }} else {{
          print('[FAIL] ' + title + ' -> ' + errs.join('; '));
          failed++;
        }}
      }} catch (e) {{
        print('[CRASH] ' + title + ' -> ' + e.message);
        failed++;
      }}
    }}

    print('=== VERIFICATION SUMMARY: ' + passed + ' PASSED / ' + failed + ' FAILED ===');
    """

    runner_path = '/tmp/run_edge_tests.js'
    with open(runner_path, 'w') as f:
        f.write(js_test_runner)

    if use_jsc:
        res = subprocess.run([jsc_bin, runner_path], capture_output=True, text=True)
    else:
        res = subprocess.run(['node', runner_path], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print('STDERR:', res.stderr)
    return '0 FAILED' in res.stdout

if __name__ == '__main__':
    print("==========================================================")
    print("  DragKnife Studio • Bulletproof Edge Case Audit Suite    ")
    print("==========================================================")
    success = run_js_suite()
    sys.exit(0 if success else 1)
