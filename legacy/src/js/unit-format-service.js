/**
 * Dragged /// Ritual Skis • UnitFormatService
 * Single-source-of-truth service encapsulating dual-unit transformations (G20 Inches <-> G21 Millimeters),
 * caliper display labels, live gauge strings, and canvas CAD corner scale ruler formatting.
 */
(function (global) {
  'use strict';

  const SST_CALIPER_METADATA = {
    '0.0625': { displayLabel: '1/16"', inches: 0.0625, mm: 1.5875 },
    '0.071':  { displayLabel: '0.071"', inches: 0.071,  mm: 1.8034 },
    '0.125':  { displayLabel: '1/8"',  inches: 0.125,  mm: 3.175  },
    '0.1875': { displayLabel: '3/16"', inches: 0.1875, mm: 4.7625 },
    '0.250':  { displayLabel: '1/4"',  inches: 0.250,  mm: 6.350  },
    '0.375':  { displayLabel: '3/8"',  inches: 0.375,  mm: 9.525  },
    '0.500':  { displayLabel: '1/2"',  inches: 0.500,  mm: 12.700 },
    '0.590':  { displayLabel: '0.59"', inches: 0.590,  mm: 14.986 }
  };

  const UnitFormatService = {
    INCHES: 'G20',
    MILLIMETERS: 'G21',

    isMetric(unitStr) {
      return unitStr === 'G21' || unitStr === 'mm' || unitStr === 'metric';
    },

    getSuffix(unitStr) {
      return this.isMetric(unitStr) ? 'mm' : 'in';
    },

    fromInches(valInches, targetUnitStr) {
      const v = parseFloat(valInches);
      if (isNaN(v)) return 0;
      return this.isMetric(targetUnitStr) ? parseFloat((v * 25.4).toFixed(3)) : parseFloat(v.toFixed(4));
    },

    fromMM(valMM, targetUnitStr) {
      const v = parseFloat(valMM);
      if (isNaN(v)) return 0;
      return this.isMetric(targetUnitStr) ? parseFloat(v.toFixed(3)) : parseFloat((v / 25.4).toFixed(4));
    },

    convertLength(val, fromUnitStr, toUnitStr) {
      const v = parseFloat(val);
      if (isNaN(v)) return 0;
      const fromM = this.isMetric(fromUnitStr);
      const toM = this.isMetric(toUnitStr);
      if (fromM === toM) return v;
      return toM ? parseFloat((v * 25.4).toFixed(3)) : parseFloat((v / 25.4).toFixed(4));
    },

    convertFeedrate(feedVal, fromUnitStr, toUnitStr) {
      const v = parseFloat(feedVal) || 500;
      const fromM = this.isMetric(fromUnitStr);
      const toM = this.isMetric(toUnitStr);
      if (fromM === toM) return Math.round(v);
      return toM ? Math.round(v * 25.4) : Math.round(v / 25.4);
    },

    matchCaliperPresetKey(numericOffset, unitStr) {
      const valNum = parseFloat(numericOffset);
      if (isNaN(valNum)) return null;
      const isM = this.isMetric(unitStr);

      let bestKey = null;
      let minDiff = Infinity;

      Object.keys(SST_CALIPER_METADATA).forEach(key => {
        const info = SST_CALIPER_METADATA[key];
        const targetVal = isM ? info.mm : info.inches;
        const diff = Math.abs(targetVal - valNum);
        const maxTol = isM ? 0.045 : 0.002;
        if (diff < maxTol && diff < minDiff) {
          minDiff = diff;
          bestKey = key;
        }
      });

      return bestKey;
    },

    formatCaliperBadgeText(caliperKey, currentOffsetVal, unitStr) {
      const keyStr = String(caliperKey || '0.071');
      const info = SST_CALIPER_METADATA[keyStr] || SST_CALIPER_METADATA['0.071'];
      const isM = this.isMetric(unitStr);
      const offsetNum = parseFloat(currentOffsetVal) || (isM ? info.mm : info.inches);

      if (isM) {
        return `H=${info.displayLabel} (${info.mm.toFixed(2)}mm) == e=${offsetNum.toFixed(2)}mm (1:1)`;
      } else {
        return `H=${info.displayLabel} (${info.inches.toFixed(4)}") == e=${offsetNum.toFixed(3)}" (1:1)`;
      }
    },

    formatCornerScaleRulerText(gridSpacing, unitStr) {
      const isM = this.isMetric(unitStr);
      const num = parseFloat(gridSpacing) || (isM ? 5 : 0.25);
      const suffix = this.getSuffix(unitStr);

      let fmtNum = '';
      if (isM) {
        fmtNum = num >= 1 ? num.toFixed(0) : num.toFixed(1);
      } else {
        fmtNum = num < 0.01 ? num.toFixed(3) : (num < 0.1 ? num.toFixed(2) : (num % 1 === 0 ? num.toFixed(0) : num.toString()));
      }

      return `1 Square = ${fmtNum} ${suffix}`;
    },

    getCaliperSpec(key) {
      return SST_CALIPER_METADATA[String(key)] || SST_CALIPER_METADATA['0.071'];
    }
  };

  global.UnitFormatService = UnitFormatService;
  global.SST_CALIPER_METADATA = SST_CALIPER_METADATA;

})(typeof window !== 'undefined' ? window : global);
