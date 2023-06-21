import _ from 'lodash';
import axios from 'axios';
import queryString from 'query-string';
import { DataUtil } from '@tidepool/viz/dist/data';
import { validateQueryParams } from './query';
import { buildHeaders, createCounter, exportTimeout } from './utils';
import logMaker from './log';

const reportStatusCount = createCounter(
  'tidepool_export_report_status_count',
  'The number of errors for each status code.',
  ['status_code', 'report_params'],
);

const dataUtil = new DataUtil();

const log = logMaker('userReportHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

export default function userReportHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    if (!req.body) {
      reportStatusCount.inc({ status_code: 400, report_params: {} });
      res.status(400).send('missing required request body');
    }

    const missing = validateQueryParams(req.body);

    if (!_.isEmpty(missing)) {
      log.warn('missing [%j]', missing);
      reportStatusCount.inc({ status_code: 400, report_params: req.body });
      res.status(400).send(JSON.stringify(missing));
    }

    //
    try {
      const userId = req.params.userid;
      const queryData = [];
      if (req.query.restricted_token) {
        queryData.restricted_token = req.query.restricted_token;
      }
      queryData.startDate = req.body.dateRange.startDate;
      queryData.endDate = req.body.dateRange.endDate;
      const cancelRequest = axios.CancelToken.source();
      const requestConfig = buildHeaders(req);
      requestConfig.responseType = 'stream';
      requestConfig.cancelToken = cancelRequest.token;

      const dataResponse = await axios.get(
        `${process.env.API_HOST}/data/${userId}?${queryString.stringify(
          queryData,
        )}`,
        requestConfig,
      );
      log.debug(`Downloading data for User ${req.params.userid}...`);

      // const { reports } = req.body;
      dataUtil.addData(dataResponse.data, userId);

      // Create a timeout timer that will let us cancel the incoming request gracefully if
      // it's taking too long to fulfil.
      const timer = setTimeout(() => {
        res.emit('timeout', exportTimeout);
      }, exportTimeout);

      // Wait for the stream to complete, by wrapping the stream completion events in a Promise.
      try {
        await new Promise((resolve, reject) => {
          dataResponse.data.on('end', resolve);
          dataResponse.data.on('error', (err) => reject(err));
          res.on('error', (err) => reject(err));
          res.on('timeout', async () => {
            reportStatusCount.inc({
              status_code: 408,
              report_params: req.body,
            });
            reject(
              new Error(
                'Data export report request took too long to complete. Cancelling the request.',
              ),
            );
          });
        });
        reportStatusCount.inc({ status_code: 200, report_params: req.body });
        log.debug(`Finished downloading data for User ${req.params.userid}`);
      } catch (e) {
        log.error(`Error while downloading: ${e}`);
        // Cancel the writeStream, rather than let it close normally.
        // We do this to show error messages in the downloaded files.
        cancelRequest.cancel('Data export report timed out.');
      }

      clearTimeout(timer);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        reportStatusCount.inc({ status_code: 403, report_params: req.body });
        res.status(403).send('Not authorized to export report for this user.');
        log.error(`403: ${error}`);
      } else {
        reportStatusCount.inc({ status_code: 500, report_params: req.body });
        res
          .status(500)
          .send(
            'Server error while processing data. Please contact Tidepool Support.',
          );
        log.error(`500: ${error}`);
      }
    }
    //
    reportStatusCount.inc({ status_code: 501, report_params: req.body });
    res.status(501).send('not yet implemented');
  };
}
