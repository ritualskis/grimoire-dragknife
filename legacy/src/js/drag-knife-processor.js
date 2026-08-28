/**
 * Dragged by Ritual Skis • Mathematical Drag Knife Post-Processor Engine
 * =================================================================
 * Converts standard CNC toolpaths (contour vectors) into blade-offset
 * compensated spindle trajectory moves with stationary corner swivel arcs (G2/G3).
 *
 * Mathematical Foundations (Donek Tools Algorithm):
 *   1. Vector Trajectory Heading: theta_N = atan2(dY, dX)
 *   2. Machine Spindle Center Lead: C_spindle = C_tip + e * (cos theta_N, sin theta_N)
 *   3. Incident Corner Angle Check: delta_theta = theta_{N+1} - theta_N
 *   4. Stationary Corner Pivot Arc: When |delta_theta| >= theta_min, freeze blade tip
 *      at corner vertex point (Xc, Yc) and execute circular arc (G2/G3) centered on (Xc, Yc)
 *      with radius equal to blade offset distance e.
 */

class DragKnifeProcessor {
  /**
   * Process raw contours into compensated Drag Knife toolpaths & formatted G-code
   * @param {Array} contours Parsed contour paths from GCodeParser
   * @param {Object} options Configuration parameters
   * @returns {Object} { outputGCode, spindlePathSegments, visualSwivels, cornerDiagnostics, stats }
   */
  /**
   * Calculates perpendicular distance from point (px, py) to line segment (x1, y1) -> (x2, y2).
   */
  distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  /**
   * Determines if a contour forms a closed loop, including lead-in ramp / overlap closures.
   */
  isContourClosed(contour, unitStr) {
    if (!contour) return false;
    if (contour.isClosed) return true;
    const segs = contour.segments;
    if (!segs || segs.length < 2) return false;
    const tol = unitStr === 'G20' ? 0.085 : 2.15;

    const fPt = segs[0];
    const lPt = segs[segs.length - 1];

    // 1. Direct endpoint gap
    if (Math.hypot(fPt.x1 - lPt.x2, fPt.y1 - lPt.y2) <= tol) return true;

    // 2. Traversal closure check (loop return after completing >= 70% of perimeter)
    let totalLen = 0;
    for (const s of segs) totalLen += s.length;
    if (totalLen < tol * 2) return false;

    let accumLen = 0;
    for (let i = 0; i < segs.length; i++) {
      accumLen += segs[i].length;
      if (accumLen > totalLen * 0.70) {
        const s = segs[i];
        if (Math.hypot(fPt.x1 - s.x2, fPt.y1 - s.y2) <= tol ||
            this.distToSegment(fPt.x1, fPt.y1, s.x1, s.y1, s.x2, s.y2) <= tol) {
          return true;
        }
      }
    }

    return false;
  }

  stitchContiguousContours(contours, unitStr) {
    if (!contours || contours.length < 2) return contours;
    const tol = unitStr === 'G20' ? 0.080 : 2.0;
    const stitched = [contours[0]];

    for (let i = 1; i < contours.length; i++) {
      const curr = contours[i];
      const lastContour = stitched[stitched.length - 1];
      const lastSegs = lastContour.segments;
      const currSegs = curr.segments;
      if (!lastSegs || !currSegs || lastSegs.length === 0 || currSegs.length === 0) {
        stitched.push(curr);
        continue;
      }

      // If lastContour is ALREADY a completed closed loop, do not stitch subsequent contours into it
      const isAlreadyClosed = this.isContourClosed(lastContour, unitStr);

      const endPt = lastSegs[lastSegs.length - 1];
      const startPt = currSegs[0];
      const d = Math.hypot(endPt.x2 - startPt.x1, endPt.y2 - startPt.y1);
      if (d <= tol && !isAlreadyClosed) {
        lastContour.segments = lastSegs.concat(currSegs);
        if (lastContour.points && curr.points) {
          lastContour.points = lastContour.points.concat(curr.points);
        }
      } else {
        stitched.push(curr);
      }
    }

    for (let s = 0; s < stitched.length; s++) {
      const c = stitched[s];
      if (this.isContourClosed(c, unitStr)) {
        c.isClosed = true;
      }
    }
    return stitched;
  }

