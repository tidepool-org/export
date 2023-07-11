const { generateAGPSVGDataURLS } = require('@tidepool/viz/dist/genAGPURL');
const { DataUtil } = require('@tidepool/viz/dist/data');
const { Blob } = require('buffer');
const axios = require('axios');
const _ = require('lodash');
const moment = require('moment-timezone');
const blobStream = require('blob-stream');
const {
  createPrintPDFPackage,
  utils: PrintPDFUtils,
} = require('@tidepool/viz/dist/print.js');
const PDFKit = require('./pdfkit');
const {
  fetchUserData,
  getServerTime,
  mgdLUnits,
  mmolLUnits,
} = require('./utils');

global.Blob = Blob;

PrintPDFUtils.PDFDocument = PDFKit;
PrintPDFUtils.blobStream = blobStream;

const reportDataTypes = [
  'cbg',
  'smbg',
  'basal',
  'bolus',
  'wizard',
  'food',
  'pumpSettings',
  'upload',
];

const reportTypes = {
  all: 'all',
  basics: 'basics',
  bgLog: 'bgLog',
  agp: 'agp',
  daily: 'daily',
  settings: 'settings',
};

function getTimePrefs(tzName) {
  const timePrefs = {
    timezoneAware: true,
    timezoneName: 'UTC',
  };
  if (tzName) {
    timePrefs.timezoneName = tzName;
  }
  return timePrefs;
}

