#!/usr/bin/env node --harmony

/* eslint no-restricted-syntax: [0, "ForInStatement"] */

import _ from 'lodash';
import http from 'http';
import https from 'https';
import axios from 'axios';
import express from 'express';
import flash from 'express-flash';
import bodyParser from 'body-parser';
import session from 'express-session';
import queryString from 'query-string';
import datatoworkbook from '@tidepool/data-tools/bin/datatoworkbook';
import logMaker from './log';

const MemoryStore = require('memorystore')(session);

const log = logMaker('app.js', { level: 'debug' });

const config = {};
config.httpPort = process.env.HTTP_PORT;
config.httpsPort = process.env.HTTPS_PORT;
if (process.env.HTTPS_CONFIG) {
  config.httpsConfig = JSON.parse(process.env.HTTPS_CONFIG);
} else {
  config.httpsConfig = {};
}
if (!config.httpPort) {
  config.httpPort = 3001;
}
config.sessionSecret = process.env.SESSION_SECRET;
config.downloadDir = process.env.DOWNLOAD_DIR || '/downloads';
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
    return res.redirect('/login');
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

// If we run over SSL, redirect any non-SSL requests to HTTPS
if (config.httpsPort) {
  app.use((req, res, next) => {
    // The /status endpoint can be served over HTTP
    if (req.secure || req.url === '/status') {
      next();
    } else {
      log.info('Redirecting HTTP request to HTTPS');
      const httpsHost = req.headers.host.replace(/:\d+/, `:${config.httpsPort}`);
      res.redirect(`https://${httpsHost}${req.url}`);
    }
  });
}

// The Health Check
app.use('/status', require('express-healthcheck')());

app.get('/export/:env/:userid', auth, async (req, res) => {
  req.session.apiHost = (req.params.env === 'local') ?
    'http://localhost:8009' :
    `https://${req.params.env}-api.tidepool.org`;

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
    const response = await axios.get(`${req.session.apiHost}/data/${req.params.userid}?${queryString.stringify(queryData)}`, requestConfig);
    log.debug(`Downloading data for User ${req.params.userid}...`);

    if (req.query.format === 'json') {
      res.attachment('TidepoolExport.json');
      response.data.pipe(res);
    } else {
      res.attachment('TidepoolExport.xlsx');
      await datatoworkbook.streamToWorkbook(response.data, res);
    }

    response.data.on('error', (err) => {
      log.error(`Got error while downloading: ${err}`);
    });

    response.data.on('end', async () => {
      res.end();
    });

    /*
    const dataArray = JSON.parse(JSON.stringify(response.data));

    // dataTools.sortDataByDate(dataArray);

    if (req.query.anonymous) {
      for (const dataObject of dataArray) {
        dataTools.stripData(dataObject);
      }
    }

    if (req.query.format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=TidepoolExport.json');

      res.json(dataArray);
    } else {
      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=TidepoolExport.xlsx');

      await datatoworkbook.dataToWorkbook(dataArray, res);
      res.end();
    }
    */
  } catch (error) {
    log.error(error);

    if (error.response && error.response.statusCode === 403) {
      res.redirect('/login');
    } else {
      res.status(500).send('Server error while processing data. Please contact Tidepool Support.');
      log.error(`500: ${error}`);
    }
  }
});

app.get('/login', (req, res) => {
  res.render('login', {
    flash: req.flash(),
  });
});

app.post('/login', async (req, res) => {
  req.session.apiHost = (req.body.environment === 'local') ?
    'https://ghhlnwfplr.localtunnel.me' :
    `https://${req.body.environment}-api.tidepool.org`;

  try {
    const response = await axios.post(`${req.session.apiHost}/auth/login`, null, {
      auth: {
        username: req.body.username,
        password: req.body.password,
      },
    });
    req.session.sessionToken = response.headers['x-tidepool-session-token'];
    req.session.user = response.data;
    log.info(`User ${req.session.user.userid} logged into ${req.session.apiHost}`);
    res.redirect('/patients');
  } catch (error) {
    log.error(`Incorrect username and/or password for ${req.session.apiHost}`);
    req.flash('error', 'Username and/or password are incorrect');
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  delete req.session.sessionToken;
  delete req.session.apiHost;
  res.redirect('/login');
});

app.get('/patients', auth, async (req, res) => {
  const userList = [];
  try {
    const profileResponse = await axios.get(`${req.session.apiHost}/metadata/${req.session.user.userid}/profile`, buildHeaders(req.session));
    userList.push({
      userid: req.session.user.userid,
      fullName: getPatientNameFromProfile(profileResponse.data),
    });
  } catch (error) {
    log.debug('Could not read profile. Probably a clinician account');
  }

  try {
    const userListResponse = await axios.get(`${req.session.apiHost}/metadata/users/${req.session.user.userid}/users`, buildHeaders(req.session));
    for (const trustingUser of userListResponse.data) {
      if (trustingUser.trustorPermissions && trustingUser.trustorPermissions.view) {
        userList.push({
          userid: trustingUser.userid,
          fullName: getPatientNameFromProfile(trustingUser.profile),
        });
      }
    }

    const env = (_.isUndefined(req.session.apiHost.match(/.*:\/\/localhost.*/))) ? 'local' : req.session.apiHost.match(/.*:\/\/(\w+)-*/)[1];

    res.render('patients', {
      users: userList,
      env,
    });
  } catch (error) {
    log.error('Error fetching patient list');
    log.error(error);
    req.flash('error', 'Error fetching patient list');
    res.redirect('/login');
  }
});

app.get('/', (req, res) => {
  res.redirect('/patients');
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