  /**
   * Consolidates identical 2D multi-depth/stepdown passes into a single clean pass.
   * Preserves the deepest Z cutting level across passes while eliminating redundant passes.
   */
  deduplicate2DContours(contours, unitStr) {
    if (!contours || contours.length < 2) return contours;
    const tol = unitStr === 'G20' ? 0.08 : 2.0;
    const unique = [];

    for (const c of contours) {
      const segs = c.segments;
      if (!segs || segs.length === 0) continue;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, totalLen = 0;
      for (const s of segs) {
        minX = Math.min(minX, s.x1, s.x2);
        maxX = Math.max(maxX, s.x1, s.x2);
        minY = Math.min(minY, s.y1, s.y2);
        maxY = Math.max(maxY, s.y1, s.y2);
        totalLen += s.length;
      }

      let isDuplicate = false;
      for (let u = 0; u < unique.length; u++) {
        const prev = unique[u];
        const prevBounds = prev._bounds;
        const boundsMatch = Math.abs(minX - prevBounds.minX) < tol &&
                            Math.abs(maxX - prevBounds.maxX) < tol &&
                            Math.abs(minY - prevBounds.minY) < tol &&
                            Math.abs(maxY - prevBounds.maxY) < tol;
        const lenMatch = Math.abs(totalLen - prev._totalLen) / Math.max(1, totalLen) < 0.05;

        if (boundsMatch && lenMatch) {
          isDuplicate = true;
          // Retain the deepest cut level across both passes
          const prevMinZ = Math.min(...prev.segments.map(s => s.z2 !== undefined ? s.z2 : 0));
          const currMinZ = Math.min(...segs.map(s => s.z2 !== undefined ? s.z2 : 0));
          if (currMinZ < prevMinZ) {
            prev.segments.forEach(s => { s.z2 = currMinZ; s.z1 = currMinZ; });
            prev.zDepth = currMinZ;
          }
          break;
        }
      }

      if (!isDuplicate) {
        c._bounds = { minX, maxX, minY, maxY };
        c._totalLen = totalLen;
        unique.push(c);
      }
    }

    return unique;
  }

