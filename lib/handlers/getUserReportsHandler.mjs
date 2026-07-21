import { writeFileSync } from 'node:fs';
import _ from 'lodash';
import {
  getSessionHeader, createCounter, exportTimeout, logMaker,
} from '../utils.mjs';
import report from '../report.mjs';

const { Report } = report;
const { get } = _;

const reportStatusCount = createCounter(
  'tidepool_get_report_status_count',
  'The number of errors for each status code.',
  ['status_code', 'report_params'],
);

const log = logMaker('getUserReportsHandler.js', {
  level: process.env.DEBUG_LEVEL || 'info',
});

export default function getUserReportsHandler() {
  return async (req, res) => {
    // Set the timeout for the request. Make it 10 seconds longer than
    // our configured timeout to give the service time to cancel the API data
    // request, and close the outgoing data stream cleanly.
    req.setTimeout(exportTimeout + 10000);

    try {
      const userId = req.params.userid;
      const {
        dob,
        fullName,
        mrn,
        bgUnits,
        tzName,
        restricted_token: restrictedToken,
        reports,
        startDate,
        endDate,
        inline,
      } = req.query;

      const timer = setTimeout(() => {
        res.emit('timeout', exportTimeout);
      }, exportTimeout);

      const userReport = new Report(
        log,
        {
          userId,
          fullName,
          dob,
          mrn,
        },
        {
          tzName,
          bgUnits,
          reports,
          startDate,
          endDate,
        },
        { token: restrictedToken, sessionHeader: getSessionHeader(req) },
      );

      const pdfReport = await userReport.generate();

      if (!inline) {
        res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
      }
      res.setHeader('Content-Type', 'application/pdf');
      const blobArrayBuffer = await pdfReport.blob.arrayBuffer();
      const pdfBuffer = Buffer.from(blobArrayBuffer);
      if (process.env.DEBUG_PDF) {
        writeFileSync('test.pdf', pdfBuffer);
      }
      res.send(pdfBuffer);
      clearTimeout(timer);
    } catch (error) {
      let msg = get(error, 'response.data.message', get(error, 'cause.response.data.message'));
      if (get(error, 'response.status') === 403 || get(error, 'cause.response.status') === 403) {
        reportStatusCount.inc({ status_code: 403, report_params: req.query });
        res.status(403);
        log.error(`403: ${error}`);
      } else if (get(error, 'status')) {
        const status = get(error, 'status');
        reportStatusCount.inc({ status_code: status, report_params: req.query });
        res.status(status);
        log.error(`${status}: ${error}`);
        if (get(error, 'message')) {
          msg = get(error, 'message');
        }
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
}
