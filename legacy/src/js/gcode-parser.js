/**
 * Dragged /// Ritual Skis • G-Code Parser Module
 * Parses G-code text into discrete geometric toolpath contours with Z depth & velocity.
 */

class GCodeParser {
  constructor() {
    this.resetState();
  }

  resetState() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.feedrate = 1000;
    this.units = 'G21'; // G21 = mm, G20 = inch
    this.absoluteMode = true; // G90 = abs, G91 = rel
    this.plane = 'G17'; // G17 = XY plane
    this.activeMotionMode = 0; // Modal motion state: 0=G0, 1=G1, 2=G2, 3=G3
  }

  /**
   * Parse full G-code text string
   * @param {string} gcodeText 
   * @returns {Object} { commands, contours, boundingBox, units }
   */
  parse(gcodeText) {
    this.resetState();
    const lines = gcodeText.split(/\r?\n/);
    const commands = [];
    const contours = [];
    let currentContour = null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    let detectedPlungeFeed = null;
    let detectedCutFeed = null;
    let rapidCount = 0;
    let plungeCount = 0;
    let rapidDist = 0;
    let cuttingDist = 0;
    const retractHeights = [];
    const cutDepths = [];

    const updateBounds = (px, py, pz) => {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz !== undefined) {
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      // Strip comments
      let cleanLine = rawLine.replace(/\(.*?\)/g, '');
      const semiIdx = cleanLine.indexOf(';');
      if (semiIdx !== -1) {
        cleanLine = cleanLine.substring(0, semiIdx);
      }
      cleanLine = cleanLine.trim().toUpperCase();

      if (!cleanLine) {
        commands.push({ type: 'COMMENT', raw: rawLine, lineIndex });
        continue;
      }

      // Check unit commands
      if (/\bG20\b/.test(cleanLine)) this.units = 'G20';
      if (/\bG21\b/.test(cleanLine)) this.units = 'G21';
      if (/\bG90\b/.test(cleanLine)) this.absoluteMode = true;
      if (/\bG91\b/.test(cleanLine)) this.absoluteMode = false;

      // Extract axis values using regex
      const words = this.extractWords(cleanLine);
      let gCode = words.G !== undefined ? Math.round(words.G * 10) / 10 : null;
      if (gCode === 0 || gCode === 1 || gCode === 2 || gCode === 3) {
        this.activeMotionMode = gCode;
      } else if (gCode === null && (words.X !== undefined || words.Y !== undefined || words.Z !== undefined)) {
        gCode = this.activeMotionMode;
      }

      // Update feedrate if F present
      if (words.F !== undefined) this.feedrate = words.F;

      // Calculate target X, Y, Z
      let targetX = this.x;
      let targetY = this.y;
      let targetZ = this.z;

      if (words.X !== undefined) {
        targetX = this.absoluteMode ? words.X : this.x + words.X;
      }
      if (words.Y !== undefined) {
        targetY = this.absoluteMode ? words.Y : this.y + words.Y;
      }
      if (words.Z !== undefined) {
        targetZ = this.absoluteMode ? words.Z : this.z + words.Z;
      }

      const isMove = words.X !== undefined || words.Y !== undefined || words.Z !== undefined;

      if (gCode === 0 && isMove) {
        // G0 Rapid move (blade lifted or positioning move)
        const prevX = this.x, prevY = this.y, prevZ = this.z;
        rapidCount++;
        this.x = targetX;
        this.y = targetY;
        this.z = targetZ;
        updateBounds(targetX, targetY, targetZ);
        rapidDist += Math.hypot(targetX - prevX, targetY - prevY, targetZ - prevZ);

        if (targetZ > 0.001) {
          retractHeights.push(targetZ);
        }

        // Terminate active cutting contour
        if (currentContour && currentContour.points.length > 1) {
          contours.push(currentContour);
        }
        currentContour = null;

        commands.push({
          type: 'G0',
          x: targetX,
          y: targetY,
          z: targetZ,
          feed: this.feedrate,
          raw: rawLine,
          lineIndex
        });

      } else if ((gCode === 1 || (gCode === null && isMove && currentContour)) && isMove) {
        // G1 Linear interpolation cut move
        const startX = this.x;
        const startY = this.y;
        const startZ = this.z;

        const xyMoved = Math.hypot(targetX - startX, targetY - startY) > 0.0001;
        const zStepDown = (targetZ < startZ - 0.005) && (Math.hypot(targetX - startX, targetY - startY) < 0.1);

        if (zStepDown && currentContour && currentContour.segments.length > 2) {
          contours.push(currentContour);
          currentContour = null;
        }

        // Analyze plunge downward movement vs XY material cutting
        const isPlungeMove = (targetZ < startZ - 0.001) || (!xyMoved && targetZ <= 0.001);
        if (isPlungeMove) {
          plungeCount++;
          if (words.F !== undefined) detectedPlungeFeed = words.F;
          if (targetZ <= 0.001) cutDepths.push(targetZ);
        }

        if (xyMoved) {
          if (words.F !== undefined) detectedCutFeed = words.F;
          if (targetZ <= 0.001) cutDepths.push(targetZ);
          cuttingDist += Math.hypot(targetX - startX, targetY - startY);
        }

        this.x = targetX;
        this.y = targetY;
        this.z = targetZ;
        updateBounds(targetX, targetY, targetZ);

        if (!currentContour) {
          currentContour = {
            id: contours.length + 1,
            points: [{ x: startX, y: startY, z: startZ }],
            segments: [],
            zDepth: targetZ,
            plungeFeed: (isPlungeMove && words.F !== undefined) ? words.F : detectedPlungeFeed
          };
        } else if (isPlungeMove && words.F !== undefined) {
          currentContour.plungeFeed = words.F;
        }

        if (xyMoved) {
          const segAngle = Math.atan2(targetY - startY, targetX - startX);
          const segDist = Math.hypot(targetX - startX, targetY - startY);

          currentContour.points.push({ x: targetX, y: targetY, z: targetZ });
          currentContour.segments.push({
            type: 'G1',
            x1: startX, y1: startY, z1: startZ,
            x2: targetX, y2: targetY, z2: targetZ,
            length: segDist,
            angle: segAngle,
            feed: this.feedrate,
            plungeFeed: currentContour.plungeFeed || detectedPlungeFeed,
            raw: rawLine,
            lineIndex
          });
        }

        commands.push({
          type: 'G1',
          x: targetX,
          y: targetY,
          z: targetZ,
          feed: this.feedrate,
          raw: rawLine,
          lineIndex
        });

      } else if (gCode === 2 || gCode === 3) {
        // G2/G3 Arc command - approximate into tiny high-res straight linear sub-segments for processing
        const isCW = (gCode === 2);
        const startX = this.x;
        const startY = this.y;
        const startZ = this.z;

        let cx = startX;
        let cy = startY;

        if (words.I !== undefined || words.J !== undefined) {
          cx = startX + (words.I || 0);
          cy = startY + (words.J || 0);
        } else if (words.R !== undefined) {
          const r = Math.abs(words.R);
          const dx = targetX - startX;
          const dy = targetY - startY;
          const d = Math.hypot(dx, dy);
          const midX = (startX + targetX) / 2;
          const midY = (startY + targetY) / 2;
          const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
          const invD = d > 0 ? h / d : 0;

          if (isCW ? words.R > 0 : words.R < 0) {
            cx = midX + invD * dy;
            cy = midY - invD * dx;
          } else {
            cx = midX - invD * dy;
            cy = midY + invD * dx;
          }
        }

        const radius = Math.hypot(startX - cx, startY - cy);
        let startAngle = Math.atan2(startY - cy, startX - cx);
        let endAngle = Math.atan2(targetY - cy, targetX - cx);

        if (isCW) {
          if (endAngle >= startAngle) endAngle -= Math.PI * 2;
        } else {
          if (endAngle <= startAngle) endAngle += Math.PI * 2;
        }

        const arcSweep = Math.abs(endAngle - startAngle);
        const numSteps = Math.max(8, Math.ceil(arcSweep / (Math.PI / 24))); // high sample rate

        if (!currentContour) {
          currentContour = {
            id: contours.length + 1,
            points: [{ x: startX, y: startY, z: startZ }],
            segments: [],
            zDepth: targetZ
          };
        }

        let prevSubX = startX;
        let prevSubY = startY;

        for (let s = 1; s <= numSteps; s++) {
          const t = s / numSteps;
          const ang = startAngle + (endAngle - startAngle) * t;
          const subX = cx + radius * Math.cos(ang);
          const subY = cy + radius * Math.sin(ang);
          const subZ = startZ + (targetZ - startZ) * t;

          const segAngle = Math.atan2(subY - prevSubY, subX - prevSubX);
          const segDist = Math.hypot(subX - prevSubX, subY - prevSubY);

          currentContour.points.push({ x: subX, y: subY, z: subZ });
          currentContour.segments.push({
            type: 'G1',
            x1: prevSubX, y1: prevSubY, z1: startZ,
            x2: subX, y2: subY, z2: subZ,
            length: segDist,
            angle: segAngle,
            feed: this.feedrate,
            raw: rawLine,
            lineIndex,
            fromArc: true
          });

          prevSubX = subX;
          prevSubY = subY;
        }

        this.x = targetX;
        this.y = targetY;
        this.z = targetZ;
        updateBounds(targetX, targetY, targetZ);

        commands.push({
          type: isCW ? 'G2' : 'G3',
          x: targetX,
          y: targetY,
          z: targetZ,
          feed: this.feedrate,
          raw: rawLine,
          lineIndex
        });

      } else {
        commands.push({
          type: 'OTHER',
          raw: rawLine,
          lineIndex
        });
      }
    }

    if (currentContour && currentContour.points.length > 1) {
      contours.push(currentContour);
    }

    // Default bounds if empty
    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = 100; maxY = 100; minZ = -2; maxZ = 5;
    }

    // Determine operational safe travel retract height (e.g. 5.08mm / 0.20in rather than 38.1mm home clearance)
    let detectedRetractZ = null;
    const posRetracts = retractHeights.filter(h => h > 0.001);
    if (posRetracts.length > 0) {
      const operationalRetracts = posRetracts.filter(h => (this.units === 'G20' ? h <= 0.50 : h <= 12.0));
      const targetPool = operationalRetracts.length > 0 ? operationalRetracts : posRetracts;

      const counts = {};
      let maxC = 0;
      let modalVal = targetPool[0];
      for (const h of targetPool) {
        const k = h.toFixed(3);
        counts[k] = (counts[k] || 0) + 1;
        if (counts[k] > maxC) {
          maxC = counts[k];
          modalVal = h;
        }
      }
      detectedRetractZ = (this.units === 'G20' ? (modalVal > 0.50 ? 0.2000 : modalVal) : (modalVal > 12.0 ? 5.0000 : modalVal));
    } else if (isFinite(maxZ) && maxZ > 0) {
      detectedRetractZ = (this.units === 'G20' ? (maxZ > 0.50 ? 0.2000 : maxZ) : (maxZ > 12.0 ? 5.0000 : maxZ));
    } else {
      detectedRetractZ = (this.units === 'G20' ? 0.2000 : 5.0000);
    }

    // Determine cutting depth
    let detectedCutDepthZ = null;
    if (cutDepths.length > 0) {
      detectedCutDepthZ = Math.min(...cutDepths);
    } else if (isFinite(minZ) && minZ < -0.001) {
      detectedCutDepthZ = minZ;
    }

    return {
      commands,
      contours,
      boundingBox: {
        minX, minY, maxX, maxY,
        width: Math.max(0.1, maxX - minX),
        height: Math.max(0.1, maxY - minY),
        minZ, maxZ
      },
      stats: {
        safeTravelZ: detectedRetractZ,
        maxClearanceZ: (isFinite(maxZ) && maxZ > 0) ? maxZ : detectedRetractZ,
        cutDepthZ: detectedCutDepthZ,
        plungeFeedrate: detectedPlungeFeed,
        cutFeedrate: detectedCutFeed,
        rapidCount,
        plungeCount,
        rapidDist,
        cuttingDist
      },
      safeRetractZ: detectedRetractZ,
      maxClearanceZ: (isFinite(maxZ) && maxZ > 0) ? maxZ : detectedRetractZ,
      cutDepthZ: detectedCutDepthZ,
      plungeFeedrate: detectedPlungeFeed,
      cutFeedrate: detectedCutFeed,
      units: this.units,
      unitStr: this.units,
      isMetric: this.units === 'G21'
    };
  }

  /**
   * Helper parsing words like X10.5 Y-4.2 F500
   */
  extractWords(line) {
    const regex = /([A-Z])\s*([-+]?\d*\.?\d+)/g;
    const words = {};
    let match;
    while ((match = regex.exec(line)) !== null) {
      words[match[1]] = parseFloat(match[2]);
    }
    return words;
  }
}

window.GCodeParser = GCodeParser;
