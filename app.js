/* eslint no-restricted-syntax: [0, "ForInStatement"] */

import _ from 'lodash';
import fs from 'fs';
import http from 'http';
import https from 'https';
import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import queryString from 'query-string';
import dataTools from '@tidepool/data-tools';
import { Registry, Counter } from 'prom-client';
import logMaker from './log';

const log = logMaker('app.js', { level: process.env.DEBUG_LEVEL || 'info' });

const { createTerminus } = require('@godaddy/terminus');

const client = require('prom-client');

const { collectDefaultMetrics } = client;
const register = new Registry();

collectDefaultMetrics({ register });

const createCounter = (name, help, labelNames) => new Counter({
  name, help, labelNames, registers: [register],
});

const statusCount = createCounter('tidepool_export_failed_status_count', 'The number of errors for each status code.', ['status_code']);

function maybeReplaceWithContentsOfFile(obj, field) {
  const potentialFile = obj[field];
  if (potentialFile != null && fs.existsSync(potentialFile)) {
    // eslint-disable-next-line no-param-reassign
    obj[field] = fs.readFileSync(potentialFile).toString();
  }
}

const config = {};
config.httpPort = process.env.HTTP_PORT;
config.httpsPort = process.env.HTTPS_PORT;
if (process.env.HTTPS_CONFIG) {
  config.httpsConfig = JSON.parse(process.env.HTTPS_CONFIG);
  maybeReplaceWithContentsOfFile(config.httpsConfig, 'key');
  maybeReplaceWithContentsOfFile(config.httpsConfig, 'cert');
} else {
  config.httpsConfig = {};
}
if (!config.httpPort) {
  config.httpPort = 9300;
}
config.exportTimeout = _.defaultTo(parseInt(process.env.EXPORT_TIMEOUT, 10), 120000);
log.info(`Export download timeout set to ${config.exportTimeout} ms`);

const app = express();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

function buildHeaders(request) {
  if (request.headers['x-tidepool-session-token']) {
    return {
      headers: {
        'x-tidepool-session-token': request.headers['x-tidepool-session-token'],
      },
    };
  }
  return {};
}

app.use(bodyParser.urlencoded({
  extended: false,
}));

app.get('/export/:userid', async (req, res) => {
  // Set the timeout for the request. Make it 10 seconds longer than
  // our configured timeout to give the service time to cancel the API data
  // request, and close the outgoing data stream cleanly.
  req.setTimeout(config.exportTimeout + 10000);

  const queryData = [];

  let logString = `Requesting download for User ${req.params.userid}`;
  if (req.query.bgUnits) {
    logString += ` in ${req.query.bgUnits}`;
  }
  if (req.query.startDate) {
    queryData.startDate = req.query.startDate;
    logString += ` from ${req.query.startDate}`;
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

  try {
    const cancelRequest = axios.CancelToken.source();

    const requestConfig = buildHeaders(req);
    requestConfig.responseType = 'stream';
    requestConfig.cancelToken = cancelRequest.token;
    const dataResponse = await axios.get(`${process.env.API_HOST}/data/${req.params.userid}?${queryString.stringify(queryData)}`, requestConfig);
    log.debug(`Downloading data for User ${req.params.userid}...`);

    const processorConfig = { bgUnits: req.query.bgUnits || 'mmol/L' };

    let writeStream = null;

    if (req.query.format === 'json') {
      res.attachment('TidepoolExport.json');
      writeStream = dataTools.jsonStreamWriter();

      dataResponse.data
        .pipe(dataTools.jsonParser())
        .pipe(dataTools.splitPumpSettingsData())
        .pipe(dataTools.tidepoolProcessor(processorConfig))
        .pipe(writeStream)
        .pipe(res);
    } else {
      res.attachment('TidepoolExport.xlsx');
      writeStream = dataTools.xlsxStreamWriter(res, processorConfig);

      dataResponse.data
        .pipe(dataTools.jsonParser())
        .pipe(dataTools.splitPumpSettingsData())
        .pipe(dataTools.tidepoolProcessor(processorConfig))
        .pipe(writeStream);
    }

    // Create a timeout timer that will let us cancel the incoming request gracefully if
    // it's taking too long to fulfil.
    const timer = setTimeout(() => {
      res.emit('timeout', config.exportTimeout);
    }, config.exportTimeout);

    // Wait for the stream to complete, by wrapping the stream completion events in a Promise.
    try {
      await new Promise((resolve, reject) => {
        dataResponse.data.on('end', resolve);
        dataResponse.data.on('error', (err) => reject(err));
        res.on('error', (err) => reject(err));
        res.on('timeout', async () => {
          statusCount.inc({ status_code: 408 });
          reject(new Error('Data export request took too long to complete. Cancelling the request.'));
        });
      });
      statusCount.inc({ status_code: 200 });
      log.debug(`Finished downloading data for User ${req.params.userid}`);
    } catch (e) {
      log.error(`Error while downloading: ${e}`);
      // Cancel the writeStream, rather than let it close normally.
      // We do this to show error messages in the downloaded files.
      writeStream.cancel();
      cancelRequest.cancel('Data export timed out.');
    }

    clearTimeout(timer);
  } catch (error) {
    if (error.response && error.response.status === 403) {
      res.status(error.response.status).send('Not authorized to export data for this user.');
      statusCount.inc({ status_code: 403 });
      log.error(`${error.response.status}: ${error}`);
    } else {
      res.status(500).send('Server error while processing data. Please contact Tidepool Support.');
      statusCount.inc({ status_code: 500 });
      log.error(`500: ${error}`);
    }
  }
});


function beforeShutdown() {
  return new Promise((resolve) => {
    // Ensure that the export request can time out
    // without being forcefully killed
    setTimeout(resolve, config.exportTimeout + 10000);
  });
}

function healthCheck() {
  return Promise.resolve();
}

const options = {
  healthChecks: {
    '/export/status': healthCheck,
  },
  beforeShutdown,
};

if (config.httpPort) {
  const server = http.createServer(app);
  createTerminus(server, options);
  server.listen(config.httpPort, () => {
    log.info(`Listening for HTTP on ${config.httpPort}`);
  });
}

if (config.httpsPort) {
  if (_.isEmpty(config.httpsConfig)) {
    log.error('SSL endpoint is enabled, but no valid config was found. Exiting.');
    process.exit(1);
  } else {
    const server = https.createServer(config.httpsConfig, app);
    createTerminus(server, options);
    server.listen(config.httpsPort, () => {
      log.info(`Listening for HTTPS on ${config.httpsPort}`);
    });
  }
}
