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
 * Split a comma-separated string into fields, honoring CSV quoting (as written
 * by Go's encoding/csv.Writer) so quoted fields may contain commas and doubled
 * quotes.
 *
 * @param {string} raw
 * @returns {string[]}
 */
function splitCsvFields(raw) {
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
  return parts;
}

/**
 * Parse a non-negative threshold value, returning null if it is malformed.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function parseThresholdValue(raw) {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Parse a `glycemicRangeThresholds` value into custom glycemic ranges, shaped
 * like the clinic patient record's `glycemicRanges.custom`. The clinic backend
 * (xealth/report.go) and clinic-worker (redox/processor_neworder.go) serialize
 * custom ranges as comma-separated key/value pairs:
 * `name,<n>,units,<u>,[veryLow,<f>,]low,<f>,high,<f>[,veryHigh,<f>]`, with the
 * name CSV-encoded to escape embedded commas. veryLow and veryHigh are omitted
 * when unset. This wire format is unique to the clinic <-> export contract, so
 * the parser lives here rather than in viz.
 *
 * @param {string} raw
 * @returns {{ name: string, units: string, thresholds: { veryLow?: number,
 *   low: number, high: number, veryHigh?: number } } | null}
 */
export function parseCustomRanges(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const parts = splitCsvFields(raw);
  const fields = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    fields[parts[i]] = parts[i + 1];
  }

  if (typeof fields.name !== 'string') return null;
  if (fields.units !== mgdLUnits && fields.units !== mmolLUnits) return null;

  const low = parseThresholdValue(fields.low);
  const high = parseThresholdValue(fields.high);
  if (low === null || high === null) return null;

  const optional = ['veryLow', 'veryHigh']
    .filter((key) => fields[key] !== undefined)
    .map((key) => [key, parseThresholdValue(fields[key])]);
  if (optional.some(([, value]) => value === null)) return null;

  return {
    name: fields.name,
    units: fields.units,
    thresholds: { low, high, ...Object.fromEntries(optional) },
  };
}

/**
 * Parse the `glycemicRangeThresholds` query param. Clinic sends it once, but
 * express coerces a repeated param to an array, in which case the first entry
 * is used.
 *
 * @param {string|string[]|null|undefined} raw
 * @returns {ReturnType<typeof parseCustomRanges>}
 */
export function parseCustomRangesParam(raw) {
  return parseCustomRanges(Array.isArray(raw) ? raw[0] : raw);
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
 * (type, preset, custom) shape we receive from clinic's query string.
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
 * params keep their current output. A custom type whose ranges could not be
 * parsed gets the same default, which is also what viz resolves custom ranges
 * to today.
 */
export function getGlycemicRangesForQuery({ type, preset, custom } = {}) {
  if (type === GLYCEMIC_RANGES_TYPE.CUSTOM && custom) {
    return {
      type: GLYCEMIC_RANGES_TYPE.CUSTOM,
      custom,
    };
  }

  return {
    type: GLYCEMIC_RANGES_TYPE.PRESET,
    preset: preset || GLYCEMIC_RANGES_PRESET.ADA_STANDARD,
  };
}
