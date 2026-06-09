/* eslint-disable no-unused-expressions */
import * as getAGPFigures from '@tidepool/viz/dist/getAGPFigures.js';
import * as vizDataUtil from '@tidepool/viz/dist/data.js';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment-timezone';
import * as vizPrintUtil from '@tidepool/viz/dist/print.js';
import * as PDFKit from 'pdfkit';

import blobStream from 'blob-stream';
import {
  fetchUserData, getServerTime, mgdLUnits, mmolLUnits,
} from './utils.mjs';

const { DataUtil } = vizDataUtil;
const { createPrintPDFPackage, utils: PrintPDFUtils } = vizPrintUtil;
const { generateAGPFigureDefinitions } = getAGPFigures;
const {
  reject,
  includes,
  max,
  map,
  find,
  get,
  pick,
  flatten,
  valuesIn,
  some,
  keys,
  isArray,
  fromPairs,
  reduce,
  each,
} = _;
PrintPDFUtils.PDFDocument = PDFKit;
PrintPDFUtils.blobStream = blobStream;

// Mirrors blip's constants so the export stays in parity with the print process.
const MS_IN_MIN = 60 * 1000;
const DEFAULT_CGM_SAMPLE_INTERVAL = 5 * MS_IN_MIN;
const DEFAULT_CGM_SAMPLE_INTERVAL_RANGE = [DEFAULT_CGM_SAMPLE_INTERVAL, Infinity];

// viz's SITE_CHANGE_TYPE_UNDECLARED sentinel. When passed, viz resolves the
// actual site-change source from the device manufacturer, so it is a safe
// default when the caller does not specify one.
const SITE_CHANGE_SOURCE_UNDECLARED = 'undeclared';

/**
 * used to construct and produce pdf report content
 */
class Report {
  #bgUnits = mmolLUnits;

  #timezoneName = 'UTC';

