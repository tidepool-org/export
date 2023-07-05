/* eslint no-restricted-syntax: [0, "ForInStatement"] */

import _ from 'lodash';
import fs from 'fs';
import http from 'http';
import https from 'https';
import express from 'express';
import bodyParser from 'body-parser';

import userDataHandler from './lib/userDataHandler';
import userReportsHandler from './lib/userReportsHandler';
import { exportTimeout, register, logMaker } from './lib/utils';

export const log = logMaker('app.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

const { createTerminus } = require('@godaddy/terminus');

function maybeReplaceWithContentsOfFile(obj, field) {
  const potentialFile = obj[field];
  if (potentialFile != null && fs.existsSync(potentialFile)) {
    // eslint-disable-next-line no-param-reassign
    obj[field] = fs.readFileSync(potentialFile).toString();
  }
}

export const config = {};
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
config.exportTimeout = exportTimeout;
log.info(`Export download timeout set to ${config.exportTimeout} ms`);

const app = express();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

app.use(
  bodyParser.urlencoded({
    extended: false,
  }),
);

app.get('/export/:userid', userDataHandler());


app.get('/export/report/:userid', userReportsHandler());

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
    log.error(
      'SSL endpoint is enabled, but no valid config was found. Exiting.',
    );
    process.exit(1);
  } else {
    const server = https.createServer(config.httpsConfig, app);
    createTerminus(server, options);
    server.listen(config.httpsPort, () => {
      log.info(`Listening for HTTPS on ${config.httpsPort}`);
    });
  }
}
