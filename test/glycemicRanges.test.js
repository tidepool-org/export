import {
  parseCustomRanges,
  parseCustomRangesParam,
  getRawPresetBgBounds,
  getBgPrefsForGlycemicRange,
} from '../lib/glycemicRanges.mjs';
import { mgdLUnits, mmolLUnits } from '../lib/utils.mjs';

describe('glycemicRanges', () => {
  describe('parseCustomRanges', () => {
    it('parses well-formed custom ranges with all thresholds', () => {
      expect(
        parseCustomRanges(
          'name,Mine,units,mg/dL,veryLow,54.000000,low,70.000000,'
            + 'high,180.000000,veryHigh,250.000000',
        ),
      ).toEqual({
        name: 'Mine',
        units: 'mg/dL',
        thresholds: {
          veryLow: 54, low: 70, high: 180, veryHigh: 250,
        },
      });
    });

    it('omits unset optional thresholds', () => {
      expect(
        parseCustomRanges('name,Mine,units,mmol/L,low,3.900000,high,10.000000'),
      ).toEqual({
        name: 'Mine',
        units: 'mmol/L',
        thresholds: { low: 3.9, high: 10 },
      });
    });

    it('parses a name containing a comma (CSV-quoted, as serialized by clinic)', () => {
      // clinic uses encoding/csv.Writer, which quotes any field containing a
      // comma and doubles internal quotes.
      expect(
        parseCustomRanges('name,"foo, bar",units,mg/dL,low,70.000000,high,180.000000'),
      ).toEqual({
        name: 'foo, bar',
        units: 'mg/dL',
        thresholds: { low: 70, high: 180 },
      });
    });

    it('parses a name containing escaped quotes', () => {
      expect(
        parseCustomRanges(
          'name,"she said ""hi""",units,mg/dL,low,70.000000,high,180.000000',
        ).name,
      ).toBe('she said "hi"');
    });

    it('returns null for non-string or empty input', () => {
      expect(parseCustomRanges('')).toBeNull();
      expect(parseCustomRanges(null)).toBeNull();
      expect(parseCustomRanges(undefined)).toBeNull();
    });

    it.each([
      ['the name is missing', 'units,mg/dL,low,70,high,180'],
      ['the units are missing', 'name,Mine,low,70,high,180'],
      ['the units are unknown', 'name,Mine,units,mg,low,70,high,180'],
      ['low is missing', 'name,Mine,units,mg/dL,high,180'],
      ['high is missing', 'name,Mine,units,mg/dL,low,70'],
      ['low is not a number', 'name,Mine,units,mg/dL,low,nope,high,180'],
      ['low is negative', 'name,Mine,units,mg/dL,low,-1,high,180'],
      ['veryLow is not a number', 'name,Mine,units,mg/dL,veryLow,nope,low,70,high,180'],
      ['veryHigh is negative', 'name,Mine,units,mg/dL,low,70,high,180,veryHigh,-1'],
      ['it is in the old per-threshold format',
        'name,low,upperBound.value,70.000000,upperBound.units,mg/dL,inclusive,true'],
    ])('returns null when %s', (_, raw) => {
      expect(parseCustomRanges(raw)).toBeNull();
    });
  });

  describe('parseCustomRangesParam', () => {
    const raw = 'name,Mine,units,mg/dL,low,70.000000,high,180.000000';
    const parsed = { name: 'Mine', units: 'mg/dL', thresholds: { low: 70, high: 180 } };

    it('returns null for missing input', () => {
      expect(parseCustomRangesParam()).toBeNull();
      expect(parseCustomRangesParam(null)).toBeNull();
    });

    it('accepts a single string (express coerces a single param to a string)', () => {
      expect(parseCustomRangesParam(raw)).toEqual(parsed);
    });

    it('uses the first entry of an array (express coerces repeats to an array)', () => {
      expect(parseCustomRangesParam([raw, 'totally bogus'])).toEqual(parsed);
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
  // presets whose raw table value is null (blip/app/core/utils.js
  // getBGPrefsForDataProcessing -> viz reshapeBgClassesToBgBounds). These tests
  // are canaries: if viz stops forcing the default, they fail on purpose.
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
