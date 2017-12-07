#!/usr/bin/env node --harmony

/* eslint no-restricted-syntax: [0, "ForInStatement"] */

const logMaker = require('./log.js');
const _ = require('lodash');
const http = require('http');
const https = require('https');
const requestPromise = require('request-promise-native');
const express = require('express');
const flash = require('express-flash');
const bodyParser = require('body-parser');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const dataTools = require('@tidepool/data-tools');
const datatoworkbook = require('@tidepool/data-tools/bin/datatoworkbook');

const log = logMaker('app.js');

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
if (_.isEmpty(config.sessionSecret)) {
  log.error('SESSION_SECRET config value required.');
  process.exit(1);
}

const app = express();

function buildTidepoolRequest(path, requestSession) {
  return {
    url: `${requestSession.apiHost}${path}`,
    headers: {
      'x-tidepool-session-token': requestSession.sessionToken,
      'Content-Type': 'application/json',
    },
    json: true,
  };
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

app.get('/export/:userid', (req, res) => {
  if (!(_.hasIn(req.session, 'sessionToken') && _.hasIn(req.session, 'apiHost'))) {
    res.redirect('/login');
  } else {
    log.debug(`User ${req.session.user.userid} requesting download for User ${req.params.userid}...`);
    const dataRequest = buildTidepoolRequest(`/data/${req.params.userid}`, req.session);

    requestPromise.get(dataRequest)
      .then((response) => {
        log.info(`User ${req.session.user.userid} downloading data for User ${req.params.userid}...`);

        const dataArray = JSON.parse(JSON.stringify(response));

        dataTools.sortDataByDate(dataArray);

        if (req.query.anonymous) {
          for (const dataObject of dataArray) {
            dataTools.stripData(dataObject);
          }
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=TidepoolExport.xlsx');

        datatoworkbook.dataToWorkbook(dataArray, res)
          .then(() => {
            res.end();
          });
      })
      .catch((error) => {
        log.info(error);

        if (error.response && error.response.statusCode === 403) {
          res.redirect('/login');
        } else {
          res.status(500).send('Server error while processing data. Please contact Tidepool Support.');
          error(`500: ${JSON.stringify(error)}`);
        }
      });
  }
});

app.get('/login', (req, res) => {
  res.render('login', {
    flash: req.flash(),
  });
});

app.post('/login', (req, res) => {
  const auth = `Basic ${Buffer.from(`${req.body.username}:${req.body.password}`).toString('base64')}`;
  req.session.apiHost = (req.body.environment === 'local') ?
    'http://localhost:8009' :
    `https://${req.body.environment}-api.tidepool.org`;

  requestPromise.post({
    url: `${req.session.apiHost}/auth/login`,
    json: true,
    headers: {
      Authorization: auth,
    },
  }, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      log.error(`Incorrect username and/or password for ${req.session.apiHost}`);
      req.flash('error', 'Username and/or password are incorrect');
      res.redirect('/login');
    } else {
      req.session.sessionToken = response.headers['x-tidepool-session-token'];
      req.session.user = body;
      log.info(`User ${req.session.user.userid} logged into ${req.session.apiHost}`);
      res.redirect('/patients');
    }
  });
});

app.get('/patients', (req, res) => {
  if (!(_.hasIn(req.session, 'sessionToken') && _.hasIn(req.session, 'apiHost'))) {
    res.redirect('/login');
  } else {
    const profileRequest = buildTidepoolRequest(`/metadata/${req.session.user.userid}/profile`, req.session);
    const userListRequest = buildTidepoolRequest(`/metadata/users/${req.session.user.userid}/users`, req.session);

    const userList = [];
    requestPromise.get(profileRequest)
      .then((response) => {
        userList.push({
          userid: req.session.user.userid,
          fullName: getPatientNameFromProfile(response),
        });
      });

    requestPromise.get(userListRequest)
      .then((response) => {
        for (const trustingUser of response) {
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
      });
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