  // Keep this aligned with blip's ALL_FETCHED_DATA_TYPES so the same data is
  // available to the report queries as in the blip print process.
  #reportDataTypes = [
    'cbg',
    'smbg',
    'basal',
    'bolus',
    'insulin',
    'wizard',
    'food',
    'cgmSettings',
    'deviceEvent',
    'dosingDecision',
    'physicalActivity',
    'pumpSettings',
    'reportedState',
    'upload',
    'water',
  ];

  #dosingDecisionReasons = [
    'normalBolus',
    'simpleBolus',
    'watchBolus',
    'oneButtonBolus',
  ];

  #reportTypes = {
    all: 'all',
    basics: 'basics',
    bgLog: 'bgLog',
    agpBGM: 'agpBGM',
    agpCGM: 'agpCGM',
    daily: 'daily',
    settings: 'settings',
  };

  #commonStats = {
    averageGlucose: 'averageGlucose',
    averageDailyDose: 'averageDailyDose',
    bgExtents: 'bgExtents',
    carbs: 'carbs',
    coefficientOfVariation: 'coefficientOfVariation',
    glucoseManagementIndicator: 'glucoseManagementIndicator',
    readingsInRange: 'readingsInRange',
    sensorUsage: 'sensorUsage',
    standardDev: 'standardDev',
    timeInAuto: 'timeInAuto',
    timeInOverride: 'timeInOverride',
    timeInRange: 'timeInRange',
    totalInsulin: 'totalInsulin',
  };

  #reports = [this.#reportTypes.all];

  #printOpts = null;

  #reportDates;

  #log;

  #userDetail;

  #requestData;

  #dataUtil;

  /**
   *
   * @param {object} log
   * @param {{
   *   userId: string;
   *   fullName: string;
   *   dob: string;
   *   mrn: string;
   *  }} userDetail
   * @param {{
   *   tzName: string|null;
   *   bgUnits: string|null;
   *   reports: Array|null;
   *   startDate: string|null;
   *   endDate: string|null;
   *  }} reportDetail
   * @param {{
   *   token: string;
   *   sessionHeader: object;
   *  }} requestData;
   * @param {{
   *   agpBGM?: { endpoints?: number[]; disabled?: boolean };
   *   agpCGM?: { endpoints?: number[]; disabled?: boolean };
   *   basics?: { endpoints?: number[]; disabled?: boolean; siteChangeSource?: string };
   *   bgLog?: { endpoints?: number[]; disabled?: boolean };
   *   daily?: {
   *     endpoints?: number[];
   *     disabled?: boolean;
   *     cgmSampleIntervalRange?: number[];
   *   };
   *   settings?: { disabled?: boolean };
   *  }} [printOpts] optional per-report overrides; missing values fall back to defaults
   * @returns {object} pdfData
   */
  constructor(log, userDetail, reportDetail, requestData, printOpts) {
    this.#log = log;
    this.#userDetail = userDetail;
    const {
      tzName, bgUnits, reports, startDate, endDate,
    } = reportDetail;

    if (tzName) {
      this.#timezoneName = tzName;
    }
    if (bgUnits) {
      this.#bgUnits = bgUnits;
    }
    if (reports) {
      this.#reports = reports;
    }
    if (startDate && endDate) {
      this.#reportDates = { startDate, endDate };
    }
    // printOpts is not guaranteed to exist; default to an empty object so that
    // downstream navigation is always safe and we fall back to computed defaults.
    this.#printOpts = printOpts || {};
    this.#requestData = requestData;
    this.#dataUtil = new DataUtil();
  }

  getTimePrefs() {
    return {
      timezoneAware: true,
      timezoneName: this.#timezoneName,
    };
  }

  getBGPrefs() {
    if (this.#bgUnits === mgdLUnits) {
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

  getLatestTimezone(data) {
    return get(data, 'metaData.latestTimeZone');
  }

  getStatsByChartType(chartType, data) {
    const bgSource = get(data, 'metaData.bgSources.current');
    const cbgSelected = bgSource === 'cbg';
    const smbgSelected = bgSource === 'smbg';
    const isAutomatedBasalDevice = get(data, 'metaData.latestPumpUpload.isAutomatedBasalDevice');
    const isSettingsOverrideDevice = get(data, 'metaData.latestPumpUpload.isSettingsOverrideDevice');

    const stats = [];

    switch (chartType) {
      case 'basics':
        cbgSelected && stats.push(this.#commonStats.timeInRange);
        smbgSelected && stats.push(this.#commonStats.readingsInRange);
        stats.push(this.#commonStats.averageGlucose);
        cbgSelected && stats.push(this.#commonStats.sensorUsage);
        stats.push(this.#commonStats.totalInsulin);
        isAutomatedBasalDevice && stats.push(this.#commonStats.timeInAuto);
        isSettingsOverrideDevice && stats.push(this.#commonStats.timeInOverride);
        stats.push(this.#commonStats.carbs);
        stats.push(this.#commonStats.averageDailyDose);
        cbgSelected && stats.push(this.#commonStats.glucoseManagementIndicator);
        stats.push(this.#commonStats.standardDev);
        stats.push(this.#commonStats.coefficientOfVariation);
        stats.push(this.#commonStats.bgExtents);
        break;

      case 'daily':
        cbgSelected && stats.push(this.#commonStats.timeInRange);
        smbgSelected && stats.push(this.#commonStats.readingsInRange);
        stats.push(this.#commonStats.averageGlucose);
        stats.push(this.#commonStats.totalInsulin);
        isAutomatedBasalDevice && stats.push(this.#commonStats.timeInAuto);
        isSettingsOverrideDevice && stats.push(this.#commonStats.timeInOverride);
        stats.push(this.#commonStats.carbs);
        cbgSelected && stats.push(this.#commonStats.standardDev);
        cbgSelected && stats.push(this.#commonStats.coefficientOfVariation);
        break;

      case 'bgLog':
        stats.push(this.#commonStats.readingsInRange);
        stats.push(this.#commonStats.averageGlucose);
        stats.push(this.#commonStats.standardDev);
        stats.push(this.#commonStats.coefficientOfVariation);
        break;

      case 'agpBGM':
        stats.push(this.#commonStats.averageGlucose);
        stats.push(this.#commonStats.bgExtents);
        stats.push(this.#commonStats.coefficientOfVariation);
        stats.push(this.#commonStats.glucoseManagementIndicator);
        stats.push(this.#commonStats.readingsInRange);
        break;

      case 'agpCGM':
        stats.push(this.#commonStats.averageGlucose);
        stats.push(this.#commonStats.bgExtents);
        stats.push(this.#commonStats.coefficientOfVariation);
        stats.push(this.#commonStats.glucoseManagementIndicator);
        stats.push(this.#commonStats.sensorUsage);
        stats.push(this.#commonStats.timeInRange);
        break;

      case 'trends':
        cbgSelected && stats.push(this.#commonStats.timeInRange);
        smbgSelected && stats.push(this.#commonStats.readingsInRange);
        stats.push(this.#commonStats.averageGlucose);
        cbgSelected && stats.push(this.#commonStats.sensorUsage);
        stats.push(this.#commonStats.totalInsulin);
        stats.push(this.#commonStats.averageDailyDose);
        isAutomatedBasalDevice && stats.push(this.#commonStats.timeInAuto);
        isSettingsOverrideDevice && stats.push(this.#commonStats.timeInOverride);
        cbgSelected && stats.push(this.#commonStats.glucoseManagementIndicator);
        stats.push(this.#commonStats.standardDev);
        stats.push(this.#commonStats.coefficientOfVariation);
        stats.push(this.#commonStats.bgExtents);
        break;

      default:
        break;
    }

    return stats;
  }

  buildReportQueries({ data }) {
    const bgSource = get(data, 'metaData.bgSources.current');
    const dataQueries = {
      basics: {
        endpoints: [],
        aggregationsByDate: 'basals, boluses, fingersticks, siteChanges',
        bgSource: bgSource || 'cbg',
        stats: this.getStatsByChartType('basics', data),
        excludeDaysWithoutBolus: false,
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      bgLog: {
        endpoints: [],
        aggregationsByDate: 'dataByDate',
        stats: this.getStatsByChartType('bgLog', data),
        types: {
          smbg: {},
        },
        bgSource: 'smbg',
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      daily: {
        endpoints: [],
        aggregationsByDate: 'dataByDate, statsByDate',
        stats: this.getStatsByChartType('daily', data),
        types: {
          basal: {},
          bolus: {},
          insulin: {},
          cbg: {},
          deviceEvent: {},
          food: {},
          message: {},
          smbg: {},
          wizard: {},
          physicalActivity: {},
          reportedState: {},
        },
        bgSource: bgSource || 'cbg',
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      agpBGM: {
        endpoints: [],
        aggregationsByDate: 'dataByDate, statsByDate',
        bgSource: 'smbg',
        stats: this.getStatsByChartType('agpBGM', data),
        types: {
          smbg: {},
        },
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      agpCGM: {
        endpoints: [],
        aggregationsByDate: 'dataByDate, statsByDate',
        bgSource: 'cbg',
        stats: this.getStatsByChartType('agpCGM', data),
        types: {
          cbg: {},
        },
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      settings: {
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources, devices, matchedDevices',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
    };
    if (this.#reports.includes(this.#reportTypes.all)) {
      return dataQueries;
    }
    if (!this.#reports.includes(this.#reportTypes.basics)) {
      delete dataQueries.basics;
    }
    if (!this.#reports.includes(this.#reportTypes.bgLog)) {
      delete dataQueries.bgLog;
    }
    if (!this.#reports.includes(this.#reportTypes.agpBGM)) {
      delete dataQueries.agpBGM;
    }
    if (!this.#reports.includes(this.#reportTypes.agpCGM)) {
      delete dataQueries.agpCGM;
    }
    if (!this.#reports.includes(this.#reportTypes.settings)) {
      delete dataQueries.settings;
    }
    if (!this.#reports.includes(this.#reportTypes.daily)) {
      delete dataQueries.daily;
    }
    return dataQueries;
  }

  /**
   *
   * @param {{
   *   data: array|null;
   *   serverTime: string|null;
   *   restrictedToken: string|null;
   *  }} params
   * @returns {{
   *    initial: boolean,
   *    startDate: string,
   *    endDate: string,
   *    bgPrefs: object,
   *    restricted_token: string|null,
   *    getPumpSettingsUploadRecordById: object|null
   * }}
   */
  userDataQueryOptions(params = {}) {
    const { data, serverTime, restrictedToken } = params;
    const options = {
      initial: true,
      bgPrefs: this.getBGPrefs(),
    };

    if (restrictedToken) {
      options.restricted_token = restrictedToken;
    }

    if (this.#reportDates) {
      let start = moment.utc(this.#reportDates.startDate);
      const end = moment.utc(this.#reportDates.endDate);

      // see if they are less than 90 days apart
      const duration = end.diff(start, 'days');
      if (duration > 90) {
        const err = new Error(
          `Error creating PDF: maximum of 90 days, requested ${duration}`,
        );
        err.status = 400;
        err.message = 'report duration maximum of 90 days exceeded';
        throw err;
      }

      const daysDiff = end.diff(start, 'days');
      if (daysDiff < 30) {
        start = start.subtract(30 - daysDiff, 'days');
      }
      options.startDate = start.toISOString();
      options.endDate = end.toISOString();
    } else {
      // We then determine the date range to fetch data for by first finding the latest
      // diabetes datum time and going back 30 days
      const diabetesDatums = reject(data, (d) => includes(['food', 'upload', 'pumpSettings'], d.type));
      const latestDiabetesDatumTime = max(
        map(diabetesDatums, (d) => d.time),
      );
      const latestDatumTime = max(map(data, (d) => d.time));

      // If we have no latest diabetes datum time, we fall back to use the server time as the
      // ideal end date.
      const fetchFromTime = latestDiabetesDatumTime || serverTime;
      const fetchToTime = latestDatumTime || serverTime;

      options.startDate = moment.utc(fetchFromTime)
        .subtract(30, 'days')
        .startOf('day')
        .toISOString();

      // We add a 1 day buffer to the end date since we can get `time` fields that are slightly
      // in the future due to timezones or incorrect device and/or computer time upon upload.
      options.endDate = moment.utc(fetchToTime).add(1, 'days').toISOString();
    }

    if (restrictedToken) {
      options.restricted_token = restrictedToken;
    }

    const latestPumpSettings = find(data, {
      type: 'pumpSettings',
    });
    const latestPumpSettingsUploadId = get(
      latestPumpSettings || {},
      'uploadId',
    );
    const latestPumpSettingsUpload = find(data, {
      type: 'upload',
      uploadId: latestPumpSettingsUploadId,
    });

    if (latestPumpSettingsUploadId && !latestPumpSettingsUpload) {
      // If we have pump settings, but we don't have the corresponding upload record used
      // to get the device source, we need to fetch it
      options.getPumpSettingsUploadRecordById = latestPumpSettingsUploadId;
    }

    // Pass through metadata needed for downstream settings alignment
    // Note: latestPumpData is not a supported metaData key in DataUtil,
    // so we limit to allowed metaData fields here.
    options.metaData = options.metaData
      ? `${options.metaData}, latestPumpUpload, latestDatumByType`
      : 'latestPumpUpload, latestDatumByType';

    options.type = this.#reportDataTypes.join(',');
    options['dosingDecision.reason'] = this.#dosingDecisionReasons.join(',');

    // NOTE: 1-minute CGM data is not currently enabled in blip, so we don't
    // request it here. If/when it is enabled, the platform `/data` endpoint
    // accepts a `sampleIntervalMinimum` query param to fetch higher-resolution
    // CGM data. It should be read from the requested print options, e.g.:
    //   options.sampleIntervalMinimum =
    //     this.#printOpts?.daily?.cgmSampleIntervalRange?.[0] || DEFAULT_CGM_SAMPLE_INTERVAL;
    // Without it, the daily query's `cgmSampleIntervalRange` filter has no
    // 1-minute data to act on (blip mirrors this same fetch param).

    return options;
  }

  getDateRangeByReport(params) {
    const {
      data,
      days = {
        agpBGM: 30,
        agpCGM: 14,
        basics: 14,
        daily: 14,
        bgLog: 30,
      },
    } = params;

    if (this.#reportDates) {
      const endDate = moment(this.#reportDates.endDate)
        .tz(this.#timezoneName)
        .add(1, 'day')
        .startOf('day');
      const startDate = moment(this.#reportDates.startDate)
        .tz(this.#timezoneName)
        .add(1, 'day')
        .startOf('day');
      let bgLogStartDate = moment(this.#reportDates.startDate)
        .tz(this.#timezoneName)
        .add(1, 'day')
        .startOf('day');

      const daysDiff = endDate.diff(bgLogStartDate, 'days');
      if (daysDiff < 30) {
        bgLogStartDate = bgLogStartDate.subtract(30 - daysDiff, 'days');
      }

      return {
        agpBGM: {
          startDate: bgLogStartDate,
          endDate,
        },
        agpCGM: {
          startDate,
          endDate,
        },
        daily: {
          startDate,
          endDate,
        },
        basics: {
          startDate,
          endDate,
        },
        bgLog: {
          // set as a minium of 30 days
          startDate: bgLogStartDate,
          endDate,
        },
      };
    }

    const dates = {
      agpBGM: {},
      agpCGM: {},
      daily: {},
      basics: {},
      bgLog: {},
    };

    const getLatestDatums = (types) => pick(get(data, 'metaData.latestDatumByType'), types);
    const getMaxDate = (datums) => max(map(datums, (d) => d.normalEnd || d.normalTime));
    const endOfToday = () => moment.utc().tz(this.#timezoneName).add(1, 'day').startOf('day');

    const lastAGPDate = getMaxDate(getLatestDatums(['cbg', 'smbg']));

    const lastBasicsDate = getMaxDate(
      getLatestDatums([
        'basal',
        'bolus',
        'cbg',
        'deviceEvent',
        'smbg',
        'wizard',
      ]),
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

    dates.agpCGM.endDate = lastAGPDate
      ? moment.utc(lastAGPDate).tz(this.#timezoneName).add(1, 'day').startOf('day')
      : endOfToday();
    dates.agpCGM.startDate = moment.utc(dates.agpCGM.endDate)
      .tz(this.#timezoneName)
      .subtract(days.agpCGM - 1, 'days');

    dates.agpBGM.endDate = lastAGPDate
      ? moment.utc(lastAGPDate).tz(this.#timezoneName).add(1, 'day').startOf('day')
      : endOfToday();
    dates.agpBGM.startDate = moment.utc(dates.agpBGM.endDate)
      .tz(this.#timezoneName)
      .subtract(days.agpBGM - 1, 'days');

    dates.daily.endDate = lastDailyDate
      ? moment.utc(lastDailyDate).tz(this.#timezoneName).add(1, 'day').startOf('day')
      : endOfToday();
    dates.daily.startDate = moment.utc(dates.daily.endDate)
      .tz(this.#timezoneName)
      .subtract(days.daily - 1, 'days');

    dates.basics.endDate = lastBasicsDate
      ? moment.utc(lastBasicsDate).tz(this.#timezoneName).add(1, 'day').startOf('day')
      : endOfToday();
    dates.basics.startDate = moment.utc(dates.basics.endDate)
      .tz(this.#timezoneName)
      .subtract(days.basics - 1, 'days');

    dates.bgLog.endDate = lastBGLogDate
      ? moment.utc(lastBGLogDate).tz(this.#timezoneName).add(1, 'day').startOf('day')
      : endOfToday();
    dates.bgLog.startDate = moment.utc(dates.bgLog.endDate)
      .tz(this.#timezoneName)
      .subtract(days.bgLog - 1, 'days');

    return dates;
  }

  /**
   *
   * @param { object;} data
   * @returns
   */
  getReportOptions(data) {
    const datesByReport = this.getDateRangeByReport({ data });

    const reportQueries = this.buildReportQueries({ data });

    // PrintOpts, when supplied, is assumed to be a complete and whole config for
    // each report it contains, so we take its value wholesale. Anything not
    // provided falls back to the computed default below.
    const printOpts = this.#printOpts;

    const printOptions = {
      agpBGM: printOpts?.agpBGM || {
        endpoints: [
          datesByReport.agpBGM.startDate.toDate(),
          datesByReport.agpBGM.endDate.toDate(),
        ],
        disabled: false,
      },
      agpCGM: printOpts?.agpCGM || {
        endpoints: [
          datesByReport.agpCGM.startDate.toDate(),
          datesByReport.agpCGM.endDate.toDate(),
        ],
        disabled: false,
      },
      basics: printOpts?.basics || {
        endpoints: [
          datesByReport.basics.startDate.toDate(),
          datesByReport.basics.endDate.toDate(),
        ],
        disabled: false,
      },
      bgLog: printOpts?.bgLog || {
        endpoints: [
          datesByReport.bgLog.startDate.toDate(),
          datesByReport.bgLog.endDate.toDate(),
        ],
        disabled: false,
      },
      daily: printOpts?.daily || {
        endpoints: [
          datesByReport.daily.startDate.toDate(),
          datesByReport.daily.endDate.toDate(),
        ],
        disabled: false,
      },
      settings: printOpts?.settings || {
        disabled: false,
      },
      patient: {
        permissions: {},
        userid: this.#userDetail.userId,
        profile: {
          fullName: this.#userDetail.fullName,
          patient: {
            mrn: this.#userDetail.mrn,
            birthday: this.#userDetail.dob,
          },
        },
        settings: {
          // siteChangeSource only affects the basics report's site-change
          // section, so the caller declares it under printOpts.basics. viz reads
          // it from patient.settings, so we surface it here. Fall back to the
          // undeclared sentinel (viz then derives it from the device
          // manufacturer) when the caller does not supply one.
          siteChangeSource: get(
            this.#printOpts,
            'basics.siteChangeSource',
            SITE_CHANGE_SOURCE_UNDECLARED,
          ),
        },
      },
    };

    if (
      this.#reports.includes(this.#reportTypes.all)
      || this.#reports.includes(this.#reportTypes.daily)
    ) {
      reportQueries.daily.endpoints = printOptions.daily.endpoints;
      // cgmSampleIntervalRange is consumed by the daily query, not the print
      // view. Fall back to the default range when the caller omits it, matching
      // blip's getQueries behavior.
      reportQueries.daily.cgmSampleIntervalRange = printOptions.daily.cgmSampleIntervalRange
        || DEFAULT_CGM_SAMPLE_INTERVAL_RANGE;
    }
    if (
      this.#reports.includes(this.#reportTypes.all)
      || this.#reports.includes(this.#reportTypes.basics)
    ) {
      reportQueries.basics.endpoints = printOptions.basics.endpoints;
    }
    if (
      this.#reports.includes(this.#reportTypes.all)
      || this.#reports.includes(this.#reportTypes.agpBGM)
    ) {
      reportQueries.agpBGM.endpoints = printOptions.agpBGM.endpoints;
    }
    if (
      this.#reports.includes(this.#reportTypes.all)
      || this.#reports.includes(this.#reportTypes.agpCGM)
    ) {
      reportQueries.agpCGM.endpoints = printOptions.agpCGM.endpoints;
    }
    if (
      this.#reports.includes(this.#reportTypes.all)
      || this.#reports.includes(this.#reportTypes.bgLog)
    ) {
      reportQueries.bgLog.endpoints = printOptions.bgLog.endpoints;
    }

    return {
      queries: reportQueries,
      printOptions,
    };
  }

  /**
   *
   * @param {*} queries
   * @param {*} options
   * @returns {{ pdfData: object, options: object }}
   */
  runReportQueries(queries, opts) {
    const containsDataForReport = (data, vals) => {
      const dataVals = flatten(valuesIn(get(data, vals, {})));
      return dataVals.length > 0;
    };
    const containsDataForBasics = (data) => {
      const {
        basals = {},
        boluses = {},
        fingersticks = {},
        siteChanges = {},
      } = get(data, 'basics.data.current.aggregationsByDate');
      const { calibration = {}, smbg = {} } = fingersticks;
      const basicsData = [basals, boluses, siteChanges, calibration, smbg];
      return some(basicsData, (d) => keys(d.byDate).length > 0);
    };

    const pdfData = {};
    const options = opts;

    // A report stays disabled when there's no data for it, but an explicit
    // `disabled: true` from the caller's PrintOpts is always honored.
    if (queries.agpBGM) {
      pdfData.agpBGM = this.#dataUtil.query(queries.agpBGM);
      options.agpBGM.disabled = options.agpBGM.disabled || !containsDataForReport(
        pdfData,
        'agpBGM.data.current.data',
      );
    }
    if (queries.agpCGM) {
      pdfData.agpCGM = this.#dataUtil.query(queries.agpCGM);
      options.agpCGM.disabled = options.agpCGM.disabled || !containsDataForReport(
        pdfData,
        'agpCGM.data.current.data',
      );
    }
    if (queries.daily) {
      pdfData.daily = this.#dataUtil.query(queries.daily);
      options.daily.disabled = options.daily.disabled || !containsDataForReport(
        pdfData,
        'daily.data.current.data',
      );
    }
    if (queries.bgLog) {
      pdfData.bgLog = this.#dataUtil.query(queries.bgLog);
      options.bgLog.disabled = options.bgLog.disabled || !containsDataForReport(
        pdfData,
        'bgLog.data.current.data',
      );
    }
    if (queries.settings) {
      pdfData.settings = this.#dataUtil.query(queries.settings);
      options.settings.disabled = options.settings.disabled || !get(
        pdfData,
        'settings.metaData.latestPumpUpload.settings',
      );
    }
    if (queries.basics) {
      pdfData.basics = this.#dataUtil.query(queries.basics);
      options.basics.disabled = options.basics.disabled || !containsDataForBasics(pdfData);
    }

    return {
      pdfData,
      options,
    };
  }

  async graphRendererOrca(data) {
    this.resp = await axios.post(process.env.PLOTLY_ORCA, {
      figure: data,
      format: 'svg',
    });
    return this.resp.data;
  }

  async processAGPSVGs(agpPDFData, reportTypes) {
    const promises = [];

    await each(reportTypes, async (reportType) => {
      const images = await generateAGPFigureDefinitions({
        ...agpPDFData?.[reportType],
      });

      promises.push(...map(images, async (image, key) => {
        if (isArray(image)) {
          const processedArray = await Promise.all(
            map(image, async (img) => this.graphRendererOrca(img)),
          );
          return [reportType, [key, processedArray]];
        }
        const processedValue = await this.graphRendererOrca(image);
        return [reportType, [key, processedValue]];
      }));
    });

    const results = await Promise.all(promises);

    const processedImages = reduce(results, (res, entry) => {
      const processedImage = fromPairs(entry.slice(1));
      res[entry[0]] = { ...res[entry[0]], ...processedImage };
      return res;
    }, {});

    return processedImages;
  }

  /**
   * Determine the latest in-range insulin datum and the preferred pumpSettings fetch params.
   * Pure helper to support testing alignment logic.
   */
  static getLatestInsulinAndPumpSettingsParams(userData, startDate, endDate, token, sessionHeader) {
    const start = moment.utc(startDate);
    const end = moment.utc(endDate);

    const insulinDiabetesDatums = reject(userData, (d) => {
      const datumTime = moment.utc(d.time);
      return !includes(['bolus', 'basal'], d.type)
        || datumTime.isBefore(start)
        || datumTime.isAfter(end);
    });

    const latestDiabetesDatum = insulinDiabetesDatums.length > 0
      ? insulinDiabetesDatums.reduce((latest, current) => {
        const currentTime = moment.utc(current.time);
        const latestTime = moment.utc(latest.time);
        return currentTime.isAfter(latestTime) ? current : latest;
      })
      : null;

    if (latestDiabetesDatum && latestDiabetesDatum.uploadId) {
      const latestUpload = userData.find(
        (d) => d.type === 'upload' && d.uploadId === latestDiabetesDatum.uploadId,
      );

      const isContinuous = latestUpload?.dataSetType === 'continuous';

      // For continuous datasets, align pump settings to the latest in-range pump data
      // for this upload. For non-continuous datasets, align to the upload record time
      // (mirrors viz behavior), falling back to insulin time if upload time is missing.
      let endDateBound;

      if (isContinuous) {
        const pumpDataForUpload = userData.filter((d) => {
          if (!['basal', 'bolus'].includes(d.type)) return false;
          if (d.uploadId !== latestDiabetesDatum.uploadId) return false;
          const t = moment.utc(d.time);
          return !t.isBefore(start) && !t.isAfter(end);
        });

        if (pumpDataForUpload.length > 0) {
          const latestPumpData = pumpDataForUpload.reduce((latest, current) => {
            const currentTime = moment.utc(current.time);
            const latestTime = moment.utc(latest.time);
            return currentTime.isAfter(latestTime) ? current : latest;
          });

          endDateBound = moment.utc(latestPumpData.time).toISOString();
        } else {
          endDateBound = moment.utc(latestDiabetesDatum.time).toISOString();
        }
      } else if (latestUpload?.time) {
        endDateBound = moment.utc(latestUpload.time).toISOString();
      } else {
        endDateBound = moment.utc(latestDiabetesDatum.time).toISOString();
      }

      const pumpSettingsParams = {
        type: 'pumpSettings',
        uploadId: latestDiabetesDatum.uploadId,
        latest: 1,
        restricted_token: token,
      };

      // Non-continuous datasets have pumpSettings records after all diabetes data
      if (isContinuous) {
        pumpSettingsParams.endDate = endDateBound;
      }

      return {
        latestDiabetesDatum,
        pumpSettingsParams,
        pumpSettingsHeaders: {
          headers: sessionHeader,
        },
      };
    }

    return { latestDiabetesDatum: null, pumpSettingsParams: null, pumpSettingsHeaders: null };
  }

  async generate() {
    if (this.#reportDates) {
      this.userDataQueryParams = this.userDataQueryOptions({
        restrictedToken: this.#requestData.token,
      });
    } else {
      const serverTime = await getServerTime();
      this.#log.debug('get server time ', serverTime);

      const fetchConfig = {
        headers: this.#requestData.sessionHeader,
        params: {
          type: this.#reportDataTypes.join(','),
          latest: 1,
          endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
          restricted_token: this.#requestData.token,
        },
      };

      const latestDatums = await fetchUserData(
        this.#userDetail.userId,
        fetchConfig,
      );

      this.userDataQueryParams = this.userDataQueryOptions({
        data: latestDatums,
        serverTime,
        restrictedToken: this.#requestData.token,
      });
    }

    this.#log.debug('data query options ', this.userDataQueryParams);
    this.#log.debug('user timePrefs ', this.getTimePrefs());

    const fetchConfig = {
      headers: this.#requestData.sessionHeader,
      params: this.userDataQueryParams,
    };

    const userData = await fetchUserData(
      this.#userDetail.userId,
      fetchConfig,
    );

    if (this.#reportDates) {
      const { startDate, endDate } = this.#reportDates;
      const start = moment.utc(startDate);
      const end = moment.utc(endDate);

      const { pumpSettingsParams } = Report.getLatestInsulinAndPumpSettingsParams(
        userData,
        start,
        end,
        this.#requestData.token,
        this.#requestData.sessionHeader,
      );

      let pumpSettingsToAdd = null;

      this.#log.debug('pumpSettingsParams ', pumpSettingsParams);

      if (pumpSettingsParams) {
        const pumpSettingsForUploadFetch = await fetchUserData(
          this.#userDetail.userId,
          {
            headers: this.#requestData.sessionHeader,
            params: pumpSettingsParams,
          },
        ).catch((error) => {
          this.#log.error(error);
        });

        if (pumpSettingsForUploadFetch?.length > 0) {
          [pumpSettingsToAdd] = pumpSettingsForUploadFetch;
          userData.push(pumpSettingsToAdd);
        }
      }

      if (!pumpSettingsToAdd) {
        const pumpSettingsFetch = await fetchUserData(
          this.#userDetail.userId,
          {
            headers: this.#requestData.sessionHeader,
            params: {
              type: 'pumpSettings',
              latest: 1,
              endDate: end.toISOString(),
              restricted_token: this.#requestData.token,
            },
          },
        ).catch((error) => {
          this.#log.error(error);
        });

        if (pumpSettingsFetch?.length > 0) {
          [pumpSettingsToAdd] = pumpSettingsFetch;
          userData.push(pumpSettingsToAdd);
        }
      }

      const latestPumpSettings = pumpSettingsToAdd || find(userData, { type: 'pumpSettings' });
      const latestPumpSettingsUploadId = get(latestPumpSettings || {}, 'uploadId');

      if (latestPumpSettingsUploadId) {
        const latestPumpSettingsUpload = find(userData, {
          type: 'upload',
          uploadId: latestPumpSettingsUploadId,
        });

        if (!latestPumpSettingsUpload) {
          const pumpSettingsUploadFetch = await fetchUserData(
            this.#userDetail.userId,
            {
              headers: this.#requestData.sessionHeader,
              params: {
                type: 'upload',
                uploadId: latestPumpSettingsUploadId,
                restricted_token: this.#requestData.token,
              },
            },
          ).catch((error) => {
            this.#log.error(error);
          });

          if (pumpSettingsUploadFetch?.length > 0) {
            userData.push(pumpSettingsUploadFetch[0]);
          }
        }
      }
    }

    this.#log.debug(`Downloading data for User ${this.#userDetail.userId}...`);

    this.#log.debug('add data to dataUtil');
    const data = this.#dataUtil.addData(
      userData,
      this.#userDetail.userId,
      false,
    );

    // Use the timezone from the report parameters only if we can't infer the latest
    // time zone name from the data.
    const latestTimezone = this.getLatestTimezone(data);
    if (latestTimezone && latestTimezone.name) {
      this.#log.debug(latestTimezone.message || `using latest timezone name "${latestTimezone.name}" from user data`);
      this.#timezoneName = latestTimezone.name;
    }

    this.#log.debug('getting report options');
    const { queries, printOptions } = this.getReportOptions(data);

    this.#log.debug('getting pdf report data');

    const reportData = this.runReportQueries(queries, printOptions);
    const reportTypes = [];
    if (!reportData.options.agpBGM.disabled) {
      reportTypes.push('agpBGM');
    }
    if (!reportData.options.agpCGM.disabled) {
      reportTypes.push('agpCGM');
    }
    if (reportTypes.length > 0) {
      reportData.options.svgDataURLS = await this.processAGPSVGs(
        reportData.pdfData,
        reportTypes,
      );
    }

    const pdf = await createPrintPDFPackage(
      reportData.pdfData,
      reportData.options,
    ).catch((error) => {
      this.#log.error(error);
      throw new Error(`Error creating PDF: ${error.message}\n${error.stack}`, {
        cause: error,
      });
    });
    this.#log.debug('success', pdf);
    return pdf;
  }
}

export default {
  Report,
};
