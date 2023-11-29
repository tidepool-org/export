/* eslint-disable no-unused-expressions */
import getAGPFigures from '@tidepool/viz/dist/getAGPFigures.js';
import vizDataUtil from '@tidepool/viz/dist/data.js';
import { Blob } from 'buffer';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment-timezone';

import vizPrintUtil from '@tidepool/viz/dist/print.js';
import PDFKit from 'pdfkit';
import {
  fetchUserData, getServerTime, mgdLUnits, mmolLUnits,
} from './utils.js';

global.Blob = Blob;
// needs to be defined prior to importing blob-stream
const blobStream = await import('blob-stream');
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
PrintPDFUtils.blobStream = blobStream.default;

/**
 * used to construct and produce pdf report content
 */
class Report {
  #bgUnits = mmolLUnits;

  #timezoneName = 'UTC';

  #reportDataTypes = [
    'cbg',
    'smbg',
    'basal',
    'bolus',
    'wizard',
    'food',
    'pumpSettings',
    'upload',
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
   * @returns {object} pdfData
   */
  constructor(log, userDetail, reportDetail, requestData) {
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
        metaData: 'latestPumpUpload, bgSources',
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
        metaData: 'latestPumpUpload, bgSources',
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
          cbg: {},
          deviceEvent: {},
          food: {},
          message: {},
          smbg: {},
          wizard: {},
        },
        bgSource: bgSource || 'cbg',
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources',
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
        metaData: 'latestPumpUpload, bgSources',
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
        metaData: 'latestPumpUpload, bgSources',
        timePrefs: this.getTimePrefs(),
        excludedDevices: [],
      },
      settings: {
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources',
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
      // If we have pump settings, but we don't have the corresponing upload record used
      // to get the device source, we need to fetch it
      options.getPumpSettingsUploadRecordById = latestPumpSettingsUploadId;
    }
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
    dates.agpCGM.startDate = moment.utc(dates.agp.endDate)
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

    const printOptions = {
      agpBGM: {
        endpoints: [
          datesByReport.agpBGM.startDate.toDate(),
          datesByReport.agpBGM.endDate.toDate(),
        ],
        disabled: false,
      },
      agpCGM: {
        endpoints: [
          datesByReport.agpCGM.startDate.toDate(),
          datesByReport.agpCGM.endDate.toDate(),
        ],
        disabled: false,
      },
      basics: {
        endpoints: [
          datesByReport.basics.startDate.toDate(),
          datesByReport.basics.endDate.toDate(),
        ],
        disabled: false,
      },
      bgLog: {
        endpoints: [
          datesByReport.bgLog.startDate.toDate(),
          datesByReport.bgLog.endDate.toDate(),
        ],
        disabled: false,
      },
      daily: {
        endpoints: [
          datesByReport.daily.startDate.toDate(),
          datesByReport.daily.endDate.toDate(),
        ],
        disabled: false,
      },
      settings: {
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
        settings: {},
      },
    };

    if (
      this.#reports.includes(this.#reportTypes.all, this.#reportTypes.daily)
    ) {
      reportQueries.daily.endpoints = printOptions.daily.endpoints;
    }
    if (
      this.#reports.includes(this.#reportTypes.all, this.#reportTypes.basics)
    ) {
      reportQueries.basics.endpoints = printOptions.basics.endpoints;
    }
    if (this.#reports.includes(this.#reportTypes.all, this.#reportTypes.agpBGM)) {
      reportQueries.agpBGM.endpoints = printOptions.agpBGM.endpoints;
    }
    if (this.#reports.includes(this.#reportTypes.all, this.#reportTypes.agpCGM)) {
      reportQueries.agpCGM.endpoints = printOptions.agpCGM.endpoints;
    }
    if (
      this.#reports.includes(this.#reportTypes.all, this.#reportTypes.bgLog)
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

    if (queries.agpBGM) {
      pdfData.agpBGM = this.#dataUtil.query(queries.agpBGM);
      options.agpBGM.disabled = !containsDataForReport(
        pdfData,
        'agpBGM.data.current.data',
      );
    }
    if (queries.agpCGM) {
      pdfData.agpCGM = this.#dataUtil.query(queries.agpCGM);
      options.agpCGM.disabled = !containsDataForReport(
        pdfData,
        'agpCGM.data.current.data',
      );
    }
    if (queries.daily) {
      pdfData.daily = this.#dataUtil.query(queries.daily);
      options.daily.disabled = !containsDataForReport(
        pdfData,
        'daily.data.current.data',
      );
    }
    if (queries.bgLog) {
      pdfData.bgLog = this.#dataUtil.query(queries.bgLog);
      options.bgLog.disabled = !containsDataForReport(
        pdfData,
        'bgLog.data.current.data',
      );
    }
    if (queries.settings) {
      pdfData.settings = this.#dataUtil.query(queries.settings);
      options.settings.disabled = !get(
        pdfData,
        'settings.metaData.latestPumpUpload.settings',
      );
    }
    if (queries.basics) {
      pdfData.basics = this.#dataUtil.query(queries.basics);
      options.basics.disabled = !containsDataForBasics(pdfData);
    }

    return {
      pdfData,
      options,
    };
  }

  async graphRendererOrca(data) {
    this.resp = await axios.post(process.env.PLOTLY_ORCA, {
      figure: data,
      ...{ format: 'svg' },
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

  async generate() {
    if (this.#reportDates) {
      this.userDataQueryParams = this.userDataQueryOptions();
    } else {
      const serverTime = await getServerTime();
      this.#log.debug('get server time ', serverTime);

      const fetchConfig = {
        headers: this.#requestData.sessionHeader,
        params: {
          type: this.#reportDataTypes.join(','),
          latest: 1,
          endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
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
      // fetch the latest pump settings record for date bound reports
      const pumpSettingsFetch = await fetchUserData(
        this.#userDetail.userId,
        {
          headers: this.#requestData.sessionHeader,
          params: {
            type: 'pumpSettings',
            latest: 1,
          },
        },
      ).catch((error) => {
        this.#log.error(error);
      });

      if (pumpSettingsFetch?.length > 0) {
        userData.push(pumpSettingsFetch[0]);
      }

      const latestPumpSettings = find(userData, {
        type: 'pumpSettings',
      });

      const latestPumpSettingsUploadId = get(
        latestPumpSettings || {},
        'uploadId',
      );

      const latestPumpSettingsUpload = find(userData, {
        type: 'upload',
        uploadId: latestPumpSettingsUploadId,
      });

      if (latestPumpSettingsUploadId && !latestPumpSettingsUpload) {
        // If we have pump settings, but we don't have the corresponing upload record used
        // to get the device source, we need to fetch it
        const pumpSettingsUploadFetch = await fetchUserData(
          this.#userDetail.userId,
          {
            headers: this.#requestData.sessionHeader,
            params: {
              type: 'upload',
              uploadId: latestPumpSettingsUploadId,
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

    this.#log.debug(`Downloading data for User ${this.#userDetail.userId}...`);

    this.#log.debug('add data to dataUtil');
    const data = this.#dataUtil.addData(
      userData,
      this.#userDetail.userId,
      false,
    );

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
