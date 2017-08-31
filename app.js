#!/usr/bin/env node --harmony

/* eslint-disable no-console */

const request = require('request');
const express = require('express');
const sortdata = require('../command-line-data-tools/bin/sortdata');
const stripdata = require('../command-line-data-tools/bin/stripdata');
const datatoworkbook = require('../command-line-data-tools/bin/datatoworkbook');

const app = express();

// TODO - stop being hard coded
const tempSessionToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkdXIiOjI1OTIwMDAsImV4cCI6MTUwNjIyNjM1NSwic3ZyIjoibm8iLCJ1c3IiOiI5NzVhYzVjYzkyIn0.2HAw2tp7f2b7H2aOd7NLsJi7xil9LLNMdDaPcPn1Lr8';

const id = '0d32e8b117';

function userIdQuery(userId, sessionToken) {
  return {
    url: `https://api.tidepool.org/data/${userId}`,
    headers: {
      'x-tidepool-session-token': sessionToken,
      'Content-Type': 'application/json',
    },
  };
}

app.get('/', (req, res) => {
  const requestInfo = userIdQuery(id, tempSessionToken);

  console.log('Fetching data...');

  new Promise((resolve, reject) => {
    request.get(requestInfo, (error, response, body) => {
      if (error) {
        return reject(error, response);
      }

      return resolve(body);
    });
  })
    .then((body) => {
      console.log('Fetched data');

      const dataArray = JSON.parse(body);
      sortdata.sortData(dataArray);

      for (const dataObject of dataArray) {
        stripdata.stripData(dataObject);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=TidepoolExport.xlsx');

      datatoworkbook.dataToWorkbook(dataArray, res)
        .then(() => {
          res.end();
        });
    })
    .catch((error) => {
      res.status(403).send('error!');
      console.error(`403 ${error}, ${res.statusCode}`);
    });
});

app.listen(3000, () => {
  console.log('Listening on 3000');
});
