#!/usr/bin/env node --harmony

/* eslint-disable no-console */
/* eslint no-restricted-syntax: [0, "ForInStatement"] */

const requestPromise = require('request-promise-native');
const express = require('express');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const dataTools = require('tidepool-data-tools');
const datatoworkbook = require('tidepool-data-tools/bin/datatoworkbook');

const port = 3001;
const app = express();
const sessionStore = new session.MemoryStore();

let sessionToken = '';
let apiHost = '';
let user = null;

function buildTidepoolRequest(path) {
  return {
    url: `${apiHost}${path}`,
    headers: {
      'x-tidepool-session-token': sessionToken,
      'Content-Type': 'application/json',
    },
    json: true,
  };
}

function getPatientNameFromProfile(profile) {
  return (profile.patient.fullName) ? profile.patient.fullName : profile.fullName;
}

app.set('view engine', 'pug');
app.use(cookieParser('secret'));
app.use(session({
  cookie: {
    maxAge: 60000,
  },
  store: sessionStore,
  saveUninitialized: true,
  resave: 'true',
  secret: 'secret',
}));
app.use(flash());
app.use(bodyParser.urlencoded({
  extended: false,
}));

app.get('/export/:userid', (req, res) => {
  if (sessionToken === '' || apiHost === '') {
    res.redirect('/login');
  } else {
    console.log(`Fetching data for User ID ${req.params.userid}...`);
    const dataRequest = buildTidepoolRequest(`/data/${req.params.userid}`);

    requestPromise.get(dataRequest)
      .then((response) => {
        console.log(`Fetched data for ${req.params.userid}`);

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
        console.log(error);

        if (error.response && error.response.statusCode === 403) {
          res.redirect('/login');
        } else {
          res.status(500).send('Server error while processing data. Please contact Tidepool Support.');
          console.error(`500: ${JSON.stringify(error)}`);
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
  apiHost = (req.body.environment === 'local') ?
    'http://localhost:8009' :
    `https://${req.body.environment}-api.tidepool.org`;

  requestPromise.post({
    url: `${apiHost}/auth/login`,
    json: true,
    headers: {
      Authorization: auth,
    },
  }, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      req.flash('error', 'Username and/or password are incorrect');
      res.redirect('/login');
    } else {
      sessionToken = response.headers['x-tidepool-session-token'];
      user = body;
      res.redirect('/patients');
    }
  });
});

app.get('/patients', (req, res) => {
  if (sessionToken === '' || apiHost === '') {
    res.redirect('/login');
  } else {
    const profileRequest = buildTidepoolRequest(`/metadata/${user.userid}/profile`);
    const userListRequest = buildTidepoolRequest(`/metadata/users/${user.userid}/users`);

    const userList = [];
    requestPromise.get(profileRequest)
      .then((response) => {
        userList.push({
          userid: user.userid,
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

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
