/* eslint-disable no-underscore-dangle */

import mocha from 'mocha';
import moment from 'moment';

import { deepEqual, equal } from 'assert';

import reports from '../lib/report.js';

import { mmolLUnits, mgdLUnits, logMaker } from '../lib/utils.js';

const { Report } = reports;
const { describe, it, before } = mocha;

describe('report', () => {
  const testLog = logMaker('report_test.js', {
    level: process.env.DEBUG_LEVEL || 'info',
  });
  const userDetails = {
    userId: '1234',
    fullName: 'Test User',
    dob: '25-10-1997',
    mrn: '12345',
  };
  const requestDetail = {
    token: 'token',
    sessionHeader: { session: 'stuff' },
  };
  const expectedMgdLPref = {
    bgUnits: mgdLUnits,
    bgClasses: {
      low: {
        boundary: 70,
      },
      target: {
        boundary: 180,
      },
    },
    bgBounds: {
      veryHighThreshold: 250,
      targetUpperBound: 180,
      targetLowerBound: 70,
      veryLowThreshold: 54,
      clampThreshold: 600,
    },
  };
  const expectedMmoLPref = {
    bgUnits: mmolLUnits,
    bgClasses: {
      low: {
        boundary: 3.9,
      },
      target: {
        boundary: 10,
      },
    },
    bgBounds: {
      veryHighThreshold: 13.9,
      targetUpperBound: 10,
      targetLowerBound: 3.9,
      veryLowThreshold: 3,
      clampThreshold: 33.3,
    },
  };
  const expectedTZPrefs = {
    timezoneAware: true,
    timezoneName: 'NZ',
  };
  let report;
  before(() => {
    report = new Report(
      testLog,
      userDetails,
      {
        tzName: 'NZ',
        bgUnits: mmolLUnits,
        reports: ['all'],
      },
      requestDetail,
    );
  });

  describe('buildReportQueries', () => {
    it('should return just settings when asked for', () => {
      const settingReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mmolLUnits,
          reports: ['settings'],
        },
        requestDetail,
      );

      deepEqual(settingReport.buildReportQueries(), {
        settings: {
          excludedDevices: [],
          bgPrefs: expectedMmoLPref,
          metaData: 'latestPumpUpload, bgSources',
          timePrefs: expectedTZPrefs,
        },
      });
    });
    it('should return just basics when asked for', () => {
      const basicsReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['basics'],
        },
        requestDetail,
      );
      deepEqual(basicsReport.buildReportQueries(), {
        basics: {
          aggregationsByDate: 'basals, boluses, fingersticks, siteChanges',
          excludedDevices: [],
          bgPrefs: expectedMgdLPref,
          bgSource: 'cbg',
          endpoints: [],
          excludeDaysWithoutBolus: false,
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'timeInRange',
            'averageGlucose',
            'sensorUsage',
            'totalInsulin',
            'carbs',
            'averageDailyDose',
            'glucoseManagementIndicator',
            'standardDev',
            'coefficientOfVariation',
            'bgExtents',
          ],
          timePrefs: expectedTZPrefs,
        },
      });
    });
    it('should return just daily when asked for', () => {
      const dailyReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mmolLUnits,
          reports: ['daily'],
        },
        requestDetail,
      );
      deepEqual(dailyReport.buildReportQueries(), {
        daily: {
          aggregationsByDate: 'dataByDate, statsByDate',
          excludedDevices: [],
          bgPrefs: expectedMmoLPref,
          bgSource: 'cbg',
          endpoints: [],
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'timeInRange',
            'averageGlucose',
            'totalInsulin',
            'carbs',
            'standardDev',
            'coefficientOfVariation',
          ],
          timePrefs: expectedTZPrefs,
          types: {
            basal: {},
            bolus: {},
            cbg: {},
            deviceEvent: {},
            food: {},
            message: {},
            smbg: {},
            wizard: {},
          },
        },
      });
    });
    it('should return just agp when asked for', () => {
      const agpReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['agp'],
        },
        requestDetail,
      );

      deepEqual(agpReport.buildReportQueries(), {
        agp: {
          aggregationsByDate: 'dataByDate, statsByDate',
          excludedDevices: [],
          bgPrefs: expectedMgdLPref,
          bgSource: 'cbg',
          endpoints: [],
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'timeInRange',
            'averageGlucose',
            'sensorUsage',
            'glucoseManagementIndicator',
            'coefficientOfVariation',
          ],
          timePrefs: expectedTZPrefs,
          types: {
            cbg: {},
          },
        },
      });
    });
    it('should return just bgLog when asked for', () => {
      const bgLogReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['bgLog'],
        },
        requestDetail,
      );
      deepEqual(bgLogReport.buildReportQueries(), {
        bgLog: {
          aggregationsByDate: 'dataByDate',
          excludedDevices: [],
          bgPrefs: expectedMgdLPref,
          bgSource: 'smbg',
          endpoints: [],
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'readingsInRange',
            'averageGlucose',
            'standardDev',
            'coefficientOfVariation',
          ],
          timePrefs: expectedTZPrefs,
          types: {
            smbg: {},
          },
        },
      });
    });
    describe('all reports', () => {
      let allReportQueries;
      before(() => {
        allReportQueries = report.buildReportQueries();
      });
      it('should return all 5 report queries when asked for', () => {
        equal(Object.keys(allReportQueries).length, 5);
      });
      it('should include basics report when all report queries when asked for', () => {
        equal(Object.keys(allReportQueries).includes('basics'), true);
      });
      it('should include bgLog report when all report queries when asked for', () => {
        equal(Object.keys(allReportQueries).includes('bgLog'), true);
      });
      it('should include agp report when all report queries when asked for', () => {
        equal(Object.keys(allReportQueries).includes('agp'), true);
      });
      it('should include settings report when all report queries when asked for', () => {
        equal(Object.keys(allReportQueries).includes('settings'), true);
      });
      it('should include daily report when all report queries when asked for', () => {
        equal(Object.keys(allReportQueries).includes('settings'), true);
      });
      it('should not include an `all` report type ', () => {
        equal(Object.keys(allReportQueries).includes('all'), false);
      });
      it('should default to all reports when none specified', () => {
        const reportDefaultAll = new Report(
          testLog,
          userDetails,
          {
            tzName: 'NZ',
            bgUnits: mmolLUnits,
          },
          requestDetail,
        );

        equal(
          Object.keys(reportDefaultAll.buildReportQueries()).length,
          5,
        );
      });
    });
  });
  describe('getTimePrefs', () => {
    it('should return given tz name when passed to constructor', () => {
      const r = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mmolLUnits,
          reports: ['settings'],
        },
        requestDetail,
      );
      deepEqual(r.getTimePrefs(), {
        timezoneAware: true,
        timezoneName: 'NZ',
      });
    });
    it('should return default tz name `UTC` when not set', () => {
      const r = new Report(
        testLog,
        userDetails,
        {
          bgUnits: mmolLUnits,
          reports: ['settings'],
        },
        requestDetail,
      );
      deepEqual(r.getTimePrefs(), {
        timezoneAware: true,
        timezoneName: 'UTC',
      });
    });
  });
  describe('getBGPrefs', () => {
    it('should return given bg units passed to constructor', () => {
      const r = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['settings'],
        },
        requestDetail,
      );
      deepEqual(r.getBGPrefs(), expectedMgdLPref);
    });
    it('should return default bg unit `mmol/L` when not set', () => {
      const r = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          reports: ['settings'],
        },
        requestDetail,
      );
      deepEqual(r.getBGPrefs(), expectedMmoLPref);
    });
  });
  describe('userDataQueryOptions', () => {
    describe('when dates set from last upload data', () => {
      const uploadData = [
        { type: 'upload', time: '2022-05-25T00:00:00.000Z' },
        { type: 'smbg', time: '2022-05-30T00:00:00.000Z' },
        { type: 'upload', time: '2022-06-25T00:00:00.000Z' },
        { type: 'cbg', time: '2022-07-25T00:00:00.000Z' },
        { type: 'upload', time: '2022-07-30T00:00:00.000Z' },
      ];
      let opts;
      before(() => {
        opts = report.userDataQueryOptions({
          data: uploadData,
        });
      });
      it('should have bgPrefs for given units', () => {
        deepEqual(opts.bgPrefs, expectedMmoLPref);
      });
      it('should have initial as true', () => {
        equal(opts.initial, true);
      });
      it('should have endDate as latest item date + 1 day ', () => {
        equal(
          opts.endDate,
          moment(uploadData[4].time).add(1, 'days').toISOString(),
        );
      });
      it('should have startDate as earliest diabetes datum item date - 30 days', () => {
        equal(
          opts.startDate,
          moment(uploadData[3].time).subtract(30, 'days').toISOString(),
        );
      });
    });
    describe('when dates params used', () => {
      describe('and dates have a 30 day or greater difference', () => {
        let opts;
        before(() => {
          const r = new Report(
            testLog,
            userDetails,
            {
              tzName: 'UTC',
              bgUnits: mmolLUnits,
              reports: ['all'],
              startDate: '2022-06-25T00:00:00.000Z',
              endDate: '2022-07-25T00:00:00.000Z',
            },
            requestDetail,
          );
          opts = r.userDataQueryOptions({});
        });
        it('should have bgPrefs for given units', () => {
          deepEqual(opts.bgPrefs, expectedMmoLPref);
        });
        it('should have initial as true', () => {
          equal(opts.initial, true);
        });
        it('should have endDate as given', () => {
          equal(opts.endDate, '2022-07-25T00:00:00.000Z');
        });
        it('should have startDate as given if dates are >= 30 day difference', () => {
          equal(opts.startDate, '2022-06-25T00:00:00.000Z');
        });
      });
    });
    describe('and dates have a less than 30 day difference', () => {
      let opts;
      before(() => {
        const r = new Report(
          testLog,
          userDetails,
          {
            tzName: 'UTC',
            bgUnits: mmolLUnits,
            reports: ['all'],
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-10T00:00:00.000Z',
          },
          requestDetail,
        );
        opts = r.userDataQueryOptions({});
      });

      it('should have bgPrefs for given units', () => {
        deepEqual(opts.bgPrefs, expectedMmoLPref);
      });
      it('should have initial as true', () => {
        equal(opts.initial, true);
      });
      it('should have endDate as given', () => {
        equal(opts.endDate, '2022-07-10T00:00:00.000Z');
      });
      it('should have startDate as 30 days prior to set end date', () => {
        equal(opts.startDate, '2022-06-10T00:00:00.000Z');
      });
    });
  });
  describe('getDateRangeByReport', () => {
    describe('when dates set', () => {
      let dateRange;
      let expectedEndDate;
      let expectedStartDate;
      before(() => {
        const r = new Report(
          testLog,
          userDetails,
          {
            tzName: 'UTC',
            bgUnits: mmolLUnits,
            reports: ['all'],
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-25T00:00:00.000Z',
          },
          requestDetail,
        );
        dateRange = r.getDateRangeByReport({});

        expectedEndDate = moment('2022-07-25T00:00:00.000Z')
          .tz('UTC')
          .endOf('day')
          .subtract(1, 'ms');
        expectedStartDate = moment('2022-06-25T00:00:00.000Z')
          .tz('UTC')
          .startOf('day');
      });
      it('should set agp start and end dates', () => {
        deepEqual(dateRange.agp, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set daily start and end dates', () => {
        deepEqual(dateRange.daily, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set bgLog start and end dates', () => {
        deepEqual(dateRange.bgLog, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set basics start and end dates', () => {
        deepEqual(dateRange.basics, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
    });
    describe('when dates set less than 30 days apart', () => {
      let dateRange;
      before(() => {
        const r = new Report(
          testLog,
          userDetails,
          {
            tzName: 'UTC',
            bgUnits: mmolLUnits,
            reports: ['all'],
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-10T00:00:00.000Z',
          },
          requestDetail,
        );
        dateRange = r.getDateRangeByReport({});
      });
      it('should set agp start and end 15 days apart', () => {
        deepEqual(
          dateRange.agp.endDate.diff(dateRange.agp.startDate, 'days'),
          15,
        );
      });
      it('should set daily start and end 15 days apart', () => {
        deepEqual(
          dateRange.daily.endDate.diff(dateRange.daily.startDate, 'days'),
          15,
        );
      });
      it('should set bgLog start and end 30 days apart', () => {
        deepEqual(
          dateRange.bgLog.endDate.diff(dateRange.bgLog.startDate, 'days'),
          30,
        );
      });
      it('should set basics start and end dates 15 days apart', () => {
        deepEqual(
          dateRange.basics.endDate.diff(dateRange.basics.startDate, 'days'),
          15,
        );
      });
    });
  });
  describe('getReportOptions', () => {
    describe('when dates set', () => {
      const uploadData = [
        { type: 'upload', time: '2022-05-25T00:00:00.000Z' },
        { type: 'smbg', time: '2022-05-30T00:00:00.000Z' },
        { type: 'upload', time: '2022-06-25T00:00:00.000Z' },
        { type: 'cbg', time: '2022-07-25T00:00:00.000Z' },
        { type: 'upload', time: '2022-07-30T00:00:00.000Z' },
      ];
      const expectedProfile = {
        fullName: userDetails.fullName,
        patient: {
          birthday: userDetails.dob,
          mrn: userDetails.mrn,
        },
      };
      let opts;
      before(() => {
        const r = new Report(
          testLog,
          userDetails,
          {
            tzName: 'NZ',
            bgUnits: mmolLUnits,
            reports: ['all'],
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-25T00:00:00.000Z',
          },
          requestDetail,
        );
        opts = r.getReportOptions({ data: uploadData });
      });
      it('should set printOptions', () => {
        const expectedPrintOpts = {
          endpoints: [
            moment('2022-06-24T12:00:00.000Z').toDate(),
            moment('2022-07-25T11:59:59.998Z').toDate(),
          ],
          disabled: false,
        };
        deepEqual(opts.printOptions, {
          agp: expectedPrintOpts,
          basics: expectedPrintOpts,
          bgLog: expectedPrintOpts,
          daily: expectedPrintOpts,
          settings: { disabled: false },
          patient: {
            permissions: {},
            userid: userDetails.userId,
            profile: expectedProfile,
            settings: {},
          },
        });
      });
      it('should set queries for all reports ', () => {
        equal(Object.keys(opts.queries).length, 5);
        equal(Object.keys(opts.queries).includes('basics'), true);
        equal(Object.keys(opts.queries).includes('settings'), true);
        equal(Object.keys(opts.queries).includes('agp'), true);
        equal(Object.keys(opts.queries).includes('daily'), true);
        equal(Object.keys(opts.queries).includes('bgLog'), true);
      });
    });
  });
});
