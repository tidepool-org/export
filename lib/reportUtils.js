import moment from 'moment-timezone';
import _ from 'lodash';
import axios from 'axios';
import fs from 'fs';
import { generateAGPSVGDataURLS } from '@tidepool/viz/dist/genAGPURL';
import { mgdLUnits, mmolLUnits } from './utils';

export const reportDataTypes = [
  'cbg',
  'smbg',
  'basal',
  'bolus',
  'wizard',
  'food',
  'pumpSettings',
  'upload',
];

const allReports = 'all';
const basicsReport = 'basics';
const bgLogReport = 'bgLog';
const agpReport = 'agp';
const dailyReport = 'daily';
const settingReport = 'settings';

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
  if (units === mmolLUnits) {
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

/**
 *
 * @param {string} [units] @default [mmolLUnits] bg units used for report
 * @param {string} [timezoneName] @default [UTC] timezoneName used for report
 * @param {string[]} reports @default [allReports] reports to return queries for
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
  reports = [allReports],
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
  if (reports.includes(allReports)) {
    return dataQueries;
  }
  if (!reports.includes(basicsReport)) {
    delete dataQueries.basics;
  }
  if (!reports.includes(bgLogReport)) {
    delete dataQueries.bgLog;
  }
  if (!reports.includes(agpReport)) {
    delete dataQueries.agp;
  }
  if (!reports.includes(settingReport)) {
    delete dataQueries.settings;
  }
  if (!reports.includes(dailyReport)) {
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
export function getQueryOptions(data, units, serverTime, restrictedToken) {
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
export function setTimePrefs(tzName, data) {
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
  return getTimePrefs(lastUpload.timezone);
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
 * @returns {{
 *  agp: { startDate: string, endDate: string },
 *  basics: { startDate: string, endDate: string },
 *  bgLog: { startDate: string, endDate: string },
 *  daily: { startDate: string, endDate: string },
 *  }} startDate and endDate for the given report type
 */
function getDateRangeByReport(
  data,
  timezoneName,
  {
    agpDays = 14, basicsDays = 14, dailyDays = 14, bgLogDays = 14,
  },
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
 * @param {object} res
 * @param {object} pdf
 */
export async function sendPDFReport(res, pdf) {
  res.setHeader('Content-Disposition', 'attachment: filename="report.pdf"');
  res.setHeader('Content-Type', 'application/octet-stream');

  const blobArrayBuffer = await pdf.blob.arrayBuffer();
  const pdfBuffer = Buffer.from(blobArrayBuffer);
  fs.writeFileSync('test.pdf', pdfBuffer);
  res.send(pdfBuffer);
}

export function getReportOptions(
  data,
  bgUnits,
  reports = [allReports],
  timePrefs,
  userId,
  userProfile = {},
) {
  const reportDates = getDateRangeByReport(data, timePrefs.timezoneName);
  const reportQueries = buildDataQueries(bgUnits, timePrefs, reports);

  const opts = {
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

  reportQueries.daily.endpoints = opts.daily.endpoints;
  reportQueries.basics.endpoints = opts.basics.endpoints;
  reportQueries.agp.endpoints = opts.agp.endpoints;
  reportQueries.bgLog.endpoints = opts.bgLog.endpoints;

  return {
    queries: reportQueries,
    opts,
  };
}

/**
 *
 * @param {*} agpPDFData
 * @returns {array} processedSVGs
 */
export async function processAGPSVGs(agpPDFData) {
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
