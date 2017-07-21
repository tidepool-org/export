const request = require('request');
const express = require('express');
const sortdata = require('../command-line-data-tools/bin/sortdata');
const stripdata = require('../command-line-data-tools/bin/stripdata');

const app = express()

// TODO -stop being hard coded
const session_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkdXIiOjI1OTIwMDAsImV4cCI6MTUwMzExOTMxOCwic3ZyIjoibm8iLCJ1c3IiOiIwZDMyZThiMTE3In0.yPEh5zzyDzeF5C4UOyHzJyJOJ1bD1K2B_nUlxsjegd0';

const id = '0d32e8b117';

app.get('/', function (req, res) {
        
    const requestInfo = userIdQuery(id, session_token);
         
    request.get (requestInfo, function (error, response, body) {
         
        if (error) {
            res.status(403).send('error!')
            console.error('403' + error + ',' + response.statusCode)
        }
         
        var dataObject = JSON.parse(body);
        sortdata.sortData(dataObject);
        
        stripdata.stripData(dataObject);
        
        res.send(JSON.stringify(dataObject));
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

