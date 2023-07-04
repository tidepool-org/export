/* eslint-disable camelcase */
import fs from 'fs';
import _ from 'lodash';
import axios from 'axios';
import queryString from 'query-string';
import moment from 'moment-timezone';
import { DataUtil } from '@tidepool/viz/dist/data';
import zipToTz from 'zip-to-tz';
import { Blob } from 'buffer';

import { generateAGPSVGDataURLS } from '@tidepool/viz/dist/genAGPURL';
import PDFKit from './pdfkit';
import { getBGPrefsForUnits, validateQueryParams } from './query';
import {
  buildHeaders, createCounter, exportTimeout, logMaker,
} from './utils';

global.Blob = Blob;

// These need to be 'require'd in order to have the global Blob available when parsed
const blobStream = require('blob-stream');

const {
  createPrintPDFPackage,
  utils: PrintPDFUtils,
} = require('@tidepool/viz/dist/print.js');

PrintPDFUtils.PDFDocument = PDFKit;
PrintPDFUtils.blobStream = blobStream;

/**
 * Utility function to check to see if we have any aggregated basics data available
 * @param  {aggregationsByDate} Object - aggregationsByDate data from the data worker
 * @returns {Boolean}
 */
export const isMissingBasicsData = (aggregationsByDate = {}) => {
  const {
    basals = {},
    boluses = {},
    fingersticks = {},
    siteChanges = {},
  } = aggregationsByDate;

  const {
    calibration = {},
    smbg = {},
  } = fingersticks;

  const basicsData = [basals, boluses, siteChanges, calibration, smbg];
  return !_.some(basicsData, (d) => _.keys(d.byDate).length > 0);
};

// Plotly orca implementation
const graphRendererOrca = async (data, config) => {
  const svgRequest = await axios.post(process.env.PLOTLY_ORCA, {
    figure: data,
    ...config,
  });
  return svgRequest.data;
};

const reportStatusCount = createCounter(
  'tidepool_export_report_status_count',
  'The number of errors for each status code.',
  ['status_code', 'report_params'],
);

const dataUtil = new DataUtil();