  process(rawContours, options) {
    const uStr = (options && (options.unitStr || options.units)) || (rawContours && rawContours[0] && rawContours[0].unitStr) || 'G21';
    let contours = this.stitchContiguousContours(rawContours, uStr);
    const deduplicateMultiPass = options ? options.deduplicateMultiPass !== false : true;
    if (deduplicateMultiPass) {
      contours = this.deduplicate2DContours(contours, uStr);
    }
    const {
      bladeOffset = (uStr === 'G20' ? 0.071 : 1.80),          // e (mm or inches)
      minSwivelAngleDeg = 12,     // threshold incident turn angle in degrees
      cutDepth: optCutDepth = null, // Target plunge cut depth Z (e.g. -1.40 mm)
      enableLeadIn = true,
      leadInMultiplier = 1.25,
      enableOvercut = true,
      enableZSwivelLift = true,
      swivelLiftHeight = (uStr === 'G20' ? 0.031 : 0.80),
      swivelFeedrate = (uStr === 'G20' ? 16 : 400),
      linearizeArcs = false,
      unitStr = uStr,
      overrideCutFeedrate = false,
      cutFeedrate = (unitStr === 'G20' ? 45 : 1150),
      plungeFeedrate = (unitStr === 'G20' ? 20 : 500),
      enableCornerSlowdown = false,
      cornerSlowdownFeedrate = (unitStr === 'G20' ? 20 : 500),
      cornerSlowdownDist = (unitStr === 'G20' ? 0.20 : 5.0),
      safeRetractZ = null,
      retractHeight = null,
      leadInStyle = 'straight',
      leadInRadius = null
    } = options || {};

    const defaultRetract = (unitStr === 'G20' ? 0.2000 : 5.0000);
    const safeRetractHeight = (retractHeight !== undefined && retractHeight !== null)
      ? retractHeight
      : (safeRetractZ !== undefined && safeRetractZ !== null && safeRetractZ > 0 ? safeRetractZ : defaultRetract);

    const minSwivelRad = (minSwivelAngleDeg * Math.PI) / 180;
    const outputLines = [];
    const spindlePathSegments = [];
    const visualSwivels = [];
    const cornerDiagnostics = [];
    let addedSwivelCount = 0;
    let totalOriginalDist = 0;
    let totalCompensatedDist = 0;

    const unitAbbr = unitStr === 'G20' ? 'in' : 'mm';

    // File Header
    outputLines.push(`; ==========================================================`);
    outputLines.push(`; Dragged by Ritual Skis • Post-Processed G-Code`);
    outputLines.push(`; Algorithm: Donek Tools Corner Swivel Compensation`);
    outputLines.push(`; Blade Offset (e): ${bladeOffset.toFixed(4)} ${unitAbbr}`);
    outputLines.push(`; Min Corner Swivel Angle: ${minSwivelAngleDeg}°`);
    outputLines.push(`; Safe Travel Clearance (Z): +${safeRetractHeight.toFixed(4)} ${unitAbbr}`);
    outputLines.push(`; Corner Z-Lift: ${enableZSwivelLift ? 'ENABLED (+' + swivelLiftHeight + ' ' + unitAbbr + ')' : 'DISABLED'}`);
    if (overrideCutFeedrate) {
      outputLines.push(`; Cut Feedrate Override: ${cutFeedrate} ${unitStr === 'G20' ? 'IPM' : 'mm/min'}`);
      outputLines.push(`; Plunge Feedrate: ${plungeFeedrate} ${unitStr === 'G20' ? 'IPM' : 'mm/min'}`);
    } else {
      outputLines.push(`; Motion Feeds: Preserving analyzed source CAM plunge & cutting velocities`);
    }
    if (enableCornerSlowdown) {
      outputLines.push(`; Corner Decel: ${cornerSlowdownFeedrate} ${unitStr === 'G20' ? 'IPM' : 'mm/min'} within ${cornerSlowdownDist} ${unitAbbr}`);
    }
    outputLines.push(`; Export Date: ${new Date().toLocaleString()}`);
    outputLines.push(`; ==========================================================`);
    outputLines.push(unitStr);
    outputLines.push(`G90 ; Absolute Coordinates`);
    outputLines.push(`G17 ; XY Plane Selection`);
    outputLines.push(`G0 Z${safeRetractHeight.toFixed(4)} ; Initial safe travel clearance`);
    outputLines.push(``);

    let lastRetractSpindleX = null;
    let lastRetractSpindleY = null;
    let lastExitHeading = null;

    for (let cIdx = 0; cIdx < contours.length; cIdx++) {
      const contour = contours[cIdx];
      const origSegs = contour.segments;
      if (!origSegs || origSegs.length === 0) continue;

      outputLines.push(`; --- Contour #${contour.id} ---`);


      // -------------------------------------------------------------
      // OPTIONAL: REMOVE PENDULUM Z-RAMP BACKTRACKING (EASEL HELICAL RAMPS)
      // Strips reciprocating A -> B -> A ping-pong moves generated by rotary endmill plunge ramps.
      // -------------------------------------------------------------
      const filterZRamps = options.filterZRamps !== false;
      const cleanSegs = [];
      const minMoveThreshold = unitStr === 'G20' ? 0.0002 : 0.005;
      const rampTol = unitStr === 'G20' ? 0.006 : 0.15;

      if (filterZRamps) {
        const maxRampLen = unitStr === 'G20' ? 0.60 : 15.0;
        let i = 0;
        while (i < origSegs.length) {
          const seg = origSegs[i];
          if (seg.length <= minMoveThreshold) {
            i++;
            continue;
          }

          // Check if seg starts a reciprocating shuttle ramp A -> B -> A
          let rampEndIdx = -1;
          let maxExtent = 0;
          for (let k = i + 1; k < Math.min(i + 8, origSegs.length); k++) {
            const returnSeg = origSegs[k];
            maxExtent = Math.max(maxExtent,
              Math.hypot(returnSeg.x1 - seg.x1, returnSeg.y1 - seg.y1),
              Math.hypot(returnSeg.x2 - seg.x1, returnSeg.y2 - seg.y1)
            );
            if (maxExtent > maxRampLen) break;

            const dot = Math.cos(seg.angle) * Math.cos(returnSeg.angle) + Math.sin(seg.angle) * Math.sin(returnSeg.angle);
            const distBack = Math.hypot(returnSeg.x2 - seg.x1, returnSeg.y2 - seg.y1);
            const hasZDescent = (returnSeg.z2 !== undefined && seg.z1 !== undefined && returnSeg.z2 < seg.z1 - 0.0001) ||
                                (seg.z1 !== undefined && seg.z2 !== undefined && seg.z2 < seg.z1 - 0.0001) ||
                                (returnSeg.z1 !== undefined && returnSeg.z2 !== undefined && returnSeg.z2 < returnSeg.z1 - 0.0001);

            if (dot < -0.82 && distBack < rampTol && (hasZDescent || i === 0)) {
              rampEndIdx = k;
              break;
            }
          }

          if (rampEndIdx !== -1) {
            i = rampEndIdx + 1;
            continue;
          }

          cleanSegs.push(seg);
          totalOriginalDist += seg.length;
          i++;
        }
      } else {
        for (let i = 0; i < origSegs.length; i++) {
          const seg = origSegs[i];
          if (seg.length <= minMoveThreshold) continue;
          cleanSegs.push(seg);
          totalOriginalDist += seg.length;
        }
      }

      if (cleanSegs.length === 0) continue;

      // Detect closed polygon loops
      const rawFirst = cleanSegs[0];
      const rawLast = cleanSegs[cleanSegs.length - 1];
      const isClosed = contour.isClosed || this.isContourClosed(contour, uStr) || (Math.hypot(rawFirst.x1 - rawLast.x2, rawFirst.y1 - rawLast.y2) < (uStr === 'G20' ? 0.085 : 2.15));

      let workingSegs = cleanSegs;
      const relocateStraight = options.relocateToLongestStraight === true;
      if (isClosed && relocateStraight && cleanSegs.length > 2) {
        workingSegs = this.relocateClosedLoopToLongestStraight(cleanSegs);
      }

      const firstSeg = workingSegs[0];
      const lastSeg = cleanSegs[cleanSegs.length - 1];

      const cutDepth = (optCutDepth !== undefined && optCutDepth !== null && !isNaN(parseFloat(optCutDepth)))
        ? parseFloat(optCutDepth)
        : (firstSeg.z2 !== undefined && Math.abs(firstSeg.z2) > 0.001 ? firstSeg.z2 : (unitStr === 'G20' ? -0.0551 : -1.4000));
      const initialEntryAngle = firstSeg.angle;

      const startTipX = firstSeg.x1;
      const startTipY = firstSeg.y1;

      // Compute initial machine spindle center location leading tip by e
      const startSpindleX = startTipX + bladeOffset * Math.cos(initialEntryAngle);
      const startSpindleY = startTipY + bladeOffset * Math.sin(initialEntryAngle);

      const activePlungeFeed = overrideCutFeedrate
        ? plungeFeedrate
        : (contour.plungeFeed || firstSeg.plungeFeed || (options && options.parsedPlungeFeed) || (firstSeg.feed && firstSeg.feed <= 600 ? firstSeg.feed : (unitStr === 'G20' ? 20 : 500)));

      // -------------------------------------------------------------
      // 1. LEAD-IN BLADE ENTRY (STRAIGHT vs SMOOTH SCRAP ARC vs DIRECT)
      // -------------------------------------------------------------
      const leadStyle = !enableLeadIn ? 'direct' : (leadInStyle || 'straight');

      if (leadStyle === 'scrap_arc' && isClosed) {
        // Calculate polygon signed area to determine CCW vs CW winding
        let area2 = 0;
        for (let s of workingSegs) area2 += (s.x1 * s.y2 - s.x2 * s.y1);
        const isCCW = area2 >= 0;

        // Normal pointing OUTWARD away from the shape into the scrap waste material
        const nx = isCCW ? Math.sin(initialEntryAngle) : -Math.sin(initialEntryAngle);
        const ny = isCCW ? -Math.cos(initialEntryAngle) : Math.cos(initialEntryAngle);

        const R = Math.max(1.5 * bladeOffset, leadInRadius || (unitStr === 'G20' ? 0.15 : 3.8));

        // Arc center located outside the shape in the scrap waste
        const cx = startTipX + R * nx;
        const cy = startTipY + R * ny;

        // Start plunge tip position outside the shape (90 deg back along arc)
        const startLeadTipX = cx - R * Math.cos(initialEntryAngle);
        const startLeadTipY = cy - R * Math.sin(initialEntryAngle);

        // Heading angle at plunge in scrap
        const leadHeadingAng = isCCW ? (initialEntryAngle + Math.PI / 2) : (initialEntryAngle - Math.PI / 2);
        const leadTx = Math.cos(leadHeadingAng);
        const leadTy = Math.sin(leadHeadingAng);

        // Spindle start position outside the shape in scrap (offset by e along heading)
        const startLeadSpindleX = startLeadTipX + bladeOffset * leadTx;
        const startLeadSpindleY = startLeadTipY + bladeOffset * leadTy;

        if (lastRetractSpindleX !== null && lastRetractSpindleY !== null) {
          spindlePathSegments.push({
            type: 'RAPID',
            x1: lastRetractSpindleX, y1: lastRetractSpindleY,
            x2: startLeadSpindleX, y2: startLeadSpindleY,
            startHeading: lastExitHeading !== null ? lastExitHeading : leadHeadingAng,
            endHeading: leadHeadingAng,
            isRapid: true
          });
          totalCompensatedDist += Math.hypot(startLeadSpindleX - lastRetractSpindleX, startLeadSpindleY - lastRetractSpindleY);
        }

        // I, J arc center offsets from startLeadSpindle
        const I = cx - startLeadSpindleX;
        const J = cy - startLeadSpindleY;
        const isCW = isCCW;
        const arcCmd = isCW ? 'G2' : 'G3';
        const leadFeed = overrideCutFeedrate ? (enableCornerSlowdown ? cornerSlowdownFeedrate : cutFeedrate) : (firstSeg.feed || 1000);

        outputLines.push(`; Smooth Scrap Arc Lead-In: plunge outside shape in waste material & curve into perimeter`);
        outputLines.push(`G0 X${startLeadSpindleX.toFixed(4)} Y${startLeadSpindleY.toFixed(4)}`);
        outputLines.push(`G1 Z${cutDepth.toFixed(4)} F${activePlungeFeed}`);
        outputLines.push(`${arcCmd} X${startSpindleX.toFixed(4)} Y${startSpindleY.toFixed(4)} I${I.toFixed(4)} J${J.toFixed(4)} F${leadFeed}`);

        const startPolar = Math.atan2(startLeadSpindleY - cy, startLeadSpindleX - cx);
        let endPolar = Math.atan2(startSpindleY - cy, startSpindleX - cx);
        let deltaPolar = endPolar - startPolar;
        if (isCW) {
          while (deltaPolar > 0) deltaPolar -= 2 * Math.PI;
        } else {
          while (deltaPolar < 0) deltaPolar += 2 * Math.PI;
        }

        spindlePathSegments.push({
          type: 'LEAD_ARC',
          x1: startLeadSpindleX, y1: startLeadSpindleY,
          x2: startSpindleX, y2: startSpindleY,
          pivotX: cx, pivotY: cy,
          radius: Math.hypot(startLeadSpindleX - cx, startLeadSpindleY - cy),
          startAngle: startPolar,
          endAngle: endPolar,
          deltaAngle: deltaPolar,
          startHeading: leadHeadingAng,
          endHeading: initialEntryAngle,
          isCW,
          isLead: true
        });
        totalCompensatedDist += (Math.PI / 2) * R;

      } else if (leadStyle === 'straight' || (enableLeadIn && !isClosed)) {
        const minLeadRunway = unitStr === 'G20' ? 0.35 : 9.0;
        const leadDist = (options && options.leadInDistance !== undefined && options.leadInDistance !== null && options.leadInDistance > 0)
          ? options.leadInDistance
          : Math.max(bladeOffset * (leadInMultiplier || 4.0), minLeadRunway);
        const leadStartTipX = startTipX - leadDist * Math.cos(initialEntryAngle);
        const leadStartTipY = startTipY - leadDist * Math.sin(initialEntryAngle);

        const leadStartSpindleX = leadStartTipX + bladeOffset * Math.cos(initialEntryAngle);
        const leadStartSpindleY = leadStartTipY + bladeOffset * Math.sin(initialEntryAngle);

        if (lastRetractSpindleX !== null && lastRetractSpindleY !== null) {
          spindlePathSegments.push({
            type: 'RAPID',
            x1: lastRetractSpindleX, y1: lastRetractSpindleY,
            x2: leadStartSpindleX, y2: leadStartSpindleY,
            startHeading: lastExitHeading !== null ? lastExitHeading : initialEntryAngle,
            endHeading: initialEntryAngle,
            isRapid: true
          });
          totalCompensatedDist += Math.hypot(leadStartSpindleX - lastRetractSpindleX, leadStartSpindleY - lastRetractSpindleY);
        }

        const activeLeadFeed = overrideCutFeedrate ? (enableCornerSlowdown ? cornerSlowdownFeedrate : cutFeedrate) : (firstSeg.feed || 1000);
        outputLines.push(`; Straight Lead-In: align drag blade to ${Math.round(initialEntryAngle * 180 / Math.PI)}° heading`);
        outputLines.push(`G0 X${leadStartSpindleX.toFixed(4)} Y${leadStartSpindleY.toFixed(4)}`);
        outputLines.push(`G1 Z${cutDepth.toFixed(4)} F${activePlungeFeed}`);
        outputLines.push(`G1 X${startSpindleX.toFixed(4)} Y${startSpindleY.toFixed(4)} F${activeLeadFeed}`);

        spindlePathSegments.push({
          type: 'LEAD',
          x1: leadStartSpindleX, y1: leadStartSpindleY,
          x2: startSpindleX, y2: startSpindleY,
          isLead: true
        });
        totalCompensatedDist += leadDist;
      } else {
        if (lastRetractSpindleX !== null && lastRetractSpindleY !== null) {
          spindlePathSegments.push({
            type: 'RAPID',
            x1: lastRetractSpindleX, y1: lastRetractSpindleY,
            x2: startSpindleX, y2: startSpindleY,
            startHeading: lastExitHeading !== null ? lastExitHeading : initialEntryAngle,
            endHeading: initialEntryAngle,
            isRapid: true
          });
          totalCompensatedDist += Math.hypot(startSpindleX - lastRetractSpindleX, startSpindleY - lastRetractSpindleY);
        }
        outputLines.push(`G0 X${startSpindleX.toFixed(4)} Y${startSpindleY.toFixed(4)}`);
        outputLines.push(`G1 Z${cutDepth.toFixed(4)} F${activePlungeFeed}`);
      }

      // -------------------------------------------------------------
      // 2. CONTOUR TRAVERSAL WITH CORNER SWIVEL DETECTION & SLOWDOWNS
      // -------------------------------------------------------------
      const hasSwivelAt = new Array(workingSegs.length).fill(false);
      for (let s = 0; s < workingSegs.length; s++) {
        const nextSeg = (s + 1 < workingSegs.length)
          ? workingSegs[s + 1]
          : (isClosed ? workingSegs[0] : null);
        if (nextSeg) {
          const delta = this.normalizeAngle(nextSeg.angle - workingSegs[s].angle);
          if (Math.abs(delta) >= minSwivelRad) {
            hasSwivelAt[s] = true;
          }
        }
      }

      let currentSpindleX = startSpindleX;
      let currentSpindleY = startSpindleY;

      for (let s = 0; s < workingSegs.length; s++) {
        const seg = workingSegs[s];
        const nextSeg = (s + 1 < workingSegs.length)
          ? workingSegs[s + 1]
          : (isClosed ? workingSegs[0] : null);

        const segEndTipX = seg.x2;
        const segEndTipY = seg.y2;
        const segAngle = seg.angle;

        const nextSpindleX = segEndTipX + bladeOffset * Math.cos(segAngle);
        const nextSpindleY = segEndTipY + bladeOffset * Math.sin(segAngle);

        const distMoved = Math.hypot(nextSpindleX - currentSpindleX, nextSpindleY - currentSpindleY);
        if (distMoved > (unitStr === 'G20' ? 0.00002 : 0.0005)) {
          const baseFeed = overrideCutFeedrate ? cutFeedrate : (seg.feed || 1000);
          const prevHadSwivel = (s > 0 && hasSwivelAt[s - 1]) || (s === 0 && isClosed && hasSwivelAt[workingSegs.length - 1]);
          const nextWillSwivel = hasSwivelAt[s];

          if (enableCornerSlowdown && (prevHadSwivel || nextWillSwivel)) {
            const dSlow = cornerSlowdownDist;
            const fSlow = cornerSlowdownFeedrate;

            if (distMoved <= dSlow * 1.5) {
              outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${fSlow} ; Corner proximity slowdown`);
            } else if (prevHadSwivel && !nextWillSwivel) {
              const tExit = dSlow / distMoved;
              const exitX = currentSpindleX + tExit * (nextSpindleX - currentSpindleX);
              const exitY = currentSpindleY + tExit * (nextSpindleY - currentSpindleY);
              outputLines.push(`G1 X${exitX.toFixed(4)} Y${exitY.toFixed(4)} F${fSlow} ; Swivel exit ramp`);
              outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${baseFeed}`);
            } else if (!prevHadSwivel && nextWillSwivel) {
              const tEntry = (distMoved - dSlow) / distMoved;
              const entryX = currentSpindleX + tEntry * (nextSpindleX - currentSpindleX);
              const entryY = currentSpindleY + tEntry * (nextSpindleY - currentSpindleY);
              outputLines.push(`G1 X${entryX.toFixed(4)} Y${entryY.toFixed(4)} F${baseFeed}`);
              outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${fSlow} ; Corner entry slowdown`);
            } else {
              if (distMoved > dSlow * 2.0) {
                const t1 = dSlow / distMoved;
                const t2 = (distMoved - dSlow) / distMoved;
                const exitX = currentSpindleX + t1 * (nextSpindleX - currentSpindleX);
                const exitY = currentSpindleY + t1 * (nextSpindleY - currentSpindleY);
                const entryX = currentSpindleX + t2 * (nextSpindleX - currentSpindleX);
                const entryY = currentSpindleY + t2 * (nextSpindleY - currentSpindleY);
                outputLines.push(`G1 X${exitX.toFixed(4)} Y${exitY.toFixed(4)} F${fSlow} ; Swivel exit ramp`);
                outputLines.push(`G1 X${entryX.toFixed(4)} Y${entryY.toFixed(4)} F${baseFeed}`);
                outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${fSlow} ; Corner entry slowdown`);
              } else {
                outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${fSlow} ; Corner proximity slowdown`);
              }
            }
          } else {
            outputLines.push(`G1 X${nextSpindleX.toFixed(4)} Y${nextSpindleY.toFixed(4)} F${baseFeed}`);
          }

          spindlePathSegments.push({
            type: 'CUT',
            x1: currentSpindleX, y1: currentSpindleY,
            x2: nextSpindleX, y2: nextSpindleY,
            tipX1: seg.x1, tipY1: seg.y1,
            tipX2: seg.x2, tipY2: seg.y2,
            angle: segAngle
          });
          totalCompensatedDist += distMoved;
        }

        currentSpindleX = nextSpindleX;
        currentSpindleY = nextSpindleY;

        // Analyze Incident Angle change at corner vertex
        if (nextSeg) {
          const nextAngle = nextSeg.angle;
          const deltaAngle = this.normalizeAngle(nextAngle - segAngle);
          const absDelta = Math.abs(deltaAngle);
          const turnDeg = Math.round(deltaAngle * 180 / Math.PI);

          const diagRecord = {
            cornerNumber: addedSwivelCount + 1,
            contourId: contour.id,
            vertexX: segEndTipX,
            vertexY: segEndTipY,
            incomingAngleDeg: Math.round(segAngle * 180 / Math.PI),
            outgoingAngleDeg: Math.round(nextAngle * 180 / Math.PI),
            turnAngleDeg: turnDeg,
            exceedsThreshold: absDelta >= minSwivelRad,
            actionTaken: 'SMOOTH_CONTINUOUS'
          };

          if (absDelta >= minSwivelRad) {
            addedSwivelCount++;
            diagRecord.cornerNumber = addedSwivelCount;
            diagRecord.actionTaken = 'STATIONARY_CORNER_SWIVEL';

            const swivelStartSpindleX = currentSpindleX;
            const swivelStartSpindleY = currentSpindleY;

            const swivelEndSpindleX = segEndTipX + bladeOffset * Math.cos(nextAngle);
            const swivelEndSpindleY = segEndTipY + bladeOffset * Math.sin(nextAngle);

            const isCW = deltaAngle < 0;

            outputLines.push(`; Corner swivel #${addedSwivelCount}: sharp ${turnDeg > 0 ? '+' : ''}${turnDeg}° turn at corner vertex (${segEndTipX.toFixed(3)}, ${segEndTipY.toFixed(3)})`);

            if (enableZSwivelLift) {
              const liftZ = cutDepth + swivelLiftHeight;
              outputLines.push(`G1 Z${liftZ.toFixed(4)} F600 ; Swivel lift`);
            }

            let gCodeLine = '';
            if (linearizeArcs) {
              const arcSteps = Math.max(6, Math.ceil(absDelta / (Math.PI / 16)));
              let prevLinX = swivelStartSpindleX;
              let prevLinY = swivelStartSpindleY;

              for (let step = 1; step <= arcSteps; step++) {
                const frac = step / arcSteps;
                const curAng = segAngle + deltaAngle * frac;
                const stepX = segEndTipX + bladeOffset * Math.cos(curAng);
                const stepY = segEndTipY + bladeOffset * Math.sin(curAng);

                outputLines.push(`G1 X${stepX.toFixed(4)} Y${stepY.toFixed(4)} F${swivelFeedrate}`);
                spindlePathSegments.push({
                  type: 'SWIVEL_LINE',
                  x1: prevLinX, y1: prevLinY,
                  x2: stepX, y2: stepY,
                  pivotX: segEndTipX, pivotY: segEndTipY
                });
                prevLinX = stepX;
                prevLinY = stepY;
              }
              gCodeLine = `G1 Linearized micro-segments (${arcSteps} steps)`;
            } else {
              // Native G2 / G3 Circular Arc centered at corner vertex (segEndTipX, segEndTipY)
              const I = segEndTipX - swivelStartSpindleX;
              const J = segEndTipY - swivelStartSpindleY;
              const gCodeCmd = isCW ? 'G2' : 'G3';
              gCodeLine = `${gCodeCmd} X${swivelEndSpindleX.toFixed(4)} Y${swivelEndSpindleY.toFixed(4)} I${I.toFixed(4)} J${J.toFixed(4)} F${swivelFeedrate}`;
              outputLines.push(gCodeLine);

              spindlePathSegments.push({
                type: 'SWIVEL_ARC',
                x1: swivelStartSpindleX, y1: swivelStartSpindleY,
                x2: swivelEndSpindleX, y2: swivelEndSpindleY,
                pivotX: segEndTipX, pivotY: segEndTipY,
                radius: bladeOffset,
                startAngle: segAngle,
                endAngle: nextAngle,
                isCW,
                deltaAngle
              });
            }

            diagRecord.gcodeOutput = gCodeLine;

            visualSwivels.push({
              id: addedSwivelCount,
              pivotX: segEndTipX,
              pivotY: segEndTipY,
              startSpindleX: swivelStartSpindleX,
              startSpindleY: swivelStartSpindleY,
              endSpindleX: swivelEndSpindleX,
              endSpindleY: swivelEndSpindleY,
              radius: bladeOffset,
              deltaAngleDeg: turnDeg,
              entryAngle: segAngle,
              exitAngle: nextAngle
            });

            totalCompensatedDist += bladeOffset * absDelta;

            if (enableZSwivelLift) {
              outputLines.push(`G1 Z${cutDepth.toFixed(4)} F600 ; Restore cut height`);
            }

            currentSpindleX = swivelEndSpindleX;
            currentSpindleY = swivelEndSpindleY;
          }

          cornerDiagnostics.push(diagRecord);
        }
      }

      // -------------------------------------------------------------
      // 3. OVERCUT LEAD-OUT FINISH
      // -------------------------------------------------------------
      if (enableOvercut) {
        // For closed loops, overlap along starting segment angle; for open paths, project forward along last segment angle
        const overcutAngle = isClosed ? workingSegs[0].angle : workingSegs[workingSegs.length - 1].angle;
        const overcutDist = bladeOffset * 1.1;
        const overcutSpindleX = currentSpindleX + overcutDist * Math.cos(overcutAngle);
        const overcutSpindleY = currentSpindleY + overcutDist * Math.sin(overcutAngle);
        const overFeed = overrideCutFeedrate ? (enableCornerSlowdown ? cornerSlowdownFeedrate : cutFeedrate) : (workingSegs[workingSegs.length - 1].feed || 1000);

        outputLines.push(`; Overcut lead-out: extend past corner by 1.1 x offset`);
        outputLines.push(`G1 X${overcutSpindleX.toFixed(4)} Y${overcutSpindleY.toFixed(4)} F${overFeed}`);

        spindlePathSegments.push({
          type: 'OVERCUT',
          x1: currentSpindleX, y1: currentSpindleY,
          x2: overcutSpindleX, y2: overcutSpindleY,
          angle: overcutAngle,
          startHeading: overcutAngle,
          endHeading: overcutAngle
        });

        currentSpindleX = overcutSpindleX;
        currentSpindleY = overcutSpindleY;
        totalCompensatedDist += overcutDist;
        lastExitHeading = overcutAngle;
      } else {
        lastExitHeading = isClosed ? workingSegs[0].angle : workingSegs[workingSegs.length - 1].angle;
      }

      outputLines.push(`G0 Z${safeRetractHeight.toFixed(4)} ; Retract clearance`);
      outputLines.push(``);
      lastRetractSpindleX = currentSpindleX;
      lastRetractSpindleY = currentSpindleY;
    }

