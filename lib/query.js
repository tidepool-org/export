import _ from 'lodash';

const mmolL = 'mmol/L';
const mgdL = 'mg/dL';

const mmolPrefs = {
  bgUnits: mmolL,
  bgClasses: {
    low: {
      boundary: 3.9,
    },
    target: {
      boundary: 10,
    },
    'very-low': {
      boundary: 3,
    },
    high: {
      boundary: 13.9,
    },
  },
  bgBounds: {
    veryHighThreshold: 13.9,
    targetUpperBound: 10,
    targetLowerBound: 3.9,
    veryLowThreshold: 3,
    clampThreshold: 33.3,
  },
};

const mgdlPrefs = {
  bgUnits: mgdL,
  bgClasses: {
    low: {
      boundary: 3.9,
    },
    target: {
      boundary: 10,
    },
    'very-low': {
      boundary: 3,
    },
    high: {
      boundary: 13.9,
    },
  },
  bgBounds: {
    veryHighThreshold: 13.9,
    targetUpperBound: 10,
    targetLowerBound: 3.9,
    veryLowThreshold: 3,
    clampThreshold: 33.3,
  },
};

function getBGPrefsForUnits(units) {
  if (units === mgdL) {
    return mgdlPrefs;
  }
  return mmolPrefs;
}

function getDateRangeMillis(startDateStr, endDateStr) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  return [startDate.getTime(), endDate.getTime()];
}

export function getDailyQuery(params) {
  let { startDate, endDate } = params.dateRange;
  if (params.dateRange.daily) {
    startDate = params.dateRange.daily.startDate;
    endDate = params.dateRange.daily.endDate;
  }

  return {
    endpoints: getDateRangeMillis(startDate, endDate),
    aggregationsByDate: 'dataByDate, statsByDate',
    stats: [
      'timeInRange',
      'averageGlucose',
      'totalInsulin',
      'timeInAuto',
      'timeInOverride',
      'carbs',
      'standardDev',
      'coefficientOfVariation',
    ],
    types: {
      basal: {},
      bolus: {},
      cbg: {},
      deviceEvent: {},
      food: {},
      message: {},
      smbg: {},
      wizard: {},
    },
    bgSource: params.bgPrefs.source,
    bgPrefs: getBGPrefsForUnits(params.bgPrefs.units),
    metaData: 'latestPumpUpload, bgSources',
    timePrefs: params.timePrefs,
    excludedDevices: [],
  };
}

export function getSettingsQuery(params) {
  return {
    bgPrefs: getBGPrefsForUnits(params.bgPrefs.unit),
    metaData: 'latestPumpUpload, bgSources',
    timePrefs: params.timePrefs,
    excludedDevices: [],
  };
}

export function getBGLogQuery(params) {
  let { startDate, endDate } = params.dateRange;
  if (params.dateRange.bgLog) {
    startDate = params.dateRange.bgLog.startDate;
    endDate = params.dateRange.bgLog.endDate;
  }

  return {
    endpoints: getDateRangeMillis(startDate, endDate),
    aggregationsByDate: 'dataByDate',
    stats: [
      'readingsInRange',
      'averageGlucose',
      'standardDev',
      'coefficientOfVariation',
    ],
    types: {
      smbg: {},
    },
    bgSource: 'smbg',
    bgPrefs: getBGPrefsForUnits(params.bgPrefs.unit),
    metaData: 'latestPumpUpload, bgSources',
    timePrefs: params.timePrefs,
    excludedDevices: [],
  };
}

export function getBasicsQuery(params) {
  let { startDate, endDate } = params.dateRange;
  if (params.dateRange.basics) {
    startDate = params.dateRange.basics.startDate;
    endDate = params.dateRange.basics.endDate;
  }

  return {
    endpoints: getDateRangeMillis(startDate, endDate),
    aggregationsByDate: 'basals, boluses, fingersticks, siteChanges',
    bgSource: params.bgPrefs.source,
    stats: [
      'timeInRange',
      'averageGlucose',
      'sensorUsage',
      'totalInsulin',
      'timeInAuto',
      'timeInOverride',
      'carbs',
      'averageDailyDose',
      'glucoseManagementIndicator',
      'standardDev',
      'coefficientOfVariation',
      'bgExtents',
    ],
    excludeDaysWithoutBolus: false,
    bgPrefs: getBGPrefsForUnits(params.bgPrefs.units),
    metaData: 'latestPumpUpload, bgSources',
    timePrefs: params.timePrefs,
    excludedDevices: [],
  };
}

export function getAGPQuery(params) {
  let { startDate, endDate } = params.dateRange;
  if (params.dateRange.agp) {
    startDate = params.dateRange.agp.startDate;
    endDate = params.dateRange.agp.endDate;
  }
  const bgUnits = params.bgPrefs;

  return {
    endpoints: getDateRangeMillis(startDate, endDate),
    aggregationsByDate: 'dataByDate, statsByDate',
    bgSource: params.bgSource,
    stats: [
      'timeInRange',
      'averageGlucose',
      'sensorUsage',
      'glucoseManagementIndicator',
      'coefficientOfVariation',
    ],
    types: {
      cbg: {},
    },
    bgPrefs: getBGPrefsForUnits(bgUnits),
    metaData: 'latestPumpUpload, bgSources',
    timePrefs: params.timePrefs,
    excludedDevices: [],
  };
}

export function validateQueryParams(params) {
  const properties = ['bgPrefs', 'reports', 'timePrefs', 'dateRange'];

  const missing = {};
  _.forEach(properties, (property) => {
    if (_.isEmpty(params[property])) {
      missing[property] = 'property is required';
    }
  });
  return missing;
}
