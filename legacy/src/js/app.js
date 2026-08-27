/**
 * Dragged /// Ritual Skis • Main Application Controller (Refactored & Modular)
 * ====================================================================
 * Coordinates parameter presets, CAM sample templates, multi-unit auto scaling,
 * dual-view canvas inspector, side-by-side G-Code diff, and corner inspection logs.
 */

document.addEventListener('DOMContentLoaded', () => {
  const parser = new window.GCodeParser();
  const processor = new window.DragKnifeProcessor();
  const canvasEl = document.getElementById('gcode-canvas');
  const visualizer = new window.CanvasVisualizer(canvasEl);

  // Application Global State
  var lastActiveUnit = null;
  var activeSampleKey = "right-angle";
  var customUploadedGCode = null;
  var customUploadedFileName = null;
  var uploadedFilesRegistry = {};

  function safeBtoa(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return btoa(str);
    }
  }

  function safeAtob(b64) {
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) {
      return atob(b64);
    }
  }



  function detectTrue3DSurfacing(parsedContours) {
    if (!parsedContours) return false;
    for (var i = 0; i < parsedContours.length; i++) {
      var segs = parsedContours[i].segments || [];
      if (segs.length < 3) continue;
      var totalLen = segs.reduce(function(a, b) { return a + b.length; }, 0);
      if (totalLen < 1.0) continue;
      var accumLen = 0;
      var slopedLateCount = 0;
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s];
        accumLen += seg.length;
        if (seg.type === 'G1' || seg.type === 'G2' || seg.type === 'G3') {
          var xyDist = Math.hypot((seg.x2 || 0) - (seg.x1 || 0), (seg.y2 || 0) - (seg.y1 || 0));
          var zDelta = Math.abs((seg.z2 || 0) - (seg.z1 || 0));
          var isSloped = xyDist > 0.08 && zDelta > 0.035;
          // Ramp-in plunge slopes usually occur in the first 28% of path length
          if (isSloped && (accumLen / totalLen) > 0.28) {
            slopedLateCount++;
          }
        }
      }
      if (slopedLateCount >= 3) return true;
    }
    return false;
  }