function getBGPrefs(units = mmolLUnits) {
  if (units === mgdLUnits) {
    return {
      bgUnits: mgdLUnits,
      bgClasses: {
        low: {
          boundary: 70,
        },
        target: {
          boundary: 180,
        },
      },
      bgBounds: {
        veryHighThreshold: 250,
        targetUpperBound: 180,
        targetLowerBound: 70,
        veryLowThreshold: 54,
        clampThreshold: 600,
      },
    };
  }
  return {
    bgUnits: mmolLUnits,
    bgClasses: {
      low: {
        boundary: 3.9,
      },
      target: {
        boundary: 10,
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
}

/**
 *
 * @param {string} [units] @default [mmolLUnits] bg units used for report
 * @param {string} [timezoneName] @default [UTC] timezoneName used for report
 * @param {string[]} reports @default ['all'] reports to return queries for
 * @returns {{
 *    agp:object|null,
 *    basics:object|null,
 *    bgLog:object|null,
 *    daily:object|null,
 *    settings:object|null,
 *  }} queries
 */
function buildDataQueries(
  units = mmolLUnits,
  timePrefs,
  reports = [reportTypes.all],
) {
  const reportBGPrefs = getBGPrefs(units);
  const dataQueries = {
    basics: {
      endpoints: [],
      aggregationsByDate: 'basals, boluses, fingersticks, siteChanges',
      bgSource: 'cbg',
      stats: [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'carbs',
        'averageDailyDose',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ],
      excludeDaysWithoutBolus: false,
      bgPrefs: reportBGPrefs,
      metaData: 'latestPumpUpload, bgSources',
      timePrefs,
      excludedDevices: [],
    },
    bgLog: {
      endpoints: [],
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
      bgPrefs: reportBGPrefs,
      metaData: 'latestPumpUpload, bgSources',
      timePrefs,
      excludedDevices: [],
    },
    daily: {
      endpoints: [],
      aggregationsByDate: 'dataByDate, statsByDate',
      stats: [
        'timeInRange',
        'averageGlucose',
        'totalInsulin',
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
      bgSource: 'cbg',
      bgPrefs: reportBGPrefs,
      metaData: 'latestPumpUpload, bgSources',
      timePrefs,
      excludedDevices: [],
    },
    agp: {
      endpoints: [],
      aggregationsByDate: 'dataByDate, statsByDate',
      bgSource: 'cbg',
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
      bgPrefs: reportBGPrefs,
      metaData: 'latestPumpUpload, bgSources',
      timePrefs,
      excludedDevices: [],
    },
    settings: {
      bgPrefs: reportBGPrefs,
      metaData: 'latestPumpUpload, bgSources',
      timePrefs,
      excludedDevices: [],
    },
  };
  if (reports.includes(reportTypes.all)) {
    return dataQueries;
  }
  if (!reports.includes(reportTypes.basics)) {
    delete dataQueries.basics;
  }
  if (!reports.includes(reportTypes.bgLog)) {
    delete dataQueries.bgLog;
  }
  if (!reports.includes(reportTypes.agp)) {
    delete dataQueries.agp;
  }
  if (!reports.includes(reportTypes.settings)) {
    delete dataQueries.settings;
  }
  if (!reports.includes(reportTypes.daily)) {
    delete dataQueries.daily;
  }
  return dataQueries;
}

/**
 * Utility to derive the request options for existing user data
 *
 * @param {array} data
 * @param {string} units
 * @param {string} serverTime
 * @param {string|null} restrictedToken
 * @returns {{
 *    initial: boolean,
 *    restricted_token: string|null,
 *    startDate: string,
 *    endDate: string,
 *    bgPrefs: object,
 *    getPumpSettingsUploadRecordById: object|null
 * }}
 */
function getQueryOptions(data, units, serverTime, restrictedToken) {
  const options = { initial: true };

  if (restrictedToken) {
    options.restricted_token = restrictedToken;
  }

  // We then determine the date range to fetch data for by first finding the latest
  // diabetes datum time and going back 30 days
  const diabetesDatums = _.reject(data, (d) => _.includes(['food', 'upload', 'pumpSettings'], d.type));
  const latestDiabetesDatumTime = _.max(_.map(diabetesDatums, (d) => d.time));
  const latestDatumTime = _.max(_.map(data, (d) => d.time));

  // If we have no latest diabetes datum time, we fall back to use the server time as the
  // ideal end date.
  const fetchFromTime = latestDiabetesDatumTime || serverTime;
  const fetchToTime = latestDatumTime || serverTime;

  options.startDate = moment
    .utc(fetchFromTime)
    .subtract(30, 'days')
    .startOf('day')
    .toISOString();

  // We add a 1 day buffer to the end date since we can get `time` fields that are slightly
  // in the future due to timezones or incorrect device and/or computer time upon upload.
  options.endDate = moment.utc(fetchToTime).add(1, 'days').toISOString();

  const latestPumpSettings = _.find(data, {
    type: 'pumpSettings',
  });
  const latestPumpSettingsUploadId = _.get(
    latestPumpSettings || {},
    'uploadId',
  );
  const latestPumpSettingsUpload = _.find(data, {
    type: 'upload',
    uploadId: latestPumpSettingsUploadId,
  });

  if (latestPumpSettingsUploadId && !latestPumpSettingsUpload) {
    // If we have pump settings, but we don't have the corresponing upload record used
    // to get the device source, we need to fetch it
    options.getPumpSettingsUploadRecordById = latestPumpSettingsUploadId;
  }

  options.bgPrefs = getBGPrefs(units);

  return options;
}

/**
 * Set the time prefs base on supplied data
 * timezoneName = tzName if set
 * or timezoneName = lastUpload.timezone if set
 * otherwise default 'UTC' is returned
 * @param {string|null} tzName
 * @param {array} data
 * @returns {{timezoneAware:boolean, timezoneName: string}} timePrefs
 */
function setTimePrefs(tzName, data) {
  const timePrefs = {
    timezoneAware: true,
    timezoneName: 'UTC',
  };

  if (tzName) {
    timePrefs.timezoneName = tzName;
    return timePrefs;
  }
  // We want to make sure the latest upload, which may be beyond the data range we'll be
  // fetching, is stored so we can include it with the fetched results
  const lastUpload = _.find(data, { type: 'upload' });
  return getTimePrefs(lastUpload && lastUpload.timezone);
}

async function graphRendererOrca(data, config) {
  const resp = await axios.post(process.env.PLOTLY_ORCA, {
    figure: data,
    ...config,
  });
  return resp.data;
}

/**
 *
 * @param {Array<object>} data user data
 * @returns {ReportDates} startDate and endDate for the given report type
 */
function getDateRangeByReport(
  data,
  timezoneName,
  {
    agpDays = 14, basicsDays = 14, dailyDays = 14, bgLogDays = 14,
  } = {},
) {
  const getLatestDatums = (types) => _.pick(_.get(data, 'metaData.latestDatumByType'), types);
  const getMaxDate = (datums) => _.max(_.map(datums, (d) => d.normalEnd || d.normalTime));
  const endOfToday = () => moment.utc().tz(timezoneName).endOf('day').subtract(1, 'ms');

  const dates = {
    agp: {},
    daily: {},
    basics: {},
    bgLog: {},
  };

  const lastAGPDate = getMaxDate(getLatestDatums(['cbg', 'smbg']));

  const lastBasicsDate = getMaxDate(
    getLatestDatums(['basal', 'bolus', 'cbg', 'deviceEvent', 'smbg', 'wizard']),
  );

  const lastBGLogDate = getMaxDate(getLatestDatums(['smbg']));
  const lastDailyDate = getMaxDate(
    getLatestDatums([
      'basal',
      'bolus',
      'cbg',
      'deviceEvent',
      'food',
      'message',
      'smbg',
      'wizard',
    ]),
  );

  dates.agp.endDate = lastAGPDate ? moment.utc(lastAGPDate) : endOfToday();

  dates.agp.startDate = moment
    .utc(dates.agp.endDate)
    .tz(timezoneName)
    .subtract(agpDays - 1, 'days');

  dates.daily.endDate = lastDailyDate
    ? moment.utc(lastDailyDate)
    : endOfToday();
  dates.daily.startDate = moment
    .utc(dates.daily.endDate)
    .tz(timezoneName)
    .subtract(dailyDays - 1, 'days');

  dates.basics.endDate = lastBasicsDate
    ? moment.utc(lastBasicsDate)
    : endOfToday();
  dates.basics.startDate = moment
    .utc(dates.basics.endDate)
    .tz(timezoneName)
    .subtract(basicsDays - 1, 'days');

  dates.bgLog.endDate = lastBGLogDate
    ? moment.utc(lastBGLogDate)
    : endOfToday();
  dates.bgLog.startDate = moment
    .utc(dates.bgLog.endDate)
    .tz(timezoneName)
    .subtract(bgLogDays - 1, 'days');

  return dates;
}

/**
 *
 * @param {*} queries
 * @param {*} options
 * @param {*} dataUtil
 * @returns {{ pdfData: object, options: object }}
 */
function getReportData(queries, opts, dataUtil) {
  const containsDataForReport = (data, vals) => {
    const dataVals = _.flatten(_.valuesIn(_.get(data, vals, {})));
    return dataVals.length > 0;
  };
  const containsDataForBasics = (data) => {
    const {
      basals = {},
      boluses = {},
      fingersticks = {},
      siteChanges = {},
    } = _.get(data, 'basics.data.current.aggregationsByDate');

    const { calibration = {}, smbg = {} } = fingersticks;

    const basicsData = [basals, boluses, siteChanges, calibration, smbg];
    return _.some(basicsData, (d) => _.keys(d.byDate).length > 0);
  };
  const pdfData = {};
  const options = opts;

  if (queries.agp) {
    pdfData.agp = dataUtil.query(queries.agp);
    options.agp.disabled = !containsDataForReport(
      pdfData,
      'agp.data.current.data',
    );
  }
  if (queries.daily) {
    pdfData.daily = dataUtil.query(queries.daily);
    options.daily.disabled = !containsDataForReport(
      pdfData,
      'daily.data.current.data',
    );
  }
  if (queries.bgLog) {
    pdfData.bgLog = dataUtil.query(queries.bgLog);
    options.bgLog.disabled = !containsDataForReport(
      pdfData,
      'bgLog.data.current.data',
    );
  }
  if (queries.settings) {
    pdfData.settings = dataUtil.query(queries.settings);
    options.settings.disabled = !_.get(
      pdfData,
      'settings.metaData.latestPumpUpload.settings',
    );
  }
  if (queries.basics) {
    pdfData.basics = dataUtil.query(queries.basics);
    options.basics.disabled = !containsDataForBasics(pdfData);
  }

  return {
    pdfData,
    options,
  };
}

function getReportOptions(
  data,
  bgUnits,
  reports = [reportTypes.all],
  timePrefs,
  userId,
  userProfile = {},
) {
  const reportDates = getDateRangeByReport(data, timePrefs.timezoneName);
  const reportQueries = buildDataQueries(bgUnits, timePrefs, reports);

  const printOptions = {
    agp: {
      endpoints: [
        reportDates.agp.startDate.toDate(),
        reportDates.agp.endDate.toDate(),
      ],
      disabled: false,
    },
    basics: {
      endpoints: [
        reportDates.basics.startDate.toDate(),
        reportDates.basics.endDate.toDate(),
      ],
      disabled: false,
    },
    bgLog: {
      endpoints: [
        reportDates.bgLog.startDate.toDate(),
        reportDates.bgLog.endDate.toDate(),
      ],
      disabled: false,
    },
    daily: {
      endpoints: [
        reportDates.daily.startDate.toDate(),
        reportDates.daily.endDate.toDate(),
      ],
      disabled: false,
    },
    settings: {
      disabled: false,
    },
    patient: {
      permissions: {},
      userid: userId,
      profile: userProfile,
      settings: {},
    },
  };

  reportQueries.daily.endpoints = printOptions.daily.endpoints;
  reportQueries.basics.endpoints = printOptions.basics.endpoints;
  reportQueries.agp.endpoints = printOptions.agp.endpoints;
  reportQueries.bgLog.endpoints = printOptions.bgLog.endpoints;

  return {
    queries: reportQueries,
    printOptions,
  };
}

/**
 *
 * @param {*} agpPDFData
 * @returns {array} processedSVGs
 */
async function processAGPSVGs(agpPDFData) {
  const agpSVGFigures = await generateAGPSVGDataURLS({
    ...agpPDFData,
  });

  const agpFigurePromises = _.map(agpSVGFigures, async (image, key) => {
    if (_.isArray(image)) {
      const processedArray = await Promise.all(
        _.map(image, async (img) => graphRendererOrca(img, { format: 'svg' })),
      );
      return [key, processedArray];
    }
    const processedValue = await graphRendererOrca(image, {
      format: 'svg',
    });
    return [key, processedValue];
  });
  const processedEntries = await Promise.all(agpFigurePromises);
  return _.fromPairs(processedEntries);
}

/**
 * @typedef {{
 *  agp: { startDate: string, endDate: string },
 *   basics: { startDate: string, endDate: string },
 *   bgLog: { startDate: string, endDate: string },
 *   daily: { startDate: string, endDate: string },
 * }} ReportDates
 */

/**
 *
 * @param {{
 *   userId: string;
 *   fullName: string;
 *   dob: string;
 *   mrn: string;
 *  }} userDetail
 * @param {{
 *   tzName: string;
 *   bgUnits: string;
 *   reports: Array;
 *   dates: ReportDates;
 *  }} reportDetail
 * @param {{
 *   token: string;
 *   sessionHeader: object;
 *  }} requestData;
 * @returns {object} pdfData
 */
module.exports = async function generateReport(
  log,
  userDetail,
  reportDetail,
  requestData,
) {
  const dataUtil = new DataUtil();
  const {
    userId, fullName, dob, mrn,
  } = userDetail;

  const { tzName, bgUnits, reports } = reportDetail;

  const { token, sessionHeader } = requestData;

  const serverTime = await getServerTime();
  log.debug('get server time ', serverTime);

  const latestDatums = await fetchUserData(
    userId,
    {
      type: reportDataTypes.join(','),
      latest: 1,
      endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
    },
    sessionHeader,
  );

  const queryOptions = getQueryOptions(
    latestDatums,
    bgUnits,
    serverTime,
    token,
  );
  log.debug('data query options ', queryOptions);
  const timePrefs = setTimePrefs(tzName, latestDatums);
  log.debug('user timePrefs ', timePrefs);

  const cancelRequest = axios.CancelToken.source();
  const requestConfig = { headers: sessionHeader };
  requestConfig.cancelToken = cancelRequest.token;
  requestConfig.params = queryOptions;

  const userData = await fetchUserData(
    userId,
    { ...queryOptions },
    requestConfig.headers,
  );
  log.debug(`Downloading data for User ${userId}...`);

  log.debug('add data to dataUtil');
  const data = dataUtil.addData(userData, userId, false);
  log.debug('getting report options');
  const { queries, printOptions } = getReportOptions(
    data,
    bgUnits,
    reports,
    timePrefs,
    userId,
    {
      fullName,
      patient: {
        mrn,
        birthday: dob,
      },
    },
  );

  log.debug('getting pdf report data');
  const reportData = getReportData(queries, printOptions, dataUtil);

  if (!reportData.options.agp.disabled) {
    reportData.options.svgDataURLS = await processAGPSVGs(
      reportData.pdfData.agp,
    );
  }

  const pdf = await createPrintPDFPackage(
    reportData.pdfData,
    reportData.options,
  ).catch((error) => log.error(error));
  log.debug('success', pdf);
  return pdf;
};