const log = logMaker('userReportHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

const getMostRecentDatumTimeByChartType = (data, chartType) => {
  let latestDatums;
  const getLatestDatums = (types) => _.pick(_.get(data, 'metaData.latestDatumByType'), types);

  switch (chartType) {
    case 'basics':
      latestDatums = getLatestDatums([
        'basal',
        'bolus',
        'cbg',
        'deviceEvent',
        'smbg',
        'wizard',
      ]);
      break;

    case 'daily':
      latestDatums = getLatestDatums([
        'basal',
        'bolus',
        'cbg',
        'deviceEvent',
        'food',
        'message',
        'smbg',
        'wizard',
      ]);
      break;

    case 'bgLog':
      latestDatums = getLatestDatums(['smbg']);
      break;

    case 'agp':
      latestDatums = getLatestDatums(['cbg']);
      break;

    case 'trends':
      latestDatums = getLatestDatums(['cbg', 'smbg']);
      break;

    default:
      latestDatums = [];
      break;
  }

  return _.max(_.map(latestDatums, (d) => d.normalEnd || d.normalTime));
};

const presetDaysOptions = {
  agp: [7, 14],
  basics: [14, 21, 30, 90],
  bgLog: [14, 21, 30, 90],
  daily: [14, 21, 30, 90],
};

const rangePresets = {
  agp: 1,
  basics: 0,
  bgLog: 2,
  daily: 0,
};

const BG_DATA_TYPES = ['cbg', 'smbg'];

const DIABETES_DATA_TYPES = [
  ...BG_DATA_TYPES,
  'basal',
  'bolus',
  'wizard',
  'food',
];

const datumTypesToFetch = [...DIABETES_DATA_TYPES, 'pumpSettings', 'upload'];

const setDateRangeToExtents = ({ startDate, endDate }, timePrefs) => {
  console.log('setdaterangetoextents', timePrefs);
  return ({
    startDate: startDate
      ? moment.utc(startDate).tz(timePrefs.timezoneName).startOf('day')
      : null,
    endDate: endDate
      ? moment
        .utc(endDate)
        .tz(timePrefs.timezoneName)
        .endOf('day')
        .subtract(1, 'ms')
      : null,
  });
};

const endOfToday = (timePrefs) => {
  console.log('endoftoday', timePrefs);
  return moment.utc().tz(timePrefs.timezoneName).endOf('day').subtract(1, 'ms');
};

const getLastNDays = (days, chartType, mostRecentDatumDates, timePrefs) => {
  console.log('getlastndays', timePrefs);
  const endDate = _.get(mostRecentDatumDates, chartType)
    ? moment.utc(mostRecentDatumDates[chartType])
    : endOfToday(timePrefs);

  return setDateRangeToExtents({
    startDate: moment
      .utc(endDate)
      .tz(timePrefs.timezoneName)
      .subtract(days - 1, 'days'),
    endDate,
  }, timePrefs);
};

const timePrefs = {
  timezoneAware: true,
  timezoneName: 'UTC',
};

// bgUnits pulled in from the clinic profile
const bgUnits = 'mg/dL';
const bgPrefs = bgUnits === 'mmol/L'
  ? {
    bgUnits: 'mmol/L',
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
  }
  : {
    bgUnits: 'mg/dL',
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

export default function userReportHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    // if (!req.body) {
    //   reportStatusCount.inc({ status_code: 400, report_params: {} });
    //   res.status(400).send('missing required request body');
    // }

    // Going to try and provide reasonable defaults for all the params
    // const missing = validateQueryParams(req.body);

    // if (!_.isEmpty(missing)) {
    //   log.warn('missing [%j]', missing);
    //   reportStatusCount.inc({ status_code: 400, report_params: req.body });
    //   res.status(400).send(JSON.stringify(missing));
    // }

    // get server time
    const serverTimeRepsonse = await axios.get(
      `${process.env.API_HOST}/v1/time`,
    );

    const serverTime = serverTimeRepsonse.data.data.time;

    // get latest datums for user

    const latestDatumsFetchParams = {
      type: datumTypesToFetch.join(','),
      latest: 1,
      endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
    };

    const patientId = req.params.userid;

    console.log('latest datums');
    const latestDatumsFetchResult = await axios
      .get(`${process.env.API_HOST}/data/${patientId}`, {
        params: latestDatumsFetchParams,
        headers: {
          'x-tidepool-session-token': req.headers['x-tidepool-session-token'],
        },
      })
      .catch((err) => console.log(err));

    const latestDatums = latestDatumsFetchResult.data;

    const options = { initial: true };

    // We then determine the date range to fetch data for by first finding the latest
    // diabetes datum time and going back 30 days
    const diabetesDatums = _.reject(latestDatums, (d) => _.includes(['food', 'upload', 'pumpSettings'], d.type));
    const latestDiabetesDatumTime = _.max(_.map(diabetesDatums, (d) => d.time));
    const latestDatumTime = _.max(_.map(latestDatums, (d) => d.time));

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

    // We want to make sure the latest upload, which may be beyond the data range we'll be
    // fetching, is stored so we can include it with the fetched results
    const latestUpload = _.find(latestDatums, { type: 'upload' });
    if (!_.isEmpty(latestUpload.timezone)) {
      timePrefs.timezoneName = latestUpload.timezone;
    }

    const latestPumpSettings = _.find(latestDatums, {
      type: 'pumpSettings',
    });
    const latestPumpSettingsUploadId = _.get(
      latestPumpSettings || {},
      'uploadId',
    );
    const latestPumpSettingsUpload = _.find(latestDatums, {
      type: 'upload',
      uploadId: latestPumpSettingsUploadId,
    });

    if (latestPumpSettingsUploadId && !latestPumpSettingsUpload) {
      // If we have pump settings, but we don't have the corresponing upload record used
      // to get the device source, we need to fetch it
      options.getPumpSettingsUploadRecordById = latestPumpSettingsUploadId;
    }

    if (req.query.clinicId) {
      const fetchClinic = await axios.get(
        `${process.env.API_HOST}/v1/clinics/${req.query.clinicId}`,
      );
      const clinic = fetchClinic.data;
      const clinicZip = clinic.country === 'USA' && clinic.postalCode;
      if (clinicZip) {
        timePrefs.timeZoneName = zipToTz(clinicZip);
      }

      options.bgPrefs = getBGPrefsForUnits(clinic.preferredBgUnits);
    }

    //
    try {
      const userId = req.params.userid;
      const queryData = [];
      const { restricted_token } = req.query;
      if (restricted_token) {
        queryData.restricted_token = restricted_token;
        options.restricted_token = restricted_token;
      }
      // TODO: date ranged data.
      // - for initial implmentation there will be on range for all reports ??
      // - will the date range to a fixed period? i.e. 2 weeks
      if (req.query.dateRange && req.query.dateRange.startDate) {
        options.startDate = req.query.dateRange.startDate;
        queryData.startDate = req.query.dateRange.startDate;
      }
      if (req.query.dateRange && req.query.dateRange.endDate) {
        options.endDate = req.query.dateRange.endDate;
        queryData.endDate = req.query.dateRange.endDate;
      }

      // TODO: if clinicId fetch clinic for bgPrefs, timePrefs, postalCode for TZ lookup

      const cancelRequest = axios.CancelToken.source();
      const requestConfig = buildHeaders(req);
      requestConfig.cancelToken = cancelRequest.token;
      requestConfig.params = options;

      const dataResponse = await axios.get(
        `${process.env.API_HOST}/data/${userId}`,
        requestConfig,
      );
      log.debug(`Downloading data for User ${req.params.userid}...`);

      // add returned user data
      console.log('add data');
      const data = dataUtil.addData(dataResponse.data, userId, false);

      const profileFetch = await axios.get(
        `${process.env.API_HOST}/metadata/${patientId}/profile`,
        requestConfig,
      );

      // TODO: generate the reports that have been requested
      //  - for integration it will be `all` reports??
      // const { reports } = req.body;

      // Create a timeout timer that will let us cancel the incoming request gracefully if
      // it's taking too long to fulfil.
      const timer = setTimeout(() => {
        res.emit('timeout', exportTimeout);
      }, exportTimeout);

      // Wait for the stream to complete, by wrapping the stream completion events in a Promise.
      try {
        // await new Promise((resolve, reject) => {
        //   dataResponse.data.on('end', resolve);
        //   dataResponse.data.on('error', (err) => reject(err));
        //   res.on('error', (err) => reject(err));
        //   res.on('timeout', async () => {
        //     reportStatusCount.inc({
        //       status_code: 408,
        //       report_params: req.query,
        //     });
        //     reject(
        //       new Error(
        //         'Data export report request took too long to complete. Cancelling the request.',
        //       ),
        //     );
        //   });
        // });
        reportStatusCount.inc({ status_code: 200, report_params: req.query });
        log.debug(`Finished downloading data for User ${req.params.userid}`);
      } catch (e) {
        log.error(`Error while downloading: ${e}`);
        // Cancel the writeStream, rather than let it close normally.
        // We do this to show error messages in the downloaded files.
        cancelRequest.cancel('Data export report timed out.');
      }

      console.log('mostrecentdatumdates');
      const mostRecentDatumDates = {
        agp: getMostRecentDatumTimeByChartType(data, 'agp'),
        basics: getMostRecentDatumTimeByChartType(data, 'basics'),
        bgLog: getMostRecentDatumTimeByChartType(data, 'bgLog'),
        daily: getMostRecentDatumTimeByChartType(data, 'daily'),
      };

      console.log('default dates', timePrefs);
      const defaultDates = {
        agp: getLastNDays(
          presetDaysOptions.agp[rangePresets.agp],
          'agp',
          mostRecentDatumDates,
          timePrefs,
        ),
        basics: getLastNDays(
          presetDaysOptions.basics[rangePresets.basics],
          'basics',
          mostRecentDatumDates,
          timePrefs,
        ),
        bgLog: getLastNDays(
          presetDaysOptions.bgLog[rangePresets.bgLog],
          'bgLog',
          mostRecentDatumDates,
          timePrefs,
        ),
        daily: getLastNDays(
          presetDaysOptions.daily[rangePresets.daily],
          'daily',
          mostRecentDatumDates,
          timePrefs,
        ),
      };

      console.log('pdfdataqueries');
      const PDFDataQueries = {
        basics: {
          endpoints: [null, null],
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
          bgPrefs,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs,
          excludedDevices: [],
        },
        bgLog: {
          endpoints: [null, null],
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
          bgPrefs,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs,
          excludedDevices: [],
        },
        daily: {
          endpoints: [null, null],
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
          bgPrefs,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs,
          excludedDevices: [],
        },
        agp: {
          endpoints: [null, null],
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
          bgPrefs,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs,
          excludedDevices: [],
        },
        settings: {
          bgPrefs,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs,
          excludedDevices: [],
        },
      };

      console.log('opts');
      const opts = {
        agp: {
          endpoints: [null, null],
          disabled: false,
        },
        basics: {
          endpoints: [null, null],
          disabled: false,
        },
        bgLog: {
          endpoints: [null, null],
          disabled: false,
        },
        daily: {
          endpoints: [null, null],
          disabled: false,
        },
        settings: {
          disabled: false,
        },
        patient: {
          permissions: {},
          userid: patientId,
          profile: profileFetch.data,
          settings: {},
        },
      };

      console.log('setdefaultdates');
      _.each(defaultDates, (dates, type) => {
        PDFDataQueries[type].endpoints = [
          dates.startDate.toDate(),
          dates.endDate.toDate(),
        ];
        opts[type].endpoints = [dates.startDate.toDate(), dates.endDate.toDate()];
      });

      const pdfData = {};

      if (PDFDataQueries.agp) {
        console.log('agp query');
        pdfData.agp = dataUtil.query(PDFDataQueries.agp);
        opts.agp.disabled = !_.flatten(_.valuesIn(_.get(pdfData, 'agp.data.current.data', {})))
          .length > 0;

        console.log('agpfigures');
        const agpSVGFigures = await generateAGPSVGDataURLS({
          ...pdfData.agp,
        }).catch((error) => console.log('error', error));

        console.time('gen SVGs');
        const promises = _.map(agpSVGFigures, async (image, key) => {
          if (_.isArray(image)) {
            const processedArray = await Promise.all(
              _.map(image, async (img) => await graphRendererOrca(img, { format: 'svg' })),
            );
            return [key, processedArray];
          }
          const processedValue = await graphRendererOrca(image, {
            format: 'svg',
          });
          return [key, processedValue];
        });
        const processedEntries = await Promise.all(promises);
        const processedObj = _.fromPairs(processedEntries);
        opts.svgDataURLS = processedObj;
        console.timeEnd('gen SVGs');

        _.each(PDFDataQueries, (query, key) => {
          if (!pdfData[key]) pdfData[key] = dataUtil.query(query);

          switch (key) {
            case 'basics':
              opts[key].disabled = isMissingBasicsData(
                _.get(pdfData, 'basics.data.current.aggregationsByDate'),
              );
              break;

            case 'daily':
              opts[key].disabled = !_.flatten(
                _.valuesIn(_.get(pdfData, 'daily.data.current.data', {})),
              ).length > 0;
              break;

            case 'bgLog':
              opts[key].disabled = !_.flatten(
                _.valuesIn(_.get(pdfData, 'bgLog.data.current.data', {})),
              ).length > 0;
              break;

            case 'agp':
              opts[key].disabled = !_.flatten(
                _.valuesIn(_.get(pdfData, 'agp.data.current.data', {})),
              ).length > 0;
              break;

            case 'settings':
              opts[key].disabled = !_.get(
                pdfData,
                'settings.metaData.latestPumpUpload.settings',
              );
              break;

            default:
              break;
          }
        });

        console.time('generate PDF package');
        const pdf = await createPrintPDFPackage(pdfData, opts).catch((error) => console.log(error));
        console.timeEnd('generate PDF package');

        console.log('success', pdf);
        res.setHeader('Content-Disposition', 'attachment: filename="report.pdf"');
        res.setHeader('Content-Type', 'application/octet-stream');
        const blobArrayBuffer = await pdf.blob.arrayBuffer();
        const pdfBuffer = Buffer.from(blobArrayBuffer);
        fs.writeFileSync('test.pdf', pdfBuffer);
        res.send(pdfBuffer);
        // await closePuppeteerInstance(browser);
      }

      clearTimeout(timer);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        reportStatusCount.inc({ status_code: 403, report_params: req.query });
        res.status(403);// .send('Not authorized to export report for this user.');
        log.error(`403: ${error}`);
      } else {
        reportStatusCount.inc({ status_code: 500, report_params: req.query });
        res
          .status(500);
        // .send(
        //   'Server error while processing data. Please contact Tidepool Support.',
        // );
        log.error(`500: ${error}`);
      }
    }
    //
    // reportStatusCount.inc({ status_code: 501, report_params: req.query });
    // res.status(501).send('not yet implemented');
  };
}
