const fs = require('fs');
const _ = require('lodash');
const {
  getSessionHeader,
  createCounter,
  exportTimeout,
  logMaker,
} = require('../utils');

const { generateReport } = require('../reportUtils');

const reportStatusCount = createCounter(
  'tidepool_post_report_status_count',
  'The number of errors for each status code.',
  ['status_code', 'report_params'],
);

const log = logMaker('postUserReportsHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

module.exports = function postUserReportsHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    try {
      const userId = req.params.userid;
      const { userDetail, reportDetail } = req.body;

      userDetail.userId = userId;
      const timer = setTimeout(() => {
        res.emit('timeout', exportTimeout);
      }, exportTimeout);

      const pdfReport = await generateReport(log, userDetail, reportDetail, {
        sessionHeader: getSessionHeader(req),
      });

      res.setHeader('Content-Disposition', 'attachment: filename="report.pdf"');
      res.setHeader('Content-Type', 'application/octet-stream');
      const blobArrayBuffer = await pdfReport.blob.arrayBuffer();
      const pdfBuffer = Buffer.from(blobArrayBuffer);
      if (process.env.DEBUG_PDF) {
        fs.writeFileSync('test.pdf', pdfBuffer);
      }
      res.send(pdfBuffer);
      clearTimeout(timer);
    } catch (error) {
      const msg = _.get(error, 'response.data.message', _.get(error, 'cause.response.data.message'));
      if (_.get(error, 'response.status') === 403 || _.get(error, 'cause.response.status') === 403) {
        reportStatusCount.inc({ status_code: 403, report_params: req.query });
        res.status(403);
        log.error(`403: ${error}`);
      } else {
        reportStatusCount.inc({ status_code: 500, report_params: req.query });
        res.status(500);
        log.error(`500: ${error}`);
      }
      if (msg) {
        res.send({ message: msg });
      } else {
        res.send();
      }
    }
  };
};
