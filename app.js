#!/usr/bin/env node --harmony

/* eslint-disable no-console */
/* eslint no-restricted-syntax: [0, "ForInStatement"] */

const request = require('request-promise-native');
const express = require('express');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const sortdata = require('../command-line-data-tools/bin/sortdata');
const stripdata = require('../command-line-data-tools/bin/stripdata');
const datatoworkbook = require('../command-line-data-tools/bin/datatoworkbook');

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
    return res.redirect('/login');
  }

  console.log(`Fetching data for User ID ${req.params.userid}...`);
  const dataRequest = buildTidepoolRequest(`/data/${req.params.userid}`);

  request.get(dataRequest)
    .then((response) => {
      console.log('Fetched data');

      const dataArray = JSON.parse(JSON.stringify(response));

      sortdata.sortData(dataArray);

      if (req.query.anonymous) {
        for (const dataObject of dataArray) {
          stripdata.stripData(dataObject);
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
        // FIXME: Less info once we go live
        res.status(500).send(`${JSON.stringify(error)}`);
        console.error(`500: ${JSON.stringify(error)}`);
      }
    });
});

app.get('/login', (req, res) => {
  res.render('login', {
    flash: req.flash(),
  });
});

app.post('/login', (req, res) => {
  const auth = `Basic ${new Buffer(`${req.body.username}:${req.body.password}`).toString('base64')}`;
  apiHost = (req.body.environment === 'local') ?
    'http://localhost:8009' :
    `https://${req.body.environment}-api.tidepool.org`;

  request.post({
    url: `${apiHost}/auth/login`,
    json: true,
    headers: {
      Authorization: auth,
    },
  }, (error, response, body) => {
    console.log(response.statusCode);
    console.log(response.headers);
    console.log(body);

    if (error || response.statusCode !== 200) {
      console.log('That is not right');
      req.flash('error', 'Username and/or password are incorrect');
      res.redirect('/login');
    } else {
      sessionToken = response.headers['x-tidepool-session-token'];
      user = body;
      res.redirect('/patients');
      // res.redirect(`/export/${body.userid}`);
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
    request.get(profileRequest)
      .then((response) => {
        userList.push({
          userid: user.userid,
          fullName: getPatientNameFromProfile(response),
        });
      });

    request.get(userListRequest)
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
