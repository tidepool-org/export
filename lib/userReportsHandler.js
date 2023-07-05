import axios from 'axios';
import moment from 'moment-timezone';
import { DataUtil } from '@tidepool/viz/dist/data';
import { Blob } from 'buffer';
import PDFKit from './pdfkit';
import {
  getHeaders,
  createCounter,
  exportTimeout,
  fetchUserData,
  getServerTime,
  logMaker,
} from './utils';
import {
  getQueryOptions,
  reportDataTypes,
  getReportOptions,
  processAGPSVGs,
  sendPDFReport,
  setTimePrefs,
} from './reportUtils';

global.Blob = Blob;

// These need to be 'require'd in order to have the global Blob available when parsed
const blobStream = require('blob-stream');

const {
  createPrintPDFPackage,
  utils: PrintPDFUtils,
} = require('@tidepool/viz/dist/print.js');

PrintPDFUtils.PDFDocument = PDFKit;
PrintPDFUtils.blobStream = blobStream;

const reportStatusCount = createCounter(
  'tidepool_export_report_status_count',
  'The number of errors for each status code.',
  ['status_code', 'report_params'],
);

const dataUtil = new DataUtil();

const log = logMaker('userReportHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

export default function userReportsHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    const serverTime = await getServerTime();
    log.debug('get server time ', serverTime);
    const userId = req.params.userid;
    const {
      bgUnits,
      tzName,
      restricted_token: restrictedToken,
      reports,
    } = req.query;

    const headers = getHeaders(req);

    log.debug('fetch latest datums');
    const latestDatums = await fetchUserData(
      userId,
      {
        type: reportDataTypes.join(','),
        latest: 1,
        endDate: moment.utc(serverTime).add(1, 'days').toISOString(),
      },
      headers,
    );

    const queryOptions = getQueryOptions(
      latestDatums,
      bgUnits,
      serverTime,
      restrictedToken,
    );
    log.debug('data query options ', queryOptions);
    const timePrefs = setTimePrefs(tzName, latestDatums);
    log.debug('user timePrefs ', timePrefs);

    try {
      const timer = setTimeout(() => {
        res.emit('timeout', exportTimeout);
      }, exportTimeout);

      const cancelRequest = axios.CancelToken.source();
      const requestConfig = headers;
      requestConfig.cancelToken = cancelRequest.token;
      requestConfig.params = queryOptions;

      const userData = await fetchUserData(userId, requestConfig);
      log.debug(`Downloading data for User ${userId}...`);

      log.debug('add data to dataUtil');
      const data = dataUtil.addData(userData, userId, false);
      log.debug('getting report options');
      const reportOptions = getReportOptions(
        data,
        bgUnits,
        reports,
        timePrefs,
        userId,
        {},
      );

      const pdfData = {};

      if (reportOptions.queries.agp) {
        log.debug('setting dataUtil agp query');
        pdfData.agp = dataUtil.query(reportOptions.queries.agp);
        log.time('processing agp svgs');
        reportOptions.opts.svgDataURLS = await processAGPSVGs(pdfData.agp);
        log.timeEnd('processing agp svgs');
      }

      log.time('generate PDF package');
      const pdf = await createPrintPDFPackage(
        pdfData,
        reportOptions.opts,
      ).catch((error) => log.error(error));
      // TODO: remove debug
      log.timeEnd('generate PDF package');
      // TODO: remove debug
      log.debug('success', pdf);
      await sendPDFReport(res, pdf);

      clearTimeout(timer);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        reportStatusCount.inc({ status_code: 403, report_params: req.query });
        res.status(403);
        log.error(`403: ${error}`);
      } else {
        reportStatusCount.inc({ status_code: 500, report_params: req.query });
        res.status(500);
        log.error(`500: ${error}`);
      }
    }
  };
}
