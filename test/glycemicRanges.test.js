import {
  parseThreshold,
  parseThresholds,
  getRawPresetBgBounds,
  getBgPrefsForGlycemicRange,
} from '../lib/glycemicRanges.mjs';
import { mgdLUnits, mmolLUnits } from '../lib/utils.mjs';

describe('glycemicRanges', () => {
  describe('parseThreshold', () => {
    it('parses a well-formed threshold string', () => {
      expect(
        parseThreshold(
          'name,low,upperBound.value,70.000000,upperBound.units,mg/dL,inclusive,true',
        ),
      ).toEqual({
        name: 'low',
        upperBound: { value: 70, units: 'mg/dL' },
        inclusive: true,
      });
    });

    it('parses a name containing a comma (CSV-quoted, as serialized by clinic)', () => {
      // clinic uses encoding/csv.Writer, which quotes any field containing a
      // comma and doubles internal quotes.
      expect(
        parseThreshold(
          'name,"foo, bar",upperBound.value,180.000000,upperBound.units,mg/dL,inclusive,false',
        ),
      ).toEqual({
        name: 'foo, bar',
        upperBound: { value: 180, units: 'mg/dL' },
        inclusive: false,
      });
    });

    it('parses a name containing escaped quotes', () => {
      expect(
        parseThreshold(
          'name,"she said ""hi""",upperBound.value,140.000000,upperBound.units,mg/dL,inclusive,true',
        ),
      ).toEqual({
        name: 'she said "hi"',
        upperBound: { value: 140, units: 'mg/dL' },
        inclusive: true,
      });
    });

    it('returns null for non-string or empty input', () => {
      expect(parseThreshold('')).toBeNull();
      expect(parseThreshold(null)).toBeNull();
      expect(parseThreshold(undefined)).toBeNull();
    });

    it('returns null when upperBound.value is not a number', () => {
      expect(
        parseThreshold(
          'name,low,upperBound.value,nope,upperBound.units,mg/dL,inclusive,true',
        ),
      ).toBeNull();
    });
  });

  describe('parseThresholds', () => {
    it('returns [] for missing input', () => {
      expect(parseThresholds()).toEqual([]);
      expect(parseThresholds(null)).toEqual([]);
    });

    it('accepts a single string (express coerces a single repeat to a string)', () => {
      const out = parseThresholds(
        'name,low,upperBound.value,70.000000,upperBound.units,mg/dL,inclusive,true',
      );
      expect(out).toHaveLength(1);
    });

    it('accepts an array (express coerces multiple repeats to an array)', () => {
      const out = parseThresholds([
        'name,low,upperBound.value,70.000000,upperBound.units,mg/dL,inclusive,true',
        'name,high,upperBound.value,180.000000,upperBound.units,mg/dL,inclusive,false',
      ]);
      expect(out).toHaveLength(2);
    });

    it('skips invalid entries', () => {
      const out = parseThresholds([
        'name,low,upperBound.value,70.000000,upperBound.units,mg/dL,inclusive,true',
        'totally bogus',
      ]);
      expect(out).toHaveLength(1);
    });
  });

  describe('getRawPresetBgBounds', () => {
    it('returns ADA standard bounds when nothing is supplied', () => {
      expect(getRawPresetBgBounds({ bgUnits: mgdLUnits })).toEqual({
        veryLowThreshold: 54,
        targetLowerBound: 70,
        targetUpperBound: 180,
        veryHighThreshold: 250,
        extremeHighThreshold: 350,
        clampThreshold: 600,
      });
    });

    it('returns ADA pregnancy type 1 bounds in mmol/L', () => {
      expect(
        getRawPresetBgBounds({
          bgUnits: mmolLUnits,
          type: 'preset',
          preset: 'adaPregnancyType1',
        }),
      ).toEqual({
        veryLowThreshold: 3.0,
        targetLowerBound: 3.5,
        targetUpperBound: 7.8,
        veryHighThreshold: null,
        extremeHighThreshold: null,
        clampThreshold: 33.3,
      });
    });

    it('returns ADA older/high-risk bounds in mg/dL', () => {
      expect(
        getRawPresetBgBounds({
          bgUnits: mgdLUnits,
          type: 'preset',
          preset: 'adaHighRisk',
        }),
      ).toEqual({
        veryLowThreshold: null,
        targetLowerBound: 70,
        targetUpperBound: 180,
        veryHighThreshold: 250,
        extremeHighThreshold: null,
        clampThreshold: 600,
      });
    });

    it('falls back to ADA standard for unknown preset', () => {
      expect(
        getRawPresetBgBounds({
          bgUnits: mgdLUnits,
          type: 'preset',
          preset: 'noSuchPreset',
        }),
      ).toEqual({
        veryLowThreshold: 54,
        targetLowerBound: 70,
        targetUpperBound: 180,
        veryHighThreshold: 250,
        extremeHighThreshold: 350,
        clampThreshold: 600,
      });
    });

    it('falls back to ADA standard for custom type (parity with viz)', () => {
      expect(
        getRawPresetBgBounds({
          bgUnits: mmolLUnits,
          type: 'custom',
        }),
      ).toEqual({
        veryLowThreshold: 3.0,
        targetLowerBound: 3.9,
        targetUpperBound: 10.0,
        veryHighThreshold: 13.9,
        extremeHighThreshold: 19.4,
        clampThreshold: 33.3,
      });
    });
  });

  // STOPGAP parity: getBgPrefsForGlycemicRange must reproduce blip's reshape
  // behavior, where extremeHighThreshold is forced to the unit default even for
  // presets whose raw table value is null. See docs/glycemic-ranges-parity.md.
  describe('getBgPrefsForGlycemicRange (blip parity)', () => {
    it('forces extremeHighThreshold to the unit default for adaHighRisk (raw is null)', () => {
      const raw = getRawPresetBgBounds({
        bgUnits: mgdLUnits, type: 'preset', preset: 'adaHighRisk',
      });
      const prefs = getBgPrefsForGlycemicRange({
        bgUnits: mgdLUnits, type: 'preset', preset: 'adaHighRisk',
      });

      // The raw preset bounds intentionally carry a null extreme-high...
      expect(raw.extremeHighThreshold).toBeNull();
      // ...but the rendered bgPrefs match blip: forced to the default.
      expect(prefs.bgBounds.extremeHighThreshold).toBe(350);
      expect(prefs.bgClasses['very-high']).toEqual({ boundary: null });
    });

    it('builds the full 5-class bgPrefs for adaPregnancyType1 in mmol/L', () => {
      expect(
        getBgPrefsForGlycemicRange({
          bgUnits: mmolLUnits, type: 'preset', preset: 'adaPregnancyType1',
        }),
      ).toEqual({
        bgUnits: mmolLUnits,
        bgClasses: {
          'very-low': { boundary: 3.0 },
          low: { boundary: 3.5 },
          target: { boundary: 7.8 },
          high: { boundary: null },
          'very-high': { boundary: null },
        },
        bgBounds: {
          veryLowThreshold: 3.0,
          targetLowerBound: 3.5,
          targetUpperBound: 7.8,
          veryHighThreshold: null,
          extremeHighThreshold: 19.4,
          clampThreshold: 33.3,
        },
      });
    });
  });
});
