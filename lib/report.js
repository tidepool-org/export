const { generateAGPSVGDataURLS } = require('@tidepool/viz/dist/genAGPURL');
const { DataUtil } = require('@tidepool/viz/dist/data');
// eslint-disable-next-line import/newline-after-import
const { Blob } = require('buffer');
global.Blob = Blob; // needs to be defined prior to requiring blob-stream
const axios = require('axios');
const _ = require('lodash');
const moment = require('moment-timezone');
const blobStream = require('blob-stream');
const {
  createPrintPDFPackage,
  utils: PrintPDFUtils,
} = require('@tidepool/viz/dist/print');
const PDFKit = require('pdfkit');
const {
  fetchUserData,
  getServerTime,
  mgdLUnits,
  mmolLUnits,
} = require('./utils');

PrintPDFUtils.PDFDocument = PDFKit;
PrintPDFUtils.blobStream = blobStream;

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
    agp: 'agp',
    daily: 'daily',
    settings: 'settings',
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

  buildReportQueries() {
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
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources',
        timePrefs: this.getTimePrefs(),
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
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources',
        timePrefs: this.getTimePrefs(),
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
        bgPrefs: this.getBGPrefs(),
        metaData: 'latestPumpUpload, bgSources',
        timePrefs: this.getTimePrefs(),
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
    if (!this.#reports.includes(this.#reportTypes.agp)) {
      delete dataQueries.agp;
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
  userDataQueryOptions(params) {
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
      const daysDiff = end.diff(start, 'days');
      if (daysDiff < 30) {
        start = start.subtract(30 - daysDiff, 'days');
      }
      options.startDate = start.toISOString();
      options.endDate = end.toISOString();
    } else {
      // We then determine the date range to fetch data for by first finding the latest
      // diabetes datum time and going back 30 days
      const diabetesDatums = _.reject(data, (d) => _.includes(['food', 'upload', 'pumpSettings'], d.type));
      const latestDiabetesDatumTime = _.max(
        _.map(diabetesDatums, (d) => d.time),
      );
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
    }

    if (restrictedToken) {
      options.restricted_token = restrictedToken;
    }

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
    return options;
  }

  getDateRangeByReport(params) {
    const {
      data,
      days = {
        agp: 14,
        basics: 14,
        daily: 14,
        bgLog: 30,
      },
    } = params;

    if (this.#reportDates) {
      const endDate = moment(this.#reportDates.endDate)
        .tz(this.#timezoneName)
        .endOf('day')
        .subtract(1, 'ms');
      const startDate = moment(this.#reportDates.startDate)
        .tz(this.#timezoneName)
        .startOf('day');
      let bgLogStartDate = moment(this.#reportDates.startDate)
        .tz(this.#timezoneName)
        .startOf('day');

      const daysDiff = endDate.diff(bgLogStartDate, 'days');
      if (daysDiff < 30) {
        bgLogStartDate = bgLogStartDate.subtract(30 - daysDiff, 'days');
      }

      return {
        agp: {
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
      agp: {},
      daily: {},
      basics: {},
      bgLog: {},
    };

    const getLatestDatums = (types) => _.pick(_.get(data, 'metaData.latestDatumByType'), types);
    const getMaxDate = (datums) => _.max(_.map(datums, (d) => d.normalEnd || d.normalTime));
    const endOfToday = () => moment.utc().tz(this.#timezoneName).endOf('day').subtract(1, 'ms');

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

    dates.agp.endDate = lastAGPDate ? moment.utc(lastAGPDate) : endOfToday();

    dates.agp.startDate = moment
      .utc(dates.agp.endDate)
      .tz(this.#timezoneName)
      .subtract(days.agp - 1, 'days');

    dates.daily.endDate = lastDailyDate
      ? moment.utc(lastDailyDate)
      : endOfToday();
    dates.daily.startDate = moment
      .utc(dates.daily.endDate)
      .tz(this.#timezoneName)
      .subtract(days.daily - 1, 'days');

    dates.basics.endDate = lastBasicsDate
      ? moment.utc(lastBasicsDate)
      : endOfToday();
    dates.basics.startDate = moment
      .utc(dates.basics.endDate)
      .tz(this.#timezoneName)
      .subtract(days.basics - 1, 'days');

    dates.bgLog.endDate = lastBGLogDate
      ? moment.utc(lastBGLogDate)
      : endOfToday();
    dates.bgLog.startDate = moment
      .utc(dates.bgLog.endDate)
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

    const reportQueries = this.buildReportQueries();

    const printOptions = {
      agp: {
        endpoints: [
          datesByReport.agp.startDate.toDate(),
          datesByReport.agp.endDate.toDate(),
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
    if (this.#reports.includes(this.#reportTypes.all, this.#reportTypes.agp)) {
      reportQueries.agp.endpoints = printOptions.agp.endpoints;
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
      pdfData.agp = this.#dataUtil.query(queries.agp);
      options.agp.disabled = !containsDataForReport(
        pdfData,
        'agp.data.current.data',
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
      options.settings.disabled = !_.get(
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

  async processAGPSVGs(agpPDFData) {
    this.agpSVGFigures = await generateAGPSVGDataURLS({
      ...agpPDFData,
    });
    this.agpFigurePromises = _.map(this.agpSVGFigures, async (image, key) => {
      if (_.isArray(image)) {
        const processedArray = await Promise.all(
          _.map(image, async (img) => this.graphRendererOrca(img)),
        );
        return [key, processedArray];
      }
      const processedValue = await this.graphRendererOrca(image);
      return [key, processedValue];
    });
    const processedEntries = await Promise.all(this.agpFigurePromises);
    return _.fromPairs(processedEntries);
  }

  async generate() {
    if (this.#reportDates) {
      this.userDataQueryParams = this.userDataQueryOptions();
    } else {
      const serverTime = await getServerTime();
      this.#log.debug('get server time ', serverTime);

      const latestDatums = await fetchUserData(
        this.#userDetail.userId,
        {
          type: this.#reportDataTypes.join(','),
          latest: 1,
          endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
        },
        this.#requestData.sessionHeader,
      );

      this.userDataQueryParams = this.userDataQueryOptions({
        data: latestDatums,
        serverTime,
        restrictedToken: this.#requestData.token,
      });
    }

    this.#log.debug('data query options ', this.userDataQueryParams);
    this.#log.debug('user timePrefs ', this.getTimePrefs());

    const requestConfig = { headers: this.#requestData.sessionHeader };

    const userData = await fetchUserData(
      this.#userDetail.userId,
      { ...this.userDataQueryParams },
      requestConfig.headers,
    );

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
    if (!reportData.options.agp.disabled) {
      reportData.options.svgDataURLS = await this.processAGPSVGs(
        reportData.pdfData.agp,
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

module.exports = {
  Report,
};