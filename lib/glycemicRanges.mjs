import * as vizGlycemicRangesNS from '@tidepool/viz/dist/glycemicRanges.js';
import { mgdLUnits, mmolLUnits } from './utils.mjs';

const vizGlycemicRanges = vizGlycemicRangesNS.default || vizGlycemicRangesNS;
const {
  getBgBoundsForGlycemicRanges,
  DEFAULT_BG_BOUNDS,
  GLYCEMIC_RANGES_TYPE,
  GLYCEMIC_RANGES_PRESET,
} = vizGlycemicRanges;

/**
 * Parse a single `glycemicRangeThresholds` query value into a threshold
 * object. The clinic backend (xealth/report.go) serializes each threshold as
 * `name,<n>,upperBound.value,<f>,upperBound.units,<u>,inclusive,<bool>` after
 * CSV-encoding the name to escape embedded commas. This wire format is unique
 * to the clinic <-> export contract, so the parser lives here rather than in
 * viz.
 *
 * @param {string} raw
 * @returns {{ name: string, upperBound: { value: number, units: string },
 *   inclusive: boolean } | null}
 */
export function parseThreshold(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const parts = [];
  let inQuotes = false;
  let buf = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        buf += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);

  const fields = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    fields[parts[i]] = parts[i + 1];
  }

  if (typeof fields.name !== 'string') return null;

  const value = Number.parseFloat(fields['upperBound.value']);
  if (!Number.isFinite(value)) return null;

  const units = fields['upperBound.units'];
  if (typeof units !== 'string' || units.length === 0) return null;

  return {
    name: fields.name,
    upperBound: {
      value,
      units,
    },
    inclusive: fields.inclusive === 'true',
  };
}

export function parseThresholds(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((entry) => parseThreshold(entry)).filter(Boolean);
}

/**
 * Adapt the flat (type, preset) shape we receive from clinic's query string
 * to the {type, preset} object viz expects, then ask viz for the *raw* preset
 * bgBounds. Single source of truth lives in viz.
 *
 * Note: these are the unmodified preset bounds — for adaHighRisk and the
 * pregnancy presets, `extremeHighThreshold` is intentionally `null`. The PDF
 * pipeline is fed the reshaped bounds from `getBgPrefsForGlycemicRange` below,
 * not these directly.
 */
export function getRawPresetBgBounds({ bgUnits, type, preset } = {}) {
  const units = bgUnits === mgdLUnits ? mgdLUnits : mmolLUnits;
  return { ...getBgBoundsForGlycemicRanges(type ? { type, preset } : null, units) };
}

/**
 * Build the full bgPrefs ({ bgUnits, bgClasses, bgBounds }) for a glycemic-range
 * selection, reproducing blip's clinician path EXACTLY so export PDFs render
 * identically to blip's.
 *
 * STOPGAP — intentional parity.
 * blip (blip/app/core/utils.js `getBGPrefsForDataProcessing`) resolves the
 * preset to a bounds table, builds a 5-class bgClasses, then runs it through
 * viz's `reshapeBgClassesToBgBounds`. That reshape predates
 * the glycemic-range presets — hardcodes `extremeHighThreshold` and
 * `clampThreshold` to the unit DEFAULTS, overriding the preset table's
 * intentionally-null extreme-high for adaHighRisk / pregnancy presets. We
 * deliberately mirror that here (including the override) so the two renderers
 * agree.
 */
export function getBgPrefsForGlycemicRange({ bgUnits, type, preset } = {}) {
  const units = bgUnits === mgdLUnits ? mgdLUnits : mmolLUnits;
  const bounds = getRawPresetBgBounds({ bgUnits: units, type, preset });

  // Mirror blip's bgClasses construction (5 classes, falsy -> null).
  const bgClasses = {
    'very-low': { boundary: bounds.veryLowThreshold || null },
    low: { boundary: bounds.targetLowerBound || null },
    target: { boundary: bounds.targetUpperBound || null },
    high: { boundary: bounds.veryHighThreshold || null },
    'very-high': { boundary: bounds.extremeHighThreshold || null },
  };

  // Mirror viz's reshapeBgClassesToBgBounds: category boundaries come from the
  // preset, but extremeHighThreshold and clampThreshold are forced to defaults.
  const bgBounds = {
    veryLowThreshold: bgClasses['very-low'].boundary,
    targetLowerBound: bgClasses.low.boundary,
    targetUpperBound: bgClasses.target.boundary,
    veryHighThreshold: bgClasses.high.boundary,
    extremeHighThreshold: DEFAULT_BG_BOUNDS[units].extremeHighThreshold,
    clampThreshold: DEFAULT_BG_BOUNDS[units].clampThreshold,
  };

  return { bgUnits: units, bgClasses, bgBounds };
}

/**
 * Rebuild the `glycemicRanges` object of the clinicPatient record from the flat
 * (type, preset, thresholds) shape we receive from clinic's query string.
 *
 * bgPrefs alone is not enough. viz derives the range *bounds* from
 * `query.bgPrefs`, but derives the range *identity* — the "Time in Ranges"
 * subtitle (AGPUtils `generateChartSections`) and the per-range goal
 * annotations (print/plotly `generatePercentInRangesFigure`) — from
 * `query.glycemicRanges`. Omitting it makes viz fall back to adaStandard.
 *
 * blip does the same thing in `app/core/usePrintPDF/helpers.js` (`getQueries`),
 * defaulting to the ADA Standard preset when the patient record carries no
 * ranges. We mirror that default so legacy callers that send no glycemic-range
 * params keep their current output.
 */
export function getGlycemicRangesForQuery({ type, preset, thresholds } = {}) {
  if (type === GLYCEMIC_RANGES_TYPE.CUSTOM) {
    return {
      type: GLYCEMIC_RANGES_TYPE.CUSTOM,
      custom: { thresholds: thresholds || [] },
    };
  }

  return {
    type: GLYCEMIC_RANGES_TYPE.PRESET,
    preset: preset || GLYCEMIC_RANGES_PRESET.ADA_STANDARD,
  };
}
