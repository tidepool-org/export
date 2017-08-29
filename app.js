#!/usr/bin/env node --harmony

const request = require('request');
const express = require('express');
const sortdata = require('../command-line-data-tools/bin/sortdata');
const stripdata = require('../command-line-data-tools/bin/stripdata');
const datatoworkbook = require('../command-line-data-tools/bin/datatoworkbook');
const tempy = require('tempy');

const app = express();

// TODO -stop being hard coded
const session_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkdXIiOjI1OTIwMDAsImV4cCI6MTUwNjIyNjM1NSwic3ZyIjoibm8iLCJ1c3IiOiI5NzVhYzVjYzkyIn0.2HAw2tp7f2b7H2aOd7NLsJi7xil9LLNMdDaPcPn1Lr8';

const id = '0d32e8b117';

app.get('/', function (req, res) {

    const requestInfo = userIdQuery(id, session_token);

    request.get (requestInfo, function (error, response, body) {

        if (error) {
            res.status(403).send('error!')
            console.error('403' + error + ',' + response.statusCode)
        }

        let dataArray = JSON.parse(body);

        sortdata.sortData(dataArray);

        for (const dataObject of dataArray) {
            stripdata.stripData(dataObject);
        }
        const filepath = tempy.file({extension: 'xlsx'});
        const stringfilepath = String(filepath);

        datatoworkbook.dataToWorkbook(dataArray, stringfilepath);
        // res.send(JSON.stringify(dataArray));
        res.download(stringfilepath);

        //res.send('Success');
    })

});

app.listen(3000, function() {
    console.log('Listening on 3000');
});

function userIdQuery(userId, session_token) {
    return path = {
        url: `https://api.tidepool.org/data/${userId}`,
        headers: {
            'x-tidepool-session-token': session_token,
            'Content-Type': 'application/json'
        }
    }
 }