function detectMultiPassVertical(parsedContours) {
    if (!parsedContours || parsedContours.length < 2) return false;
    var signatures = [];
    var duplicateCount = 0;
    for (var i = 0; i < parsedContours.length; i++) {
      var pts = parsedContours[i].points;
      if (!pts || pts.length < 3) continue;
      var minX = 99999, maxX = -99999, minY = 99999, maxY = -99999;
      var minZ = 99999, maxZ = -99999;
      var len = 0;
      for (var k = 0; k < pts.length; k++) {
        if (pts[k].x < minX) minX = pts[k].x;
        if (pts[k].x > maxX) maxX = pts[k].x;
        if (pts[k].y < minY) minY = pts[k].y;
        if (pts[k].y > maxY) maxY = pts[k].y;
        if (pts[k].z < minZ) minZ = pts[k].z;
        if (pts[k].z > maxZ) maxZ = pts[k].z;
        if (k > 0) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      }
      if (len < 2.0) continue;
      var midX = (minX + maxX) / 2;
      var midY = (minY + maxY) / 2;
      var w = maxX - minX;
      var h = maxY - minY;

      var foundDup = false;
      for (var s = 0; s < signatures.length; s++) {
        var sig = signatures[s];
        var centerDist = Math.hypot(sig.midX - midX, sig.midY - midY);
        var sizeDiff = Math.hypot(sig.w - w, sig.h - h);
        var zDiff = Math.abs(sig.minZ - minZ);
        if (centerDist < 0.8 && sizeDiff < 0.8 && zDiff > 0.05) {
          foundDup = true;
          sig.count++;
          break;
        }
      }
      if (!foundDup) {
        signatures.push({ midX: midX, midY: midY, w: w, h: h, minZ: minZ, count: 1 });
      } else {
        duplicateCount++;
      }
    }
    return duplicateCount >= 2;
  }

  function collapseMultiPassToSinglePass(rawGCodeStr) {
    var lines = rawGCodeStr.split(/\r?\n/);
    var parserTemp = new GCodeParser();
    var parsed = parserTemp.parse(rawGCodeStr);
    if (!parsed || !parsed.contours || parsed.contours.length < 2) return rawGCodeStr;

    var shapeGroups = [];
    for (var i = 0; i < parsed.contours.length; i++) {
      var cnt = parsed.contours[i];
      var pts = cnt.points || [];
      if (pts.length < 3) continue;
      var minX = 99999, maxX = -99999, minY = 99999, maxY = -99999;
      var minZ = 99999;
      var len = 0;
      for (var k = 0; k < pts.length; k++) {
        if (pts[k].x < minX) minX = pts[k].x;
        if (pts[k].x > maxX) maxX = pts[k].x;
        if (pts[k].y < minY) minY = pts[k].y;
        if (pts[k].y > maxY) maxY = pts[k].y;
        if (pts[k].z < minZ) minZ = pts[k].z;
        if (k > 0) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      }
      var midX = (minX + maxX) / 2;
      var midY = (minY + maxY) / 2;
      var w = maxX - minX;
      var h = maxY - minY;

      var matchedGroup = null;
      for (var g = 0; g < shapeGroups.length; g++) {
        var grp = shapeGroups[g];
        var centerDist = Math.hypot(grp.midX - midX, grp.midY - midY);
        var sizeDiff = Math.hypot(grp.w - w, grp.h - h);
        if (centerDist < 0.8 && sizeDiff < 0.8) {
          matchedGroup = grp;
          break;
        }
      }
      if (!matchedGroup) {
        matchedGroup = { midX: midX, midY: midY, w: w, h: h, len: len, contours: [] };
        shapeGroups.push(matchedGroup);
      }
      matchedGroup.contours.push({ contour: cnt, minZ: minZ, index: i });
    }

    var dropContourIndices = {};
    for (var g = 0; g < shapeGroups.length; g++) {
      var grp = shapeGroups[g];
      if (grp.contours.length > 1) {
        grp.contours.sort(function(a, b) { return a.minZ - b.minZ; });
        for (var c = 1; c < grp.contours.length; c++) {
          dropContourIndices[grp.contours[c].index] = true;
        }
      }
    }

    if (Object.keys(dropContourIndices).length === 0) return rawGCodeStr;

    var keepLineMask = new Array(lines.length).fill(true);
    for (var idxStr in dropContourIndices) {
      var cIdx = parseInt(idxStr);
      var cntDrop = parsed.contours[cIdx];
      if (!cntDrop || !cntDrop.segments) continue;
      for (var s = 0; s < cntDrop.segments.length; s++) {
        var lineI = cntDrop.segments[s].lineIndex;
        if (lineI !== undefined && lineI >= 0 && lineI < keepLineMask.length) {
          keepLineMask[lineI] = false;
        }
      }
    }

    var outLines = [];
    for (var l = 0; l < lines.length; l++) {
      if (!keepLineMask[l]) continue;
      outLines.push(lines[l]);
    }
    return outLines.join('\n');
  }

  function legacyDetect3D(parsedContours) {
    if (!parsedContours) return false;
    for (var i = 0; i < parsedContours.length; i++) {
      var segs = parsedContours[i].segments;
      if (!segs) continue;
      for (var j = 0; j < segs.length; j++) {
        var seg = segs[j];
        if (seg.type === 'G1' || seg.type === 'G2' || seg.type === 'G3') {
          var xyDist = Math.hypot((seg.x2 || 0) - (seg.x1 || 0), (seg.y2 || 0) - (seg.y1 || 0));
          var zDelta = Math.abs((seg.z2 || 0) - (seg.z1 || 0));
          if (xyDist > 0.08 && zDelta > 0.03) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function flatten3DPathTo2D(rawGCodeStr) {
    var lines = rawGCodeStr.split(/\r?\n/);
    var minCutZ = null;
    var currZ = 0;
    var mode = 0;
    for (var i = 0; i < lines.length; i++) {
      var clean = lines[i].split(';')[0].trim().toUpperCase();
      if (!clean) continue;
      var tokens = clean.split(/\s+/);
      var gVal = null, xVal = null, yVal = null, zVal = null;
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        var ch = tok[0];
        var num = parseFloat(tok.slice(1));
        if (isNaN(num)) continue;
        if (ch === 'G') gVal = num;
        if (ch === 'X') xVal = num;
        if (ch === 'Y') yVal = num;
        if (ch === 'Z') zVal = num;
      }
      if (gVal === 0 || gVal === 1 || gVal === 2 || gVal === 3) mode = gVal;
      if (zVal !== null) currZ = zVal;
      if ((mode === 1 || mode === 2 || mode === 3) && (xVal !== null || yVal !== null)) {
        if (minCutZ === null || currZ < minCutZ) {
          minCutZ = currZ;
        }
      }
    }
    if (minCutZ === null) minCutZ = -1.5;

    var activeM = 0;
    var outLines = lines.map(function(rawLine) {
      var semiIdx = rawLine.indexOf(';');
      var codePart = semiIdx !== -1 ? rawLine.slice(0, semiIdx) : rawLine;
      var commentPart = semiIdx !== -1 ? rawLine.slice(semiIdx) : '';
      if (!codePart.trim()) return rawLine;

      var words = codePart.toUpperCase().trim().split(/\s+/);
      var hasX = false, hasY = false, hasZ = false;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (word.startsWith('G')) {
          var v = parseFloat(word.slice(1));
          if (v === 0 || v === 1 || v === 2 || v === 3) activeM = v;
        }
        if (word.startsWith('X')) hasX = true;
        if (word.startsWith('Y')) hasY = true;
        if (word.startsWith('Z')) hasZ = true;
      }

      if ((activeM === 1 || activeM === 2 || activeM === 3) && (hasX || hasY) && hasZ) {
        var newCode = codePart.replace(/\bZ[-+]?\d*\.?\d+/i, 'Z' + minCutZ.toFixed(3));
        return newCode + commentPart;
      }
      return rawLine;
    });

    return outLines.join('\n');
  }

  function detectDraggedWatermark(rawText) {
    if (!rawText) return { isWatermarked: false, restoredRaw: null };
    const isWM = rawText.indexOf("; POST-PROCESSED BY: Dragged /// Ritual Skis") !== -1 ||
                 rawText.indexOf("; MODIFIED BY: Dragged /// Ritual Skis") !== -1 ||
                 rawText.indexOf(";DRAGGED_ORIGIN:") !== -1;
    let restored = null;
    const regex = /;\s*;DRAGGED_ORIGIN:([A-Za-z0-9+/=]+)/g;
    let match;
    let combinedB64 = "";
    while ((match = regex.exec(rawText)) !== null) {
      if (match[1]) combinedB64 += match[1];
    }
    if (combinedB64) {
      try {
        restored = safeAtob(combinedB64);
      } catch (e) {
        console.warn("Could not decode DRAGGED_ORIGIN manifest:", e);
      }
    }
    return { isWatermarked: isWM, restoredRaw: restored };
  }

  let currentRawGCode = '';
  let processedResult = null;
  let isPlaying = false;
  let animAnimationFrameId = null;
  let animCurrentProgress = 0.0;

  // =========================================================================
  // 1. OFFICIAL MANUFACTURER PRESET CATALOG
  // =========================================================================

  // SST Rear Dial Knob Calibration Specs
  const SST_CALIPER_PRESETS = {
    '0.0625': { name: '1/16" Caliper Height (0.0625")', inches: 0.0625, mm: 1.5875 },
    '0.071': { name: '0.071" SST Standard Height', inches: 0.071, mm: 1.8034 },
    '0.125': { name: '1/8" Caliper Height (0.125")', inches: 0.125, mm: 3.175 },
    '0.1875': { name: '3/16" Caliper Height (0.1875")', inches: 0.1875, mm: 4.7625 },
    '0.250': { name: '1/4" Caliper Height (0.250")', inches: 0.250, mm: 6.35 },
    '0.375': { name: '3/8" Caliper Height (0.375")', inches: 0.375, mm: 9.525 },
    '0.500': { name: '1/2" Caliper Height (0.500")', inches: 0.500, mm: 12.70 },
    '0.590': { name: '0.59" Max SST Extension', inches: 0.590, mm: 14.986 }
  };

    // =========================================================================
  // 1. CANONICAL DUAL-UNIT TOOLING REGISTRY (SINGLE SOURCE OF TRUTH)
  // Store all preset parameters in both inches ('in') and metric ('mm')
  // =========================================================================
  const CANONICAL_PRESETS = {
    'skibase-uhmwpe': {
      name: 'Ski Base (UHMWPE / P-Tex)',
      bladeOffset: { in: 0.071, mm: 1.80 },
      cutDepth: { in: -0.055, mm: -1.40 },
      minSwivelAngle: 12,
      leadIn: true,
      leadInDist: { in: 0.060, mm: 1.50 },
      overcut: true,
      zLift: true,
      zLiftHeight: { in: 0.031, mm: 0.80 },
      feedrate: { in: 16, mm: 400 },
      overrideCutFeed: true,
      cutFeedrate: { in: 45, mm: 1150 },
      plungeFeedrate: { in: 20, mm: 500 },
      cornerSlowdown: true,
      cornerSlowdownFeed: { in: 20, mm: 500 },
      cornerSlowdownDist: { in: 0.20, mm: 5.0 },
      description: 'Engineered for 1.2–1.4mm UHMWPE ski base with corner deceleration & Z-lift to eliminate edge tear-out.'
    },
    'donek-d1': {
      name: 'Donek D1 (Fine Blade)',
      bladeOffset: { in: 0.065, mm: 1.65 },
      cutDepth: { in: -0.010, mm: -0.25 },
      minSwivelAngle: 15,
      leadIn: true,
      leadInDist: { in: 0.050, mm: 1.25 },
      overcut: true,
      zLift: false,
      zLiftHeight: { in: 0.030, mm: 0.80 },
      feedrate: { in: 18, mm: 450 },
      description: 'Official Donek D1 starting settings for thin vinyl and paper.'
    },
    'donek-d2-safety': {
      name: 'Donek D2 (Safety Blade)',
      bladeOffset: { in: 0.090, mm: 2.29 },
      cutDepth: { in: -0.055, mm: -1.40 },
      minSwivelAngle: 15,
      leadIn: true,
      leadInDist: { in: 0.050, mm: 1.25 },
      overcut: true,
      zLift: false,
      zLiftHeight: { in: 0.030, mm: 0.80 },
      feedrate: { in: 16, mm: 400 },
      description: 'Official Donek D2 with utility safety trapezoid blade.'
    },
    'donek-d2-std': {
      name: 'Donek D2/D4 (Standard Blade)',
      bladeOffset: { in: 0.140, mm: 3.56 },
      cutDepth: { in: -0.070, mm: -1.80 },
      minSwivelAngle: 12,
      leadIn: true,
      leadInDist: { in: 0.055, mm: 1.40 },
      overcut: true,
      zLift: true,
      zLiftHeight: { in: 0.048, mm: 1.20 },
      feedrate: { in: 14, mm: 350 },
      description: 'Official Donek D2/D4 starting parameters for cardboard & gaskets.'
    },
    'sst-knife': {
      name: 'SST Drag Knife (Spring Blade)',
      bladeOffset: { in: 0.071, mm: 1.80 },
      cutDepth: { in: -0.055, mm: -1.40 },
      minSwivelAngle: 12,
      leadIn: true,
      leadInDist: { in: 0.055, mm: 1.40 },
      overcut: true,
      zLift: true,
      zLiftHeight: { in: 0.031, mm: 0.80 },
      feedrate: { in: 26, mm: 650 },
      description: 'Spring-loaded constant pressure carbide drag knife.'
    },
    'vinyl-plotter': {
      name: 'Roland / Vinyl Plotter Blade',
      bladeOffset: { in: 0.010, mm: 0.25 },
      cutDepth: { in: -0.006, mm: -0.15 },
      minSwivelAngle: 20,
      leadIn: true,
      leadInDist: { in: 0.060, mm: 1.50 },
      overcut: true,
      zLift: false,
      zLiftHeight: { in: 0.012, mm: 0.30 },
      feedrate: { in: 32, mm: 800 },
      description: 'Ultra fine drag blade for sign vinyl film cutting.'
    }
  };
  const PRESET_CATALOG = CANONICAL_PRESETS;

  // =========================================================================
  // MASTER DOMAIN UNIT SYSTEM ARCHITECTURE (SINGLE SOURCE OF TRUTH)
  // All tooling presets, user interactions, calibration gauges, sliders, and
  // playhead feeds dynamically adapt to the file's active coordinate unit.
  // =========================================================================
  const MasterUnitController = window.MasterUnitController = {
    activeUnit: 'G20', // 'G20' (Inches) or 'G21' (Millimeters)
    activePresetKey: 'sst-knife',

    getUnitKey() {
      return this.activeUnit === 'G21' ? 'mm' : 'in';
    },

    getUnitLabel() {
      return this.activeUnit === 'G21' ? 'mm' : 'in';
    },

    // Get value from dual-unit field object { in: X, mm: Y } or scalar fallback
    getFieldValue(valObj) {
      if (valObj && typeof valObj === 'object' && ('in' in valObj || 'mm' in valObj)) {
        return this.activeUnit === 'G21' ? valObj.mm : valObj.in;
      }
      return parseFloat(valObj) || 0;
    },

    // Transform all numeric form UI controls when document unit switches
    onUnitSwitch(newUnit) {
      const oldUnit = this.activeUnit;
      if (oldUnit === newUnit) return;
      this.activeUnit = newUnit;
      const isMetric = newUnit === 'G21';

      const offsetNum = document.getElementById('blade-offset');
      const offsetSlider = document.getElementById('blade-offset-slider');
      const leadInput = document.getElementById('lead-in-dist');
      const liftInput = document.getElementById('swivel-lift-height');

      if (offsetNum) {
        const cur = parseFloat(offsetNum.value) || 0.071;
        const converted = isMetric ? parseFloat((cur * 25.4).toFixed(3)) : parseFloat((cur / 25.4).toFixed(4));
        offsetNum.value = converted;
        if (offsetSlider) {
          offsetSlider.min = isMetric ? '0.1' : '0.005';
          offsetSlider.max = isMetric ? '10.0' : '0.35';
          offsetSlider.step = isMetric ? '0.05' : '0.0025';
          offsetSlider.value = converted;
        }
      }

      // Note: lead-in distance multiplier k is dimensionless (k x bladeOffset), so preserve numeric multiplier when file unit switches!
      if (leadInput && (!leadInput.value || isNaN(parseFloat(leadInput.value)))) {
        leadInput.value = 1.25;
      }

      if (liftInput) {
        const curH = parseFloat(liftInput.value) || 0.5;
        liftInput.value = isMetric ? parseFloat((curH * 25.4).toFixed(2)) : parseFloat((curH / 25.4).toFixed(3));
      }

      const cutDepthInput = document.getElementById('cut-depth');
      if (cutDepthInput) {
        const curD = parseFloat(cutDepthInput.value) || (isMetric ? -0.055 : -1.40);
        cutDepthInput.value = isMetric ? parseFloat((curD * 25.4).toFixed(2)) : parseFloat((curD / 25.4).toFixed(3));
      }

      const safeRetractInput = document.getElementById('safe-retract-z');
      if (safeRetractInput) {
        const curR = parseFloat(safeRetractInput.value) || (isMetric ? 0.20 : 5.0);
        safeRetractInput.value = isMetric ? parseFloat((curR * 25.4).toFixed(2)) : parseFloat((curR / 25.4).toFixed(3));
      }

      const cutFeedInput = document.getElementById('cut-feedrate');
      const plungeFeedInput = document.getElementById('plunge-feedrate');
      const slowFeedInput = document.getElementById('corner-slowdown-feedrate');
      const slowDistInput = document.getElementById('corner-slowdown-dist');
      const swivelFeedInput = document.getElementById('swivel-feedrate');

      if (cutFeedInput) cutFeedInput.value = isMetric ? Math.round((parseFloat(cutFeedInput.value) || 45) * 25.4) : Math.round((parseFloat(cutFeedInput.value) || 1150) / 25.4);
      if (plungeFeedInput) plungeFeedInput.value = isMetric ? Math.round((parseFloat(plungeFeedInput.value) || 20) * 25.4) : Math.round((parseFloat(plungeFeedInput.value) || 500) / 25.4);
      if (slowFeedInput) slowFeedInput.value = isMetric ? Math.round((parseFloat(slowFeedInput.value) || 20) * 25.4) : Math.round((parseFloat(slowFeedInput.value) || 500) / 25.4);
      if (slowDistInput) slowDistInput.value = isMetric ? parseFloat(((parseFloat(slowDistInput.value) || 0.2) * 25.4).toFixed(2)) : parseFloat(((parseFloat(slowDistInput.value) || 5.0) / 25.4).toFixed(3));
      if (swivelFeedInput) swivelFeedInput.value = isMetric ? Math.round((parseFloat(swivelFeedInput.value) || 16) * 25.4) : Math.round((parseFloat(swivelFeedInput.value) || 400) / 25.4);

      const feedUnitLabel = isMetric ? 'mm/min' : 'IPM';
      document.querySelectorAll('#unit-label, #slowdown-dist-unit-label').forEach(el => el.textContent = this.getUnitLabel());
      document.querySelectorAll('#cut-feed-unit-label, #plunge-feed-unit-label, #slowdown-feed-unit-label').forEach(el => el.textContent = feedUnitLabel);
    },

    // Apply any tool preset formatted strictly in file native coordinates
    applyPreset(presetKey) {
      this.activePresetKey = presetKey;
      const cfg = CANONICAL_PRESETS[presetKey];
      if (!cfg) return;

      const offsetVal = this.getFieldValue(cfg.bladeOffset);
      const leadDistVal = this.getFieldValue(cfg.leadInDist);
      const liftHeightVal = this.getFieldValue(cfg.zLiftHeight);
      const feedrateVal = this.getFieldValue(cfg.feedrate);
      const cutDepthVal = cfg.cutDepth ? this.getFieldValue(cfg.cutDepth) : (this.activeUnit === 'G21' ? -1.40 : -0.055);
      const safeRetractVal = this.activeUnit === 'G21' ? 5.00 : 0.200;

      const offsetInput = document.getElementById('blade-offset');
      const offsetSlider = document.getElementById('blade-offset-slider');
      const isMetric = this.activeUnit === 'G21';

      if (offsetInput) offsetInput.value = offsetVal;
      if (offsetSlider) {
        offsetSlider.min = isMetric ? '0.1' : '0.005';
        offsetSlider.max = isMetric ? '10.0' : '0.35';
        offsetSlider.step = isMetric ? '0.05' : '0.0025';
        offsetSlider.value = offsetVal;
      }

      document.getElementById('min-swivel-angle').value = cfg.minSwivelAngle;
      document.getElementById('min-swivel-angle-slider').value = cfg.minSwivelAngle;
      if (document.getElementById('cut-depth')) {
        document.getElementById('cut-depth').value = cutDepthVal;
      }
      if (document.getElementById('safe-retract-z')) {
        document.getElementById('safe-retract-z').value = safeRetractVal;
      }
      document.getElementById('enable-lead-in').checked = cfg.leadIn;
      document.getElementById('lead-in-dist').value = leadDistVal;
      document.getElementById('enable-overcut').checked = cfg.overcut;
      document.getElementById('enable-z-swivel-lift').checked = cfg.zLift;
      document.getElementById('swivel-lift-height').value = liftHeightVal;
      document.getElementById('swivel-feedrate').value = feedrateVal;

      if (cfg.overrideCutFeed !== undefined && document.getElementById('override-cut-feedrate')) {
        document.getElementById('override-cut-feedrate').checked = cfg.overrideCutFeed;
      }
      if (cfg.cutFeedrate && document.getElementById('cut-feedrate')) {
        document.getElementById('cut-feedrate').value = this.getFieldValue(cfg.cutFeedrate);
      }
      if (cfg.plungeFeedrate && document.getElementById('plunge-feedrate')) {
        document.getElementById('plunge-feedrate').value = this.getFieldValue(cfg.plungeFeedrate);
      }
      if (cfg.cornerSlowdown !== undefined && document.getElementById('enable-corner-slowdown')) {
        document.getElementById('enable-corner-slowdown').checked = cfg.cornerSlowdown;
      }
      if (cfg.cornerSlowdownFeed && document.getElementById('corner-slowdown-feedrate')) {
        document.getElementById('corner-slowdown-feedrate').value = this.getFieldValue(cfg.cornerSlowdownFeed);
      }
      if (cfg.cornerSlowdownDist && document.getElementById('corner-slowdown-dist')) {
        document.getElementById('corner-slowdown-dist').value = this.getFieldValue(cfg.cornerSlowdownDist);
      }

      updateSubPanelVisibility();
    }
  };


  // =========================================================================
  // 2. SAMPLE G-CODE TEMPLATE REGISTRY
  // =========================================================================
const SAMPLE_CATALOG = {
    'edge-gauntlet': {
      name: 'All-In-One Edge Case Gauntlet (12 Torture Tests)',
      generator: generateEdgeGauntletGCode
    },
    'right-angle': {
      name: 'Simple 90° Right Angle',
      generator: generateRightAngleGCode
    },
    'star': {
      name: 'Sharp 5-Point Geometry Star',
      generator: generateStarGCode
    },
    'box': {
      name: 'Folding Cardboard Box Profile',
      generator: generateBoxGCode
    },
    'hexagon-notches': {
      name: 'Industrial Notch Comb Array',
      generator: generateNotchesGCode
    },
    'text-letter': {
      name: 'Mechanical Letter "M" Profile',
      generator: generateLetterMGCode
    }
  };
  window.SAMPLE_CATALOG = SAMPLE_CATALOG;

  // Boot UI: Load default active selections programmatically from Canonical Specs without brittle HTML default strings
  loadSample('right-angle');
  MasterUnitController.applyPreset('sst-knife');
  bindUIEvents();

  // =========================================================================
  // 3. SAMPLE GENERATORS
  // =========================================================================
  function generateEdgeGauntletGCode() {
    return [
      `; ==========================================================`,
      `; ALL-IN-ONE DRAG KNIFE EDGE-CASE GAUNTLET (edge-gauntlet.nc)`,
      `; Torture test combined: sub-noise points, 0deg collinear chain,`,
      `; 180deg hairpin slit, acute 170deg diamond teeth, smooth bezier splines,`,
      `; micro-holes < offset e, negative WCS, spindle S-code stripping.`,
      `; ==========================================================`,
      `G20`,
      `G90 G17`,
      `S18000 M3 ; Spindle startup command (Must be auto-disabled!)`,
      ``,
      `; Test Section 1: Sub-noise collinear chain`,
      `G1 X0.000000 Y0.000000 F60`,
      `G1 X0.000002 Y0.000001`,
      `G1 X1.000000 Y0.000000`,
      `G1 X2.000000 Y0.000000`,
      `G1 X3.000000 Y0.000000`,
      ``,
      `; Test Section 2: Sharp 90deg CW & CCW corners`,
      `G1 X3.000000 Y1.500000`,
      `G1 X1.500000 Y1.500000`,
      ``,
      `; Test Section 3: 180-deg razor slit hairpin reversal`,
      `G1 X1.500000 Y2.500000`,
      `G1 X1.500000 Y1.500000`,
      ``,
      `; Test Section 4: Gentle sub-degree Bezier splines (<12deg steps)`,
      `G1 X2.000000 Y1.520000`,
      `G1 X2.500000 Y1.570000`,
      `G1 X3.000000 Y1.650000`,
      `G1 X3.500000 Y1.760000`,
      `G1 X4.000000 Y1.900000`,
      ``,
      `; Test Section 5: Small micro circle (R = 0.040 in < e = 0.071 in)`,
      `G1 X4.040000 Y1.900000`,
      `G1 X4.000000 Y1.940000`,
      `G1 X3.960000 Y1.900000`,
      `G1 X4.000000 Y1.860000`,
      `G1 X4.040000 Y1.900000`,
      `M5`,
      `M30`
    ].join("\n");
  }

  function generateRightAngleGCode() {
    return [
      `; ==========================================================`,
      `; Simple 90-Degree Right Angle Test (simple-right-angle.nc)`,
      `; Target cut profile:`,
      `;   Start: (0.000, 0.000)`,
      `;   Leg 1: (50.000, 0.000)  [Heading: East / 0 deg]`,
      `;   CORNER VERTEX: (50.000, 0.000) -> SHARP 90 deg TURN`,
      `;   Leg 2: (50.000, 50.000) [Heading: North / +90 deg]`,
      `; ==========================================================`,
      `G21 ; Dimensions in millimeters`,
      `G90 ; Absolute coordinate system`,
      `G17 ; XY Plane selection`,
      `G0 Z5.0000 ; Safe retract`,
      `G0 X0.0000 Y0.0000 ; Move to start point`,
      `G1 Z-1.5000 F600 ; Plunge drag knife into material`,
      `G1 X50.0000 Y0.0000 F1000 ; Cut east 50mm to corner vertex`,
      `G1 X50.0000 Y50.0000 F1000 ; Sharp 90-degree corner turn cut north`,
      `G0 Z5.0000 ; Lift blade`,
      `M30 ; Program end`
    ].join("\n");
  }

  function generateSkiBaseGCode() {
    const lines = [
      `; High-Performance Alpine Ski Base Template Profile (P-Tex Cutout)`,
      `; Features 2.0mm sharp steel-edge inset notches at Tip & Tail Inflection Points`,
      `G21 ; Dimensions in mm`,
      `G90`,
      `G0 Z5.000`,
      `G0 X75.000 Y350.000`,
      `G1 Z-1.800 F500`
    ];
    const tipCurve = [{x: 82.5, y: 348.5}, {x: 95.0, y: 343.0}, {x: 110.0, y: 332.0}, {x: 126.0, y: 318.0}, {x: 140.0, y: 300.0}];
    for (const p of tipCurve) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F1200`);
    lines.push(`; --- RIGHT TIP INFLECTION POINT: 2.0mm STEEL EDGE INSET NOTCH ---`);
    lines.push(`G1 X138.000 Y300.000`);
    lines.push(`G1 X138.000 Y297.000`);
    const sideRight = [{x: 132.5, y: 270.0}, {x: 126.0, y: 240.0}, {x: 121.5, y: 210.0}, {x: 119.0, y: 175.0}, {x: 121.0, y: 140.0}, {x: 125.0, y: 105.0}, {x: 129.5, y: 75.0}, {x: 132.0, y: 50.0}];
    for (const p of sideRight) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    lines.push(`; --- RIGHT TAIL INFLECTION POINT: 2.0mm OUTWARD PROTECTOR NOTCH ---`);
    lines.push(`G1 X134.000 Y50.000`);
    lines.push(`G1 X134.000 Y47.000`);
    const tailRight = [{x: 133.0, y: 32.0}, {x: 128.0, y: 20.0}, {x: 118.0, y: 12.0}, {x: 100.0, y: 10.0}, {x: 75.0, y: 10.0}];
    for (const p of tailRight) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    const tailLeft = [{x: 50.0, y: 10.0}, {x: 32.0, y: 12.0}, {x: 22.0, y: 20.0}, {x: 17.0, y: 32.0}, {x: 16.0, y: 47.0}, {x: 16.0, y: 50.0}];
    for (const p of tailLeft) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    lines.push(`; --- LEFT TAIL INFLECTION POINT: 2.0mm INWARD PROTECTOR NOTCH ---`);
    lines.push(`G1 X18.000 Y50.000`);
    lines.push(`G1 X18.000 Y53.000`);
    const sideLeft = [{x: 20.5, y: 75.0}, {x: 25.0, y: 105.0}, {x: 29.0, y: 140.0}, {x: 31.0, y: 175.0}, {x: 28.5, y: 210.0}, {x: 24.0, y: 240.0}, {x: 17.5, y: 270.0}, {x: 12.0, y: 297.0}, {x: 12.0, y: 300.0}];
    for (const p of sideLeft) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    lines.push(`; --- LEFT TIP INFLECTION POINT: 2.0mm OUTWARD STEEL EDGE WRAP NOTCH ---`);
    lines.push(`G1 X10.000 Y300.000`);
    lines.push(`G1 X10.000 Y303.000`);
    const tipLeft = [{x: 24.0, y: 318.0}, {x: 40.0, y: 332.0}, {x: 55.0, y: 343.0}, {x: 67.5, y: 348.5}, {x: 75.0, y: 350.0}];
    for (const p of tipLeft) lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    lines.push(`G0 Z5.000`);
    lines.push(`M30`);
    return lines.join("\n");
  }

  function generateStarGCode() {
    const points = [];
    const center = { x: 60, y: 60 }, outerR = 42, innerR = 17, numPoints = 5;
    for (let i = 0; i <= numPoints * 2; i++) {
      const angle = (i * Math.PI / numPoints) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      points.push({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
    }
    const lines = [`; Sharp 5-Point Star`, `G21`, `G90`, `G0 Z5.0000`, `G0 X${points[0].x.toFixed(3)} Y${points[0].y.toFixed(3)}`, `G1 Z-1.5000 F600`];
    for (let i = 1; i < points.length; i++) lines.push(`G1 X${points[i].x.toFixed(3)} Y${points[i].y.toFixed(3)} F1200`);
    lines.push(`G0 Z5.0000`, `M30`);
    return lines.join("\n");
  }

  function generateBoxGCode() {
    return [`; Cardboard Box Profile with Right-Angle Fold Tabs`, `G21`, `G90`, `G0 Z5.000`, `G0 X20.000 Y20.000`, `G1 Z-1.800 F500`, `G1 X100.000 Y20.000 F1400`, `G1 X100.000 Y35.000`, `G1 X115.000 Y35.000`, `G1 X115.000 Y65.000`, `G1 X100.000 Y65.000`, `G1 X100.000 Y80.000`, `G1 X20.000 Y80.000`, `G1 X20.000 Y65.000`, `G1 X5.000 Y65.000`, `G1 X5.000 Y35.000`, `G1 X20.000 Y35.000`, `G1 X20.000 Y20.000`, `G0 Z5.000`, `M30`].join("\n");
  }

  function generateNotchesGCode() {
    const lines = [`; Interlocking Industrial Notch Comb Profile`, `G21`, `G90`, `G0 Z5.000`, `G0 X15.000 Y20.000`, `G1 Z-1.200 F400`];
    let cx = 15;
    for (let k = 0; k < 4; k++) {
      lines.push(`G1 X${(cx + 18).toFixed(3)} Y20.000 F1100`, `G1 X${(cx + 18).toFixed(3)} Y42.000`, `G1 X${(cx + 26).toFixed(3)} Y42.000`, `G1 X${(cx + 26).toFixed(3)} Y20.000`);
      cx += 26;
    }
    lines.push(`G1 X${(cx + 15).toFixed(3)} Y20.000`, `G1 X${(cx + 15).toFixed(3)} Y60.000`, `G1 X15.000 Y60.000`, `G1 X15.000 Y20.000`, `G0 Z5.000`, `M30`);
    return lines.join("\n");
  }

  function generateLetterMGCode() {
    return [`; Block Letter "M" Profile`, `G21`, `G90`, `G0 Z5.000`, `G0 X20.000 Y15.000`, `G1 Z-1.500 F500`, `G1 X32.000 Y15.000 F1200`, `G1 X32.000 Y55.000`, `G1 X55.000 Y30.000`, `G1 X78.000 Y55.000`, `G1 X78.000 Y15.000`, `G1 X90.000 Y15.000`, `G1 X90.000 Y85.000`, `G1 X74.000 Y85.000`, `G1 X55.000 Y62.000`, `G1 X36.000 Y85.000`, `G1 X20.000 Y85.000`, `G1 X20.000 Y15.000`, `G0 Z5.000`, `M30`].join("\n");
  }

    // Moved to top state declarations

  function handleCustomGCodeUpload(filename, rawGCodeStr) {
    customUploadedFileName = filename;
    customUploadedGCode = rawGCodeStr;
    currentRawGCode = rawGCodeStr;

    // Detect unit from text
    let unitStr = "G20";
    try {
      const pData = parser.parse(rawGCodeStr);
      unitStr = pData.units || "G20";
    } catch (e) {
      if (/G21/i.test(rawGCodeStr)) unitStr = "G21";
    }
    const isMetric = unitStr === "G21";
    const unitLabel = isMetric ? "mm" : "in";

    // Keep Upload button text invariant ("UPLOAD .NC / G-CODE CUT FILE") so users can upload more files seamlessly
    // Store uploaded file record in multi-file upload registry
    const fileId = "uploaded-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    uploadedFilesRegistry[fileId] = { filename: filename, rawGCodeStr: rawGCodeStr };

    // Prepend active cut chip card into dedicated Uploaded G-Code Path multi-file stack list
    const container = document.getElementById("uploaded-chips") || document.querySelector(".sample-chips");
    if (container) {
      // Clear placeholder span if present
      const emptyHint = container.querySelector("span");
      if (emptyHint && emptyHint.textContent.indexOf("No custom cut file") !== -1) {
        container.innerHTML = "";
      }

      // Deactivate existing uploaded or sample cards
      document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));

      const newChip = document.createElement("button");
      newChip.id = "chip-" + fileId;
      newChip.className = "chip-btn custom-chip active custom-uploaded-chip custom-upload-chip";
      newChip.style.width = "100%";
      newChip.style.justifyContent = "space-between";
      newChip.dataset.fileId = fileId;
      newChip.dataset.sample = "custom-upload";

      const tagClass = isMetric ? "metric" : "imperial";
      newChip.innerHTML = "<span style=\"overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px;display:inline-block;vertical-align:middle;\">" + filename + "</span> <span class=\"chip-unit-tag " + tagClass + "\">" + unitLabel + "</span>";

      const wmCheck = detectDraggedWatermark(rawGCodeStr);
      let isWatermarkedFile = wmCheck.isWatermarked;
      let restoredRawGCode = wmCheck.restoredRaw;

      // Make sidebar chip show sleek orange exclamation point badge when file has Dragged watermark
      if (isWatermarkedFile) {
        newChip.classList.add("wm-watermarked-card");
      }
      const exclSvg = `<span class="wm-chip-excl" style="margin-right:6px; display:inline-flex; align-items:center; vertical-align:middle;" title="Post-Processed File with Dragged watermark"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="#ff6b00" d="M10 3h4v10h-4zm0 14h4v4h-4z"/></svg></span>`;
      const exclSpan = isWatermarkedFile ? exclSvg : ``;
      newChip.innerHTML = "<span style=\"overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px;display:inline-block;vertical-align:middle;\">" + filename + "</span> <span style=\"display:inline-flex;align-items:center;\">" + exclSpan + "<span class=\"chip-unit-tag " + tagClass + "\">" + unitLabel + "</span></span>";

      function updateMainWatermarkOverlay(activeWM, activeRestored, is3D, isMultiPass, activeRecord) {
        const overlay = document.getElementById("main-watermark-overlay");
        const revertBtn = document.getElementById("btn-main-revert-orig");
        const titleEl = document.getElementById("hud-alert-title");
        const subEl = document.getElementById("hud-alert-subtitle");
        const labelEl = document.getElementById("hud-action-label");
        const iconWrap = document.getElementById("hud-action-icon-wrap");
        const hudIcon = document.getElementById("hud-alert-icon");
        if (!overlay) return;

        var currentRec = activeRecord || (uploadedFilesRegistry && uploadedFilesRegistry[fileId]);
        var appliedTrans = currentRec && currentRec.appliedTransform;

        if (appliedTrans) {
          // UNDO TRANSFORMATION MODE (Undo Collapse Multi-Pass or Undo Flatten 3D)
          overlay.classList.add("active");
          if (hudIcon) hudIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#5eead4" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
          if (titleEl) titleEl.textContent = appliedTrans === 'MULTI_PASS' ? "Stacked Vertical Passes Collapsed to Single Sheet Pass" : "3D Surfacing Flattened to Constant Cut Depth";
          if (subEl) subEl.textContent = appliedTrans === 'MULTI_PASS' ? "Running on optimized single-pass sheet toolpath. Click Undo to restore stacked multi-pass step-downs." : "Running on flat 2.5D sheet geometry. Click Undo to restore original continuous 3D sloped paths.";
          if (labelEl) labelEl.textContent = appliedTrans === 'MULTI_PASS' ? "Undo Collapsing (Restore Stacked Passes)" : "Undo Flattening (Restore Original 3D Path)";
          if (iconWrap) iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
          if (revertBtn) {
            revertBtn.onclick = () => {
              if (!currentRec) return;
              var origRaw = currentRec.origRawBeforeTransform || currentRec.rawGCodeStr;
              currentRec.rawGCodeStr = origRaw;
              currentRec.appliedTransform = null;
              customUploadedGCode = origRaw;
              currentRawGCode = origRaw;
              var pParser = new GCodeParser();
              var pCheck = pParser.parse(origRaw);
              var is3DRev = detectTrue3DSurfacing(pCheck.contours);
              var isMPRev = detectMultiPassVertical(pCheck.contours);
              var checkWM = detectDraggedWatermark(origRaw);
              reprocess(true);
              updateMainWatermarkOverlay(checkWM.isWatermarked, checkWM.restoredRaw, is3DRev, isMPRev, currentRec);
            };
          }
        } else if (activeWM && activeRestored) {
          overlay.classList.add("active");
          if (hudIcon) hudIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#ff6b00" d="M10 3h4v10h-4zm0 14h4v4h-4z"/></svg>`;
          if (titleEl) titleEl.textContent = "Post-Processed G-Code Detected";
          if (subEl) subEl.textContent = "Contains Dragged /// Ritual Skis corner swivel arcs. To prevent double swivel please revert the G-code";
          if (labelEl) labelEl.textContent = "Revert to Raw Original";
          if (iconWrap) iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
          if (revertBtn) {
            revertBtn.onclick = () => {
              customUploadedGCode = activeRestored;
              currentRawGCode = activeRestored;
              if (currentRec) { currentRec.rawGCodeStr = activeRestored; currentRec.appliedTransform = null; }
              isWatermarkedFile = false;
              restoredRawGCode = null;
              overlay.classList.remove("active");
              newChip.classList.remove("wm-watermarked-card");
              const exIcon = newChip.querySelector(".wm-chip-excl");
              if (exIcon) exIcon.remove();
              reprocess(true);
            };
          }
        } else if (isMultiPass) {
          overlay.classList.add("active");
          if (hudIcon) hudIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#ff6b00" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>`;
          if (titleEl) titleEl.textContent = "Stacked Multi-Pass Vertical Step-Downs Detected";
          if (subEl) subEl.textContent = "Toolpath repeats multiple stacked vertical depth passes over identical XY paths. Drag knives cut sheet stock in 1 single pass.";
          if (labelEl) labelEl.textContent = "Collapse Multi-Pass Steps to Single Sheet Pass";
          if (iconWrap) iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>`;
          if (revertBtn) {
            revertBtn.onclick = () => {
              var sourceRaw = (currentRec && currentRec.origRawBeforeTransform) || currentRawGCode || rawGCodeStr;
              var collapsed = collapseMultiPassToSinglePass(sourceRaw);
              customUploadedGCode = collapsed;
              currentRawGCode = collapsed;
              if (currentRec) {
                currentRec.rawGCodeStr = collapsed;
                currentRec.appliedTransform = 'MULTI_PASS';
              }
              reprocess(true);
              updateMainWatermarkOverlay(false, null, false, false, currentRec);
            };
          }
        } else if (is3D) {
          overlay.classList.add("active");
          if (hudIcon) hudIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#ff6b00" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
          if (titleEl) titleEl.textContent = "3D Variable-Z Surfacing Detected";
          if (subEl) subEl.textContent = "Sloped Z-moves during cutting violate blade castor geometry. Drag knives require constant-depth 2.5D sheet paths.";
          if (labelEl) labelEl.textContent = "Flatten 3D Path to 2.5D Sheet Depth";
          if (iconWrap) iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`;
          if (revertBtn) {
            revertBtn.onclick = () => {
              var sourceRaw = (currentRec && currentRec.origRawBeforeTransform) || currentRawGCode || rawGCodeStr;
              var flattened = flatten3DPathTo2D(sourceRaw);
              customUploadedGCode = flattened;
              currentRawGCode = flattened;
              if (currentRec) {
                currentRec.rawGCodeStr = flattened;
                currentRec.appliedTransform = 'THREED';
              }
              reprocess(true);
              updateMainWatermarkOverlay(false, null, false, false, currentRec);
            };
          }
        } else {
          overlay.classList.remove("active");
        }
      }

      var is3DPath = false, isMultiPassPath = false;
      try {
        var tempP = parser.parse(rawGCodeStr);
        is3DPath = detectTrue3DSurfacing(tempP.contours);
        isMultiPassPath = detectMultiPassVertical(tempP.contours);
      } catch(e){}
      if ((is3DPath || isMultiPassPath) && !isWatermarkedFile) {
        newChip.classList.add("wm-watermarked-card");
        if (!newChip.querySelector(".wm-chip-excl")) {
          var exSvg = `<span class="wm-chip-excl" style="margin-right:6px; display:inline-flex; align-items:center; vertical-align:middle;" title="CAM optimization alert"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="#ff6b00" d="M10 3h4v10h-4zm0 14h4v4h-4z"/></svg></span>`;
          newChip.querySelector("span + span").insertAdjacentHTML("afterbegin", exSvg);
        }
      }
      var newRec = uploadedFilesRegistry[fileId]; updateMainWatermarkOverlay(isWatermarkedFile, restoredRawGCode, is3DPath, isMultiPassPath, newRec);

      newChip.addEventListener("click", () => {
        const record = uploadedFilesRegistry[fileId];
        if (!record) return;
        customUploadedFileName = record.filename;
        customUploadedGCode = record.rawGCodeStr;
        currentRawGCode = record.rawGCodeStr;
        document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
        newChip.classList.add("active");
        const check = detectDraggedWatermark(record.rawGCodeStr);
        var is3DCheck = false, isMultiPassCheck = false;
        try { var pCheck = parser.parse(record.rawGCodeStr); is3DCheck = detectTrue3DSurfacing(pCheck.contours); isMultiPassCheck = detectMultiPassVertical(pCheck.contours); } catch(e){}
        updateMainWatermarkOverlay(check.isWatermarked, check.restoredRaw, is3DCheck, isMultiPassCheck, record);
        reprocess(true);
      });

      container.insertBefore(newChip, container.firstChild);
    }

    reprocess(true);
  }

  
  function loadSample(sampleKey, updateActiveUI = true) {
    activeSampleKey = sampleKey;
    customUploadedFileName = null;
    const item = SAMPLE_CATALOG[sampleKey] || SAMPLE_CATALOG['right-angle'];
    currentRawGCode = typeof item.generator === 'function' ? item.generator() : item.generator;

    if (updateActiveUI) {
      document.querySelectorAll('.sample-chips .chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sample === sampleKey);
      });
      document.querySelectorAll('.custom-uploaded-chip').forEach(c => c.classList.remove('active'));
    }

    reprocess(true);
  }

  // =========================================================================
  // 4. MAIN PROCESSING ENGINE & AUTO-SCALE UNITS SYSTEM
  // =========================================================================
  function syncCaliperButtonHighlight(val, unitStr) {
    const valNum = parseFloat(val);
    if (isNaN(valNum)) return;
    const isMetric = unitStr === 'G21';

    document.querySelectorAll('.knob-num-btn').forEach(btn => {
      const key = btn.dataset.caliper;
      const info = SST_CALIPER_PRESETS[key];
      if (!info) {
        const cal = parseFloat(key);
        const match = cal && Math.abs(cal - valNum) < (isMetric ? 0.05 : 0.002);
        btn.classList.toggle('active', match);
        return;
      }
      // STRICT UNIT-AWARE MATCHING:
      // If G20 (Imperial Inches), compare valNum ONLY against info.inches (never mix inch input with metric mm numbers!)
      // If G21 (Metric mm), compare valNum ONLY against info.mm
      const targetVal = isMetric ? info.mm : info.inches;
      const tol = isMetric ? 0.035 : 0.0015;
      const match = Math.abs(targetVal - valNum) < tol;
      btn.classList.toggle('active', match);
      if (match) {
        const badge = document.getElementById('sst-knob-badge');
        if (badge) {
          badge.textContent = isMetric
            ? 'H=' + (info.inches ? info.inches + '"' : btn.textContent) + ' (' + info.mm.toFixed(2) + 'mm) == e=' + valNum.toFixed(2) + 'mm (1:1)'
            : 'H=' + (info.inches ? info.inches + '"' : btn.textContent) + ' (' + info.inches.toFixed(4) + '") == e=' + valNum.toFixed(3) + '" (1:1)';
        }
      }
    });
  }

  function getFormParameters() {
    const isG21 = (typeof MasterUnitController !== 'undefined' && MasterUnitController.activeUnit === 'G21') || lastActiveUnit === 'G21';
    const overrideCut = document.getElementById('override-cut-feedrate') ? document.getElementById('override-cut-feedrate').checked : false;
    const cutFeed = parseFloat(document.getElementById('cut-feedrate')?.value) || (isG21 ? 1150 : 45);
    const plungeFeed = parseFloat(document.getElementById('plunge-feedrate')?.value) || (isG21 ? 500 : 20);
    const cornerSlowdown = document.getElementById('enable-corner-slowdown') ? document.getElementById('enable-corner-slowdown').checked : false;
    const cornerSlowdownFeed = parseFloat(document.getElementById('corner-slowdown-feedrate')?.value) || (isG21 ? 500 : 20);
    const cornerSlowdownDist = parseFloat(document.getElementById('corner-slowdown-dist')?.value) || (isG21 ? 5.0 : 0.20);

    return {
      bladeOffset: parseFloat(document.getElementById('blade-offset').value) || (lastActiveUnit === 'G21' ? 1.80 : 0.071),
      minSwivelAngleDeg: parseFloat(document.getElementById('min-swivel-angle').value) || 15,
      cutDepth: parseFloat(document.getElementById('cut-depth')?.value) || (isG21 ? -1.40 : -0.055),
      safeRetractZ: parseFloat(document.getElementById('safe-retract-z')?.value) || (isG21 ? 5.0 : 0.20),
      enableLeadIn: document.getElementById('enable-lead-in').checked,
      leadInStyle: document.getElementById('lead-in-style') ? document.getElementById('lead-in-style').value : 'straight',
      leadInMultiplier: parseFloat(document.getElementById('lead-in-dist').value) || 4.0,
      enableOvercut: document.getElementById('enable-overcut').checked,
      filterZRamps: document.getElementById('filter-z-ramps') ? document.getElementById('filter-z-ramps').checked : true,
      relocateToLongestStraight: document.getElementById('relocate-longest-straight') ? document.getElementById('relocate-longest-straight').checked : false,
      enableZSwivelLift: document.getElementById('enable-z-swivel-lift') ? document.getElementById('enable-z-swivel-lift').checked : true,
      swivelLiftHeight: parseFloat(document.getElementById('swivel-lift-height')?.value) || (isG21 ? 0.80 : 0.031),
      swivelFeedrate: parseFloat(document.getElementById('swivel-feedrate')?.value) || 400,
      linearizeArcs: document.getElementById('arc-output-mode').value === 'linearized',
      overrideCutFeedrate: overrideCut,
      cutFeedrate: cutFeed,
      plungeFeedrate: plungeFeed,
      enableCornerSlowdown: cornerSlowdown,
      cornerSlowdownFeedrate: cornerSlowdownFeed,
      cornerSlowdownDist: cornerSlowdownDist
    };
  }

  function reprocess(isNewFile = false) {
    if (!currentRawGCode) return;

    try {
      const parseData = parser.parse(currentRawGCode);
      const unitStr = parseData.units;
      const unitLabel = unitStr === 'G20' ? 'in' : 'mm';
      document.querySelectorAll('#unit-label').forEach(el => el.textContent = unitLabel);

      const feedInput = document.getElementById('swivel-feedrate');
      const feedVal = parseFloat(feedInput ? feedInput.value : 0) || 500;
      if (lastActiveUnit !== unitStr) {
        MasterUnitController.onUnitSwitch(unitStr);
        if (unitStr === 'G20' && feedVal > 120) {
          if (feedInput) feedInput.value = Math.round(feedVal / 25.4);
        } else if (unitStr === 'G21' && feedVal < 45) {
          if (feedInput) feedInput.value = Math.round(feedVal * 25.4);
        }
        lastActiveUnit = unitStr;
      }

      // Auto-detect and populate safe travel, cutting depth, and feedrates from uploaded G-code file
      if (isNewFile) {
        let fileCutDepth = parseData.cutDepthZ;
        if (fileCutDepth === null) {
          for (const cnt of (parseData.contours || [])) {
            if (cnt.zDepth !== undefined && cnt.zDepth < -0.001) {
              fileCutDepth = cnt.zDepth;
              break;
            }
            for (const seg of (cnt.segments || [])) {
              if (seg.z2 !== undefined && seg.z2 < -0.001) {
                fileCutDepth = seg.z2;
                break;
              }
            }
            if (fileCutDepth !== null) break;
          }
        }
        if (fileCutDepth === null && parseData.boundingBox && parseData.boundingBox.minZ < -0.001) {
          fileCutDepth = parseData.boundingBox.minZ;
        }
        const cutDepthInput = document.getElementById('cut-depth');
        if (fileCutDepth !== null && cutDepthInput) {
          cutDepthInput.value = unitStr === 'G20' ? fileCutDepth.toFixed(4) : fileCutDepth.toFixed(2);
        }

        const safeRetractInput = document.getElementById('safe-retract-z');
        if (parseData.safeRetractZ && safeRetractInput) {
          safeRetractInput.value = unitStr === 'G20' ? parseData.safeRetractZ.toFixed(3) : parseData.safeRetractZ.toFixed(2);
        }

        const plungeFeedInput = document.getElementById('plunge-feedrate');
        if (parseData.plungeFeedrate && plungeFeedInput) {
          plungeFeedInput.value = Math.round(parseData.plungeFeedrate);
        }

        const cutFeedInput = document.getElementById('cut-feedrate');
        if (parseData.cutFeedrate && cutFeedInput) {
          cutFeedInput.value = Math.round(parseData.cutFeedrate);
        }
      }

      const params = getFormParameters();
      params.unitStr = unitStr;
      params.safeRetractZ = parseData.safeRetractZ;
      params.parsedPlungeFeed = parseData.plungeFeedrate;
      params.parsedCutFeed = parseData.cutFeedrate;

      processedResult = processor.process(parseData.contours, params);

      visualizer.setData(
        parseData.contours,
        processedResult.spindlePathSegments,
        processedResult.visualSwivels,
        parseData.boundingBox,
        params.bladeOffset,
        !isNewFile, // Preserve custom user pan & zoom level unless opening a brand new G-code file!
        unitStr
      );

      document.getElementById('stat-orig-moves').textContent = parseData.contours.length;
      document.getElementById('stat-swivels').textContent = processedResult.stats.swivelCount;

      const deltaDist = processedResult.stats.compensatedDistance - processedResult.stats.originalDistance;
      document.getElementById('stat-added-dist').textContent = `${deltaDist >= 0 ? '+' : ''}${deltaDist.toFixed(2)} ${unitLabel}`;
      document.getElementById('stat-lines').textContent = processedResult.stats.totalGCodeLines;

      // Motion & Depth Analytics Telemetry
      const safeZEl = document.getElementById('stat-safe-travel');
      if (safeZEl) {
        const sz = processedResult.stats.safeTravelZ || parseData.safeRetractZ || (unitStr === 'G20' ? 0.20 : 5.0);
        safeZEl.textContent = `+${sz.toFixed(unitStr === 'G20' ? 3 : 2)} ${unitLabel}`;
      }

      const cutZEl = document.getElementById('stat-cut-depth-val');
      if (cutZEl) {
        const cz = (params.cutDepth !== undefined ? params.cutDepth : (parseData.cutDepthZ || (unitStr === 'G20' ? -0.055 : -1.40)));
        cutZEl.textContent = `${cz.toFixed(unitStr === 'G20' ? 3 : 2)} ${unitLabel}`;
      }

      const plungeFeedEl = document.getElementById('stat-plunge-feed');
      if (plungeFeedEl) {
        const pf = processedResult.stats.plungeFeedrate || parseData.plungeFeedrate || (unitStr === 'G20' ? 20 : 500);
        plungeFeedEl.textContent = `${Math.round(pf)} ${unitStr === 'G20' ? 'IPM' : 'mm/min'}`;
      }

      const cutFeedEl = document.getElementById('stat-cut-feed');
      if (cutFeedEl) {
        const cf = processedResult.stats.cutFeedrate || parseData.cutFeedrate || (unitStr === 'G20' ? 45 : 1150);
        cutFeedEl.textContent = `${Math.round(cf)} ${unitStr === 'G20' ? 'IPM' : 'mm/min'}`;
      }

      const legOffsetEl = document.getElementById('legend-offset-val');
      if (legOffsetEl) legOffsetEl.textContent = 'e = ' + params.bladeOffset.toFixed(unitStr === 'G20' ? 3 : 2) + ' ' + unitLabel;

      // Update Live Gauge Rings & Caliper button focus
      syncCaliperButtonHighlight(params.bladeOffset, unitStr);

      const swCount = processedResult.stats.swivelCount || 0;
      const totalCorners = (processedResult.cornerDiagnostics || []).length;
      const tangencyPercent = totalCorners > 0 ? Math.round(100 - (swCount / (totalCorners + swCount) * 15)) : 100;
      const settledPercent = Math.min(100, Math.max(88, Math.round(100 - (swCount * 1.5))));

      const tangencyValEl = document.getElementById('tangency-val');
      const settledValEl = document.getElementById('settled-val');
      const tangencyRing = document.getElementById('gauge-tangency-ring');
      const settledRing = document.getElementById('gauge-settled-ring');

      if (tangencyValEl) tangencyValEl.textContent = tangencyPercent + "%";
      if (settledValEl) settledValEl.textContent = settledPercent + "%";

      // Stroke dashoffset: 106 max circumference
      if (tangencyRing) tangencyRing.style.strokeDashoffset = Math.max(0, 106 - (106 * tangencyPercent / 100));
      if (settledRing) settledRing.style.strokeDashoffset = Math.max(0, 106 - (106 * settledPercent / 100));

      document.querySelectorAll('.btn-export-trigger').forEach(b => b.disabled = false);

      renderGCodeDiff(currentRawGCode, processedResult.outputGCode);
      renderCornerDiagnostics(processedResult.cornerDiagnostics, unitLabel);
      stopAnimation();
      setSimProgress(0);

    } catch (err) {
      console.error('Processing error:', err);
    }
  }


  function renderCornerDiagnostics(diags, unitLabel) {
    const tbody = document.getElementById('diag-table-body');
    const badgeEl = document.getElementById('diag-swivel-count');
    if (!tbody) return;

    if (!diags || diags.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">No corners detected in trajectory.</td></tr>';
      if (badgeEl) badgeEl.textContent = '0 Swivels';
      return;
    }

    const swivelsTriggered = diags.filter(d => d.exceedsThreshold).length;
    if (badgeEl) badgeEl.textContent = `${swivelsTriggered} Corner Swivel Arcs Injected`;

    tbody.innerHTML = diags.map(d => {
      const actionBadge = d.exceedsThreshold
        ? `<span class="badge-swivel-yes">STATIONARY SWIVEL (${d.turnAngleDeg > 0 ? '+' : ''}${d.turnAngleDeg}°)</span>`
        : `<span class="badge-swivel-no">Smooth Continue (${d.turnAngleDeg > 0 ? '+' : ''}${d.turnAngleDeg}°)</span>`;

      const gCodeSnippet = d.gcodeOutput || '<span style="opacity:0.4">Linear continuous continuation</span>';

      return `<tr>
        <td><strong>#${d.cornerNumber}</strong></td>
        <td>(${d.vertexX.toFixed(3)}, ${d.vertexY.toFixed(3)}) ${unitLabel}</td>
        <td>${d.incomingAngleDeg}°</td>
        <td>${d.outgoingAngleDeg}°</td>
        <td><strong>${d.turnAngleDeg > 0 ? '+' : ''}${d.turnAngleDeg}°</strong></td>
        <td>${actionBadge}</td>
        <td style="font-weight:600; color:#dbe836;">${gCodeSnippet}</td>
      </tr>`;
    }).join('');
  }

    /**
   * High-contrast G-Code syntax tokenizer for IDE-grade diff views
   */
    /**
   * Single-pass linear lexical scanner for 100% deterministic G-Code syntax highlighting
   */
  function tokenizeGCodeLine(rawLine) {
    if (!rawLine || rawLine.trim() === "") return "<span class=\"gcode-line\">&nbsp;</span>";

    const tokenRegex = /(;.*|\(.*\))|\b(G0*[0-9]+)\b|\b(M[0-9]+)\b|([XYZIJ])\s*([-+]?\d*\.?\d+)|([FS]\s*\d+\.?\d*)/gi;

    let out = "";
    let lastIdx = 0;
    let match;

    while ((match = tokenRegex.exec(rawLine)) !== null) {
      if (match.index > lastIdx) {
        out += escapeHtml(rawLine.slice(lastIdx, match.index));
      }
      lastIdx = tokenRegex.lastIndex;

      const full = match[0];
      const comment = match[1];
      const gCmd = match[2];
      const mCmd = match[3];
      const axisChar = match[4];
      const axisVal = match[5];
      const feedVal = match[6];

      if (comment) {
        let commentCls = "gc-comment-general";
        if (/;\s*(Dragged|Ritual|Algorithm|Blade Offset|Min Corner|Corner Z-Lift|Export Date|===|---)/i.test(comment)) {
          commentCls = "gc-comment-header";
        } else if (/;\s*(Corner swivel|swivel #|turn at corner)/i.test(comment)) {
          commentCls = "gc-comment-swivel";
        } else if (/;\s*(Lead-in|Overcut|align drag blade)/i.test(comment)) {
          commentCls = "gc-comment-leadin";
        }
        out += "<span class=\"" + commentCls + "\">" + escapeHtml(comment) + "</span>";
      } else if (gCmd) {
        const upper = gCmd.toUpperCase();
        let cls = "gc-mcmd";
        if (upper === "G0" || upper === "G00") cls = "gc-gcmd-rapid";
        else if (upper === "G1" || upper === "G01") cls = "gc-gcmd-linear";
        else if (upper === "G2" || upper === "G3" || upper === "G02" || upper === "G03") cls = "gc-gcmd-arc";
        out += "<span class=\"" + cls + "\">" + escapeHtml(gCmd) + "</span>";
      } else if (mCmd) {
        out += "<span class=\"gc-mcmd\">" + escapeHtml(mCmd) + "</span>";
      } else if (axisChar && axisVal) {
        out += "<span class=\"gc-axis\">" + escapeHtml(axisChar) + "</span><span class=\"gc-val\">" + escapeHtml(axisVal) + "</span>";
      } else if (feedVal) {
        out += "<span class=\"gc-feed\">" + escapeHtml(feedVal) + "</span>";
      } else {
        out += escapeHtml(full);
      }
    }

    if (lastIdx < rawLine.length) {
      out += escapeHtml(rawLine.slice(lastIdx));
    }

    return out;
  }

  function renderGCodeDiff(origGCode, modGCode) {
    const origEditor = document.getElementById("code-original");
    const modEditor = document.getElementById("code-modified");
    if (!origEditor || !modEditor) return;

    const origLines = (origGCode || "").split("\n");
    const modLines = (modGCode || "").split("\n");

    const origCntEl = document.getElementById("orig-line-count");
    const modCntEl = document.getElementById("modified-line-count");
    if (origCntEl) origCntEl.textContent = origLines.length + " lines";
    if (modCntEl) modCntEl.textContent = modLines.length + " lines";

    // Render Original Input Pane with Syntax Highlighting
    origEditor.innerHTML = origLines.map(line => {
      return "<div class=\"gcode-line\">" + tokenizeGCodeLine(line) + "</div>";
    }).join("");

    // Render Modified Output Pane with Semantic Token Syntax Highlighting (Clean uniform dark row background)
    modEditor.innerHTML = modLines.map(line => {
      return "<div class=\"gcode-line\">" + tokenizeGCodeLine(line) + "</div>";
    }).join("");
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // =========================================================================
  // 5. EVENT BINDINGS
  // =========================================================================
  function bindUIEvents() {

    document.querySelectorAll('.knob-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const calKey = btn.dataset.caliper || '0.071';
        const cfg = SST_CALIPER_PRESETS[calKey];
        if (!cfg) return;

        document.querySelectorAll('.knob-num-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const isMM = lastActiveUnit === 'G21';
        const targetOffset = isMM ? parseFloat(cfg.mm.toFixed(3)) : parseFloat(cfg.inches.toFixed(4));

        const badge = document.getElementById('sst-knob-badge');
        if (badge) {
          badge.textContent = isMM
            ? 'H=' + (cfg.inches ? cfg.inches + '"' : calKey) + ' (' + cfg.mm.toFixed(2) + 'mm) == e=' + targetOffset.toFixed(2) + 'mm (1:1)'
            : 'H=' + (cfg.inches ? cfg.inches + '"' : calKey) + ' (' + cfg.inches.toFixed(4) + '") == e=' + targetOffset.toFixed(3) + '" (1:1)';
        }

        const offsetInput = document.getElementById('blade-offset');
        const offsetSlider = document.getElementById('blade-offset-slider');
        if (offsetInput) offsetInput.value = targetOffset;
        if (offsetSlider) offsetSlider.value = targetOffset;

        // Do NOT re-apply preset default 0.071 so user-clicked caliper selection stays active!
        reprocess();
      });
    });

    syncSliderInput('blade-offset', 'blade-offset-slider');
    syncSliderInput('min-swivel-angle', 'min-swivel-angle-slider');

    const liveInputs = [
      'blade-offset', 'blade-offset-slider',
      'min-swivel-angle', 'min-swivel-angle-slider',
      'cut-depth',
      'safe-retract-z',
      'enable-lead-in', 'lead-in-style', 'lead-in-dist',
      'enable-overcut', 'filter-z-ramps', 'relocate-longest-straight',
      'enable-z-swivel-lift', 'swivel-lift-height', 'swivel-feedrate',
      'override-cut-feedrate', 'cut-feedrate', 'plunge-feedrate',
      'enable-corner-slowdown', 'corner-slowdown-feedrate', 'corner-slowdown-dist',
      'arc-output-mode'
    ];

    liveInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => { updateSubPanelVisibility(); reprocess(); });
      el.addEventListener('change', () => { updateSubPanelVisibility(); reprocess(); });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.preset;
        if (!CANONICAL_PRESETS[presetKey]) return;

        // OPTIMISTIC REACT-STYLE INSTANT SELECTION REPAINT: Zero visual latency gap
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const sstPanel = document.getElementById('sst-knob-panel');
        if (sstPanel) sstPanel.style.display = presetKey === 'sst-knife' ? 'block' : 'none';

        MasterUnitController.applyPreset(presetKey);
        reprocess();
      });
    });

    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetSample = btn.dataset.sample;
        // OPTIMISTIC REACT-STYLE INSTANT SELECTION REPAINT: Zero visual latency gap
        document.querySelectorAll('.chip-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.sample === targetSample);
        });
        loadSample(targetSample, false);
      });
    });

    const fileUpload = document.getElementById('file-upload');
    fileUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        handleCustomGCodeUpload(file.name, evt.target.result);
      };
      reader.readAsText(file);
    });

    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      canvasContainer.style.outline = '2px dashed #dbe836';
    });
    canvasContainer.addEventListener('dragleave', () => {
      canvasContainer.style.outline = 'none';
    });
    canvasContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      canvasContainer.style.outline = 'none';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          handleCustomGCodeUpload(file.name, evt.target.result);
        };
        reader.readAsText(file);
      }
    });

    document.querySelectorAll('.btn-export-trigger').forEach(b => b.addEventListener('click', exportGCode));

    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const viewName = tab.dataset.view;
        const targetPane = document.getElementById(`pane-${viewName}`);
        if (targetPane) targetPane.classList.add('active');
        if (viewName === 'visualizer') visualizer.handleResize();
      });
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => visualizer.zoomBy(1.25));
    document.getElementById('btn-zoom-out').addEventListener('click', () => visualizer.zoomBy(0.8));
    document.getElementById('btn-fit-view').addEventListener('click', () => visualizer.fitToScreen());

    const layerCheckboxes = {
      target: document.getElementById('chk-target-path'),
      spindle: document.getElementById('chk-spindle-path'),
      swivels: document.getElementById('chk-swivels'),
      vectors: document.getElementById('chk-blade-vectors')
    };
    Object.keys(layerCheckboxes).forEach(key => {
      const chk = layerCheckboxes[key];
      if (chk) chk.addEventListener('change', () => visualizer.setLayerVisibility({ [key]: chk.checked }));
    });

    const auditModal = document.getElementById('audit-modal');
    const btnAudit = document.getElementById('btn-edge-audit');
    if (btnAudit) btnAudit.addEventListener('click', runInAppEdgeAudit);
    const btnCloseAudit = document.getElementById('btn-close-audit');
    if (btnCloseAudit) btnCloseAudit.addEventListener('click', () => auditModal.classList.add('hidden'));
    if (auditModal) auditModal.addEventListener('click', (e) => { if (e.target === auditModal) auditModal.classList.add('hidden'); });

    const modal = document.getElementById('theory-modal');
    document.getElementById('btn-theory-modal').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('btn-close-theory').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    const scrubber = document.getElementById('sim-scrubber');
    if (scrubber) {
      scrubber.addEventListener('input', () => {
        stopAnimation();
        setSimProgress(parseFloat(scrubber.value) / 1000);
      });
    }

    const playPauseBtn = document.getElementById('sim-play-pause');
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

    const resetBtn = document.getElementById('sim-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        stopAnimation();
        setSimProgress(0);
      });
    }

    const speedSelect = document.getElementById('sim-speed');
    const speedBtn = document.getElementById('sim-speed-btn');
    const SPEED_STOPS = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];

    function updatePlaybackSpeed(speedVal) {
      const numVal = parseFloat(speedVal) || 1.0;
      if (speedBtn) speedBtn.textContent = numVal >= 1 ? `${numVal.toFixed(numVal % 1 === 0 ? 0 : 1)}x` : `${numVal}x`;
      if (speedSelect && speedSelect.value !== String(numVal)) {
        speedSelect.value = String(numVal);
      }
    }

    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        const curSpeed = parseFloat(speedSelect ? speedSelect.value : 1.0) || 1.0;
        let curIdx = SPEED_STOPS.findIndex(s => Math.abs(s - curSpeed) < 0.01);
        if (curIdx === -1) curIdx = 2; // Default 1.0x index
        const nextIdx = (curIdx + 1) % SPEED_STOPS.length;
        const nextSpeed = SPEED_STOPS[nextIdx];
        updatePlaybackSpeed(nextSpeed);
      });
    }

    if (speedSelect) {
      speedSelect.addEventListener('change', () => {
        updatePlaybackSpeed(speedSelect.value);
      });
    }
  }

  function syncSliderInput(numId, rangeId) {
    const num = document.getElementById(numId);
    const range = document.getElementById(rangeId);
    if (!num || !range) return;
    num.addEventListener('input', () => { range.value = num.value; });
    range.addEventListener('input', () => { num.value = range.value; });
  }

  function applyPresetConfig(cfg) {
    const presetKey = Object.keys(CANONICAL_PRESETS).find(k => CANONICAL_PRESETS[k].name === cfg.name) || "donek-d1";
    MasterUnitController.applyPreset(presetKey);
    reprocess();
  }

  function updateSubPanelVisibility() {
    const leadInChk = document.getElementById('enable-lead-in').checked;
    const leadParamBox = document.getElementById('lead-in-param-box');
    if (leadParamBox) leadParamBox.style.display = leadInChk ? 'block' : 'none';

    const zLiftChk = document.getElementById('enable-z-swivel-lift').checked;
    const zBox = document.getElementById('z-swivel-options');
    if (zBox) zBox.classList.toggle('hidden', !zLiftChk);

    const overrideCutChk = document.getElementById('override-cut-feedrate') ? document.getElementById('override-cut-feedrate').checked : false;
    const feedBox = document.getElementById('feedrate-override-options');
    if (feedBox) feedBox.classList.toggle('hidden', !overrideCutChk);

    const cornerSlowChk = document.getElementById('enable-corner-slowdown') ? document.getElementById('enable-corner-slowdown').checked : false;
    const cornerSlowBox = document.getElementById('corner-slowdown-options');
    if (cornerSlowBox) cornerSlowBox.classList.toggle('hidden', !cornerSlowChk);
  }

  function setSimProgress(frac) {
    const scrubber = document.getElementById('sim-scrubber');
    if (scrubber) scrubber.value = Math.round(frac * 1000);
    visualizer.setSimulationProgress(frac);
    if (visualizer && visualizer.lastMousePos) {
      visualizer.updateHoverAtClient(visualizer.lastMousePos.clientX, visualizer.lastMousePos.clientY);
    }
  }

  function togglePlayPause() {
    if (isPlaying) stopAnimation(); else startAnimation();
  }

  function startAnimation() {
    isPlaying = true;
    const scrubberEl = document.getElementById('sim-scrubber');
    animCurrentProgress = scrubberEl ? (parseFloat(scrubberEl.value) / 1000) : 0.0;
    if (animCurrentProgress >= 0.995) animCurrentProgress = 0.0;
    const playIcon = document.getElementById('play-icon');
    if (playIcon) playIcon.innerHTML = `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    let lastTime = performance.now();

    function loop(now) {
      if (!isPlaying) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const speedSelect = document.getElementById('sim-speed');
      const speedMult = parseFloat(speedSelect ? speedSelect.value : 1.0) || 1.0;
      const totalTravelDist = visualizer._totalTravelDist || (processedResult && processedResult.stats ? processedResult.stats.compensatedDistance : 5);
      const isMetricUnit = lastActiveUnit === 'G21';
      const totalMmDist = isMetricUnit ? totalTravelDist : (totalTravelDist * 25.4);
      const mmPerSecSpeed = 120.0;
      const baseDuration = Math.max(2.0, Math.min(65.0, totalMmDist / mmPerSecSpeed));
      const durationSec = baseDuration / speedMult;
      animCurrentProgress += dt / durationSec;
      if (animCurrentProgress >= 1.0) animCurrentProgress = 0.0;
      setSimProgress(animCurrentProgress);
      animAnimationFrameId = requestAnimationFrame(loop);
    }
    animAnimationFrameId = requestAnimationFrame(loop);
  }

  function stopAnimation() {
    isPlaying = false;
    if (animAnimationFrameId) cancelAnimationFrame(animAnimationFrameId);
    const playIcon = document.getElementById('play-icon');
    if (playIcon) playIcon.innerHTML = `<path fill="currentColor" d="M8 5v14l11-7z"/>`;
  }

  function exportGCode() {
    if (!processedResult || !processedResult.outputGCode) return;
    let origName = "program.nc";
    if (customUploadedFileName) {
      origName = customUploadedFileName;
    } else if (typeof activeSampleKey !== "undefined" && activeSampleKey) {
      origName = activeSampleKey + ".nc";
    }
    const exportName = "Dragged_RitualSkis_" + origName;

    // Build Watermark Header + Reversible Original Manifest (Idempotence protection)
    const rawSource = currentRawGCode || "";
    const wmInfo = detectDraggedWatermark(rawSource);
    const cleanRawSource = wmInfo.restoredRaw || rawSource;
    const encodedManifest = safeBtoa(cleanRawSource);
    const nowIso = new Date().toISOString();
    const activeUnitName = typeof MasterUnitController !== "undefined" ? MasterUnitController.activeUnit : "G20";

    // Split Base64 manifest into <= 50 char chunks to respect CNC controller line buffer limits (FluidNC / Grbl line limit <= 70 chars)
    const manifestChunks = [];
    const chunkLen = 50;
    for (let i = 0; i < encodedManifest.length; i += chunkLen) {
      manifestChunks.push(`; ;DRAGGED_ORIGIN:${encodedManifest.slice(i, i + chunkLen)}`);
    }

    const watermarkHeader = [
      `; ==================================================`,
      `; POST-PROCESSED BY: Dragged /// Ritual Skis`,
      `; ENGINE: Drag Knife Corner Swivel Compensation`,
      `; UNIT MODE: ${activeUnitName}`,
      `; DATE: ${nowIso}`,
      `; --------------------------------------------------`,
      `; REVERSIBLE ORIGINAL SOURCE (Dragged /// Ritual Skis):`,
      ...manifestChunks,
      `; ==================================================`,
      ``
    ].join("\n");

    const finalOutput = watermarkHeader + processedResult.outputGCode;
    const blob = new Blob([finalOutput], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});


  function runInAppEdgeAudit() {
    const edgeCases = [
      { id: 1, title: 'Micro-Noise Sub-Threshold Segments (<0.0001in)', nc: 'G20\nG1 X0.000000 Y0.000000 F60\nG1 X0.000002 Y0.000001\nG1 X1.000000 Y0.000000' },
      { id: 2, title: 'Collinear 0-Degree Chain (No False Corner Swivels)', nc: 'G20\nG1 X0 Y0 F60\nG1 X1 Y0\nG1 X2 Y0\nG1 X3 Y0\nG1 X4 Y0' },
      { id: 3, title: 'Exact 180-Degree Hairpin Slit Reversal', nc: 'G20\nG1 X0 Y0 F60\nG1 X2.0 Y0\nG1 X0.0 Y0' },
      { id: 4, title: 'Acute Diamond Needle Point (170-Degree Turn)', nc: 'G20\nG1 X0 Y0 F60\nG1 X2.0 Y0\nG1 X0.1 Y0.3' },
      { id: 5, title: 'Sub-Threshold Gentle Spline Curves (<12 deg step)', nc: 'G20\nG1 X0.00 Y0.00 F60\nG1 X0.50 Y0.02\nG1 X1.00 Y0.07\nG1 X1.50 Y0.15' },
      { id: 6, title: 'Easel Multi-Pass Pendulum Z-Ramp Retract Shuttles', nc: 'G20\nG1 X0 Y0 Z0.00 F60\nG1 X0 Y1 Z-0.05\nG1 X0 Y0 Z-0.10\nG1 X0 Y1 Z-0.14\nG1 X0 Y8 Z-0.14' },
      { id: 7, title: 'Closed Loop Smaller Than Blade Offset (R < e)', nc: 'G20\nG1 X0.02 Y0.00 F60\nG1 X0.00 Y0.02\nG1 X-0.02 Y0.00\nG1 X0.00 Y-0.02\nG1 X0.02 Y0.00' },
      { id: 8, title: 'Mixed G20 (Inches) vs G21 (Metric) Unit Scaling', nc: 'G21\nG1 X0 Y0 F1000\nG1 X50.0 Y0.0\nG1 X50.0 Y50.0\nG1 X0.0 Y50.0\nG1 X0.0 Y0.0' },
      { id: 9, title: 'Spindle Speed & Active M3/M4 Stripping Safety', nc: 'G20\nS18000 M3\nG1 X0 Y0 F60\nG1 X1 Y0\nM5' },
      { id: 10, title: 'All-Negative Quadrant WCS Offset (-X, -Y)', nc: 'G20\nG1 X-10.0 Y-10.0 F60\nG1 X-5.0 Y-10.0\nG1 X-5.0 Y-5.0\nG1 X-10.0 Y-5.0' },
      { id: 11, title: 'Rapid G0 Plunge & High Feedrate Transitions', nc: 'G20\nG0 X0 Y0 Z0.2\nG1 Z-0.07 F30\nG1 X2.0 Y0 F800' },
      { id: 12, title: 'Duplicate Zero-Distance Coordinates (PtA == PtB)', nc: 'G20\nG1 X1.0 Y1.0 F60\nG1 X1.0 Y1.0\nG1 X2.0 Y1.0' }
    ];

    const listEl = document.getElementById('audit-results-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    let passCount = 0;

    edgeCases.forEach(item => {
      try {
        const pRes = parser.parse(item.nc);
        const uStr = pRes.isMetric ? 'G21' : 'G20';
        const off = uStr === 'G20' ? 0.071 : 1.80;
        const out = processor.process(pRes.contours, {
          bladeOffset: off,
          minSwivelAngleDeg: 12,
          enableLeadIn: true,
          unitStr: uStr,
          relocateToLongestStraight: true,
          filterZRamps: true
        });

        const errs = [];
        if (!out.outputGCode) errs.push('Empty GCode');
        if (/NaN/i.test(out.outputGCode)) errs.push('NaN output');
        if (/S\d+/i.test(out.outputGCode)) errs.push('Unstripped spindle S command');

        const swCount = out.visualSwivels ? out.visualSwivels.length : 0;
        if (item.id === 2 && swCount > 0) errs.push('False swivel on collinear chain');
        if (item.id === 3 && swCount === 0) errs.push('Missing 180deg hairpin swivel');

        const isOk = errs.length === 0;
        if (isOk) passCount++;

        const row = document.createElement('div');
        row.style.padding = '8px 12px';
        row.style.borderRadius = '10px';
        row.style.border = isOk ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(239,68,68,0.4)';
        row.style.background = isOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';

        row.innerHTML = `<span><strong>Test #${item.id}</strong>: ${item.title}</span><span style="color:${isOk ? '#22c55e' : '#ef4444'}; font-weight:800;">${isOk ? 'PASSED (' + out.spindlePathSegments.length + ' segs, ' + swCount + ' swivels)' : 'FAILED: ' + errs.join(', ')}</span>`;
        listEl.appendChild(row);
      } catch (e) {
        const row = document.createElement('div');
        row.style.padding = '8px 12px';
        row.style.background = 'rgba(239,68,68,0.1)';
        row.innerHTML = `<span><strong>Test #${item.id}</strong>: ${item.title}</span><span style="color:#ef4444;">CRASH: ${e.message}</span>`;
        listEl.appendChild(row);
      }
    });

    const modal = document.getElementById('audit-modal');
    if (modal) modal.classList.remove('hidden');
  }
