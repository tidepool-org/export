import axios from 'axios';
import dataTools from '@tidepool/data-tools';
import fs from 'node:fs';
import {
  getSessionHeader, createCounter, exportTimeout, logMaker, mmolLUnits,
} from '../utils.mjs';

const dataStatusCount = createCounter(
  'tidepool_export_status_count',
  'The number of errors for each status code.',
  ['status_code', 'export_format'],
);

const log = logMaker('userDataHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

const dosingDecisionReasons = [
  'normalBolus',
  'simpleBolus',
  'watchBolus',
  'oneButtonBolus',
];

export default function userDataHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    const queryData = {
      'dosingDecision.reason': dosingDecisionReasons.join(',')
    };

    let logString = `Requesting download for User ${req.params.userid}`;
    if (req.query.bgUnits) {
      logString += ` in ${req.query.bgUnits}`;
    }
    if (req.query.startDate) {
      queryData.startDate = req.query.startDate;
      logString += ` = require(${req.query.startDate}`;
    }
    if (req.query.endDate) {
      queryData.endDate = req.query.endDate;
      logString += ` until ${req.query.endDate}`;
    }
    if (req.query.restricted_token) {
      queryData.restricted_token = req.query.restricted_token;
      logString += ' with restricted_token';
    }
    log.info(logString);

    const exportFormat = req.query.format;

    try {
      const controller = new AbortController();
      const requestConfig = {};
      requestConfig.headers = getSessionHeader(req);
      requestConfig.responseType = 'stream';
      requestConfig.signal = controller.signal;
      requestConfig.params = queryData;

      const dataResponse = await axios.get(
        `${process.env.API_HOST}/data/${req.params.userid}`,
        requestConfig,
      );

      log.debug(`Downloading data for User ${req.params.userid}...`);

      const processorConfig = { bgUnits: req.query.bgUnits || mmolLUnits };

      let writeStream = null;

      if (exportFormat === 'json') {
        res.attachment('TidepoolExport.json');
        writeStream = dataTools.jsonStreamWriter();

        if (process.env.DEBUG_PDF) {
          dataResponse.data
            .pipe(dataTools.jsonParser())
            .pipe(dataTools.splitPumpSettingsData())
            .pipe(dataTools.tidepoolProcessor(processorConfig))
            .pipe(writeStream)
            .pipe(fs.createWriteStream('test.json'));
        }

        dataResponse.data
          .pipe(dataTools.jsonParser())
          .pipe(dataTools.splitPumpSettingsData())
          .pipe(dataTools.tidepoolProcessor(processorConfig))
          .pipe(writeStream)
          .pipe(res);
      } else {
        res.attachment('TidepoolExport.xlsx');
        writeStream = dataTools.xlsxStreamWriter(res, processorConfig);

        if (process.env.DEBUG_PDF) {
          dataResponse.data
            .pipe(dataTools.jsonParser())
            .pipe(dataTools.splitPumpSettingsData())
            .pipe(dataTools.tidepoolProcessor(processorConfig))
            .pipe(dataTools.xlsxStreamWriter(fs.createWriteStream('test.xlsx'), processorConfig));
        }

        dataResponse.data
          .pipe(dataTools.jsonParser())
          .pipe(dataTools.splitPumpSettingsData())
          .pipe(dataTools.tidepoolProcessor(processorConfig))
          .pipe(writeStream);
      }

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
            dataStatusCount.inc({
              status_code: 408,
              export_format: exportFormat,
            });
            reject(
              new Error(
                'Data export request took too long to complete. Cancelling the request.',
              ),
            );
          });
        });
        dataStatusCount.inc({ status_code: 200, export_format: exportFormat });
        log.debug(`Finished downloading data for User ${req.params.userid}`);
      } catch (e) {
        log.error(`Error while downloading: ${e}`);
        // Cancel the writeStream, rather than let it close normally.
        // We do this to show error messages in the downloaded files.
        writeStream.cancel();
        controller.abort('Data export timed out.');
      }

      clearTimeout(timer);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        dataStatusCount.inc({ status_code: 403, export_format: exportFormat });
        res
          .status(error.response.status)
          .send('Not authorized to export data for this user.');
        log.error(`${error.response.status}: ${error}`);
      } else {
        dataStatusCount.inc({ status_code: 500, export_format: exportFormat });
        res
          .status(500)
          .send(
            'Server error while processing data. Please contact Tidepool Support.',
          );
        log.error(`500: ${error}`);
      }
    }
  };
}