    outputLines.push(`; End of toolpath program`);
    outputLines.push(`M30`);

    return {
      outputGCode: outputLines.join('\n'),
      spindlePathSegments,
      visualSwivels,
      cornerDiagnostics,
      stats: {
        swivelCount: addedSwivelCount,
        originalDistance: totalOriginalDist,
        compensatedDistance: totalCompensatedDist,
        distanceDeltaPercent: totalOriginalDist > 0 ? ((totalCompensatedDist - totalOriginalDist) / totalOriginalDist * 100) : 0,
        totalGCodeLines: outputLines.length,
        safeTravelZ: safeRetractHeight,
        cutDepthZ: ((contours[0] && contours[0].segments && contours[0].segments[0]) ? (optCutDepth !== null ? optCutDepth : (contours[0].segments[0].z2 || contours[0].zDepth)) : (unitStr === 'G20' ? -0.055 : -1.40)),
        plungeFeedrate: overrideCutFeedrate ? plungeFeedrate : (contours[0]?.plungeFeed || (options && options.parsedPlungeFeed) || (unitStr === 'G20' ? 20 : 500)),
        cutFeedrate: overrideCutFeedrate ? cutFeedrate : (contours[0]?.segments?.[0]?.feed || (options && options.parsedCutFeed) || (unitStr === 'G20' ? 45 : 1150)),
        zSwivelLiftHeight: enableZSwivelLift ? swivelLiftHeight : 0,
        zSwivelLiftZ: enableZSwivelLift ? (((contours[0] && contours[0].segments && contours[0].segments[0]) ? (optCutDepth !== null ? optCutDepth : (contours[0].segments[0].z2 || contours[0].zDepth)) : (unitStr === 'G20' ? -0.055 : -1.40)) + swivelLiftHeight) : 0
      }
    };
  }

  
  /**
   * Re-indexes closed contour loops so entry plunge occurs at the vertex
   * closest to the work area zero point (X=0, Y=0 datum origin).
   */
  relocateClosedLoopToLongestStraight(segs) {
    if (!segs || segs.length < 2) return segs;

    // Find vertex closest to work area zero point (0, 0)
    let minDistSq = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const distSq = seg.x1 * seg.x1 + seg.y1 * seg.y1;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestIdx = i;
      }
    }

    if (bestIdx === 0) return segs;

    const reordered = [];
    for (let k = bestIdx; k < segs.length; k++) reordered.push(segs[k]);
    for (let k = 0; k < bestIdx; k++) reordered.push(segs[k]);
    return reordered;
  }

  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}

window.DragKnifeProcessor = DragKnifeProcessor;
