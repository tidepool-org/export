#!/usr/bin/env node --harmony

/* eslint no-restricted-syntax: [0, "ForInStatement"] */

import _ from 'lodash';
import fs from 'fs';
import http from 'http';
import https from 'https';
import axios from 'axios';
import express from 'express';
import flash from 'express-flash';
import bodyParser from 'body-parser';
import session from 'express-session';
import queryString from 'query-string';
import dataTools from '@tidepool/data-tools';
import logMaker from './log';
import * as CSV from 'csv-string';
import es from 'event-stream';

const MemoryStore = require('memorystore')(session);

const log = logMaker('app.js', { level: process.env.DEBUG_LEVEL || 'info' });

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
config.sessionSecret = process.env.SESSION_SECRET;
if (_.isEmpty(config.sessionSecret)) {
  log.error('SESSION_SECRET config value required.');
  process.exit(1);
}

const app = express();

// Authentication and Authorization Middleware
const auth = (req, res, next) => {
  if (req.headers['x-tidepool-session-token']) {
    log.info(`Set sessionToken: ${req.headers['x-tidepool-session-token']}`);
    req.session.sessionToken = req.headers['x-tidepool-session-token'];
  }

  if (!_.hasIn(req.session, 'sessionToken') && !_.hasIn(req.query, 'restricted_token')) {
    return res.redirect('/export/login');
  }

  return next();
};

function buildHeaders(requestSession) {
  if (requestSession.sessionToken) {
    return {
      headers: {
        'x-tidepool-session-token': requestSession.sessionToken,
      },
    };
  }
  return {};
}

function getPatientNameFromProfile(profile) {
  return (profile.patient.fullName) ? profile.patient.fullName : profile.fullName;
}

app.set('view engine', 'pug');
app.use(session({
  store: new MemoryStore({
    checkPeriod: 86400000, // Prune expired entries every 24h
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.httpsConfig,
  },
}));
app.use(flash());
app.use(bodyParser.urlencoded({
  extended: false,
}));

// The Health Check
app.use('/export/status', require('express-healthcheck')());

app.get('/export/login', (req, res) => {
  res.render('login', {
    flash: req.flash(),
  });
});

app.post('/export/login', async (req, res) => {
  try {
    const loginResponse = await axios.post(`${process.env.API_HOST}/auth/login`, null, {
      auth: {
        username: req.body.username,
        password: req.body.password,
      },
    });
    req.session.sessionToken = loginResponse.headers['x-tidepool-session-token'];
    req.session.user = loginResponse.data;
    log.info(`User ${req.session.user.userid} logged into ${process.env.API_HOST}`);
    res.redirect('/export/patients');
  } catch (error) {
    log.error(`Incorrect username and/or password for ${process.env.API_HOST}`);
    req.flash('error', 'Username and/or password are incorrect');
    res.redirect('/export/login');
  }
});

app.get('/export/logout', (req, res) => {
  delete req.session.sessionToken;
  res.redirect('/export/login');
});

app.get('/export/patients', auth, async (req, res) => {
  const userList = [];
  try {
    const profileResponse = await axios.get(`${process.env.API_HOST}/metadata/${req.session.user.userid}/profile`, buildHeaders(req.session));
    userList.push({
      userid: req.session.user.userid,
      fullName: getPatientNameFromProfile(profileResponse.data),
    });
  } catch (error) {
    log.debug('Could not read profile. Probably a clinician account');
  }

  try {
    const userListResponse = await axios.get(`${process.env.API_HOST}/metadata/users/${req.session.user.userid}/users`, buildHeaders(req.session));
    for (const trustingUser of userListResponse.data) {
      if (trustingUser.trustorPermissions && trustingUser.trustorPermissions.view) {
        userList.push({
          userid: trustingUser.userid,
          fullName: getPatientNameFromProfile(trustingUser.profile),
        });
      }
    }

    res.render('patients', {
      users: userList,
    });
  } catch (error) {
    log.error('Error fetching patient list');
    log.error(error);
    req.flash('error', 'Error fetching patient list');
    res.redirect('/export/login');
  }
});

app.get('/export/:userid', auth, async (req, res) => {
  const queryData = [];

  let logString = `Requesting download for User ${req.params.userid}`;
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
    const requestConfig = buildHeaders(req.session);
    requestConfig.responseType = 'stream';
    const dataResponse = await axios.get(`${process.env.API_HOST}/data/${req.params.userid}?${queryString.stringify(queryData)}`, requestConfig);
    log.debug(`Downloading data for User ${req.params.userid}...`);

    if (req.query.format === 'json') {
      res.attachment('TidepoolExport.json');

      dataResponse.data
        .pipe(res);
    } else if(req.query.format === 'xlsx') {
      res.attachment('TidepoolExport.xlsx');

      dataResponse.data
        .pipe(dataTools.jsonParser())
        .pipe(dataTools.tidepoolProcessor())
        .pipe(dataTools.xlsxStreamWriter(res));
    } else {
      // export as csv
      res.attachment('TidepoolExport.csv');
      res.write(CSV.stringify(dataTools.allFields));

      dataResponse.data
        .pipe(dataTools.jsonParser())
        .pipe(dataTools.tidepoolProcessor())
        .pipe(es.mapSync(
            data => CSV.stringify(dataTools.allFields.map(field => data[field] || '')),
          ))
        .pipe(res);
    }

    // Because we are in an async function, we need to  wait for the stream to complete
    try {
      await new Promise((resolve, reject) => {
        dataResponse.data.on('end', resolve);
        dataResponse.data.on('error', err => reject(err));
      });

      log.debug(`Finished downloading data for User ${req.params.userid}`);
    } catch (e) {
      log.error(`Got error while downloading: ${e}`);
    }
  } catch (error) {
    if (error.dataResponse && error.dataResponse.statusCode === 403) {
      res.redirect('/export/login');
    } else {
      res.status(500).send('Server error while processing data. Please contact Tidepool Support.');
      log.error(`500: ${error}`);
    }
  }
});

app.get('/export', (req, res) => {
  log.error(req.headers);
  res.redirect('/export/patients');
});

app.get('/', (req, res) => {
  res.redirect('/export/patients');
});

if (config.httpPort) {
  app.server = http.createServer(app).listen(config.httpPort, () => {
    log.info(`Listening for HTTP on ${config.httpPort}`);
  });
}

if (config.httpsPort) {
  if (_.isEmpty(config.httpsConfig)) {
    log.error('SSL endpoint is enabled, but no valid config was found. Exiting.');
    process.exit(1);
  } else {
    https.createServer(config.httpsConfig, app).listen(config.httpsPort, () => {
      log.info(`Listening for HTTPS on ${config.httpsPort}`);
    });
  }
}
