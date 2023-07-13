/* eslint-disable no-underscore-dangle */

const mocha = require('mocha');
const moment = require('moment');
const rewire = require('rewire');

const { describe, it, before } = mocha;
const assert = require('assert');

const reportUtils = rewire('../lib/reportUtils');
const { mmolLUnits, mgdLUnits } = require('../lib/utils');

const reportDataTypes = reportUtils.__get__('reportDataTypes');
const reportTypes = reportUtils.__get__('reportTypes');
const getTimePrefs = reportUtils.__get__('getTimePrefs');
const getBGPrefs = reportUtils.__get__('getBGPrefs');
const buildReportQueries = reportUtils.__get__('buildReportQueries');
const getUserDataQueryOptions = reportUtils.__get__('getUserDataQueryOptions');
const getReportOptions = reportUtils.__get__('getReportOptions');
const getDateRangeByReport = reportUtils.__get__('getDateRangeByReport');

describe('reportUtils', () => {
  describe('reportDataTypes', () => {
    it('should have 8 data types', () => {
      assert.equal(reportDataTypes.length, 8);
    });
    it('should include cbg', () => {
      assert.equal(reportDataTypes.includes('cbg'), true);
    });
    it('should include smbg', () => {
      assert.equal(reportDataTypes.includes('smbg'), true);
    });
    it('should include basal', () => {
      assert.equal(reportDataTypes.includes('basal'), true);
    });
    it('should include bolus', () => {
      assert.equal(reportDataTypes.includes('bolus'), true);
    });
    it('should include wizard', () => {
      assert.equal(reportDataTypes.includes('wizard'), true);
    });
    it('should include food', () => {
      assert.equal(reportDataTypes.includes('food'), true);
    });
    it('should include pumpSettings', () => {
      assert.equal(reportDataTypes.includes('pumpSettings'), true);
    });
    it('should include upload', () => {
      assert.equal(reportDataTypes.includes('upload'), true);
    });
  });
  describe('reportTypes', () => {
    it('should have 6 report types', () => {
      assert.equal(Object.keys(reportTypes).length, 6);
    });
    it('should have agp', () => {
      assert.equal(reportTypes.agp, 'agp');
    });
    it('should have all', () => {
      assert.equal(reportTypes.all, 'all');
    });
    it('should have basics', () => {
      assert.equal(reportTypes.basics, 'basics');
    });
    it('should have bgLog', () => {
      assert.equal(reportTypes.bgLog, 'bgLog');
    });
    it('should have daily', () => {
      assert.equal(reportTypes.daily, 'daily');
    });
    it('should have settings', () => {
      assert.equal(reportTypes.settings, 'settings');
    });
  });
  describe('getBGPrefs', () => {
    const mmolLClasses = {
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
    const mgdLClasses = {
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
    it('should default to mmol/L when nothing set', () => {
      assert.deepEqual(getBGPrefs(), {
        bgUnits: mmolLUnits,
        ...mmolLClasses,
      });
    });
    it('should use mmol/L when mmol/L units passed', () => {
      assert.deepEqual(getBGPrefs(mmolLUnits), {
        bgUnits: mmolLUnits,
        ...mmolLClasses,
      });
    });
    it('should use mg/dL when mg/dL units passed', () => {
      assert.deepEqual(getBGPrefs(mgdLUnits), {
        bgUnits: mgdLUnits,
        ...mgdLClasses,
      });
    });
    it('should use default when unmatched units given', () => {
      assert.deepEqual(getBGPrefs('g'), {
        bgUnits: mmolLUnits,
        ...mmolLClasses,
      });
    });
  });
  describe('getTimePrefs', () => {
    it('should default to UTC', () => {
      assert.deepEqual(getTimePrefs(), {
        timezoneAware: true,
        timezoneName: 'UTC',
      });
    });
    it('should set timezoneName name when passed', () => {
      assert.deepEqual(getTimePrefs('NZ'), {
        timezoneAware: true,
        timezoneName: 'NZ',
      });
    });
  });
  describe('buildDataQueries', () => {
    it('should return just settings when asked for', () => {
      assert.deepEqual(
        buildReportQueries({
          bgUnits: mmolLUnits,
          timePrefs: getTimePrefs(),
          reports: [reportTypes.settings],
        }),
        {
          settings: {
            excludedDevices: [],
            bgPrefs: getBGPrefs(mmolLUnits),
            metaData: 'latestPumpUpload, bgSources',
            timePrefs: getTimePrefs(),
          },
        },
      );
    });
    it('should return just basics when asked for', () => {
      assert.deepEqual(
        buildReportQueries({
          bgUnits: mmolLUnits,
          timePrefs: getTimePrefs(),
          reports: [reportTypes.basics],
        }),
        {
          basics: {
            aggregationsByDate: 'basals, boluses, fingersticks, siteChanges',
            excludedDevices: [],
            bgPrefs: getBGPrefs(mmolLUnits),
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
            timePrefs: getTimePrefs(),
          },
        },
      );
    });
    it('should return just daily when asked for', () => {
      assert.deepEqual(
        buildReportQueries({
          bgUnits: mgdLUnits,
          timePrefs: getTimePrefs('NZ'),
          reports: [reportTypes.daily],
        }),
        {
          daily: {
            aggregationsByDate: 'dataByDate, statsByDate',
            excludedDevices: [],
            bgPrefs: getBGPrefs(mgdLUnits),
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
            timePrefs: getTimePrefs('NZ'),
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
        },
      );
    });
    it('should return just agp when asked for', () => {
      assert.deepEqual(
        buildReportQueries(
          {
            bgUnits: mgdLUnits,
            timePrefs: getTimePrefs(),
            reports: [reportTypes.agp],
          },
        ),
        {
          agp: {
            aggregationsByDate: 'dataByDate, statsByDate',
            excludedDevices: [],
            bgPrefs: getBGPrefs(mgdLUnits),
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
            timePrefs: getTimePrefs(),
            types: {
              cbg: {},
            },
          },
        },
      );
    });
    it('should return just bgLog when asked for', () => {
      assert.deepEqual(
        buildReportQueries(
          {
            bgUnits: mmolLUnits,
            timePrefs: getTimePrefs(),
            reports: [reportTypes.bgLog],
          },
        ),
        {
          bgLog: {
            aggregationsByDate: 'dataByDate',
            excludedDevices: [],
            bgPrefs: getBGPrefs(mmolLUnits),
            bgSource: 'smbg',
            endpoints: [],
            metaData: 'latestPumpUpload, bgSources',
            stats: [
              'readingsInRange',
              'averageGlucose',
              'standardDev',
              'coefficientOfVariation',
            ],
            timePrefs: getTimePrefs(),
            types: {
              smbg: {},
            },
          },
        },
      );
    });
    describe('all reports', () => {
      let allReportQueries;
      before(() => {
        allReportQueries = buildReportQueries(
          {
            bgUnits: mmolLUnits,
            timePrefs: getTimePrefs(),
            reports: [reportTypes.all],
          },
        );
      });
      it('should return all 5 report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).length, 5);
      });
      it('should include basics report when all report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).includes('basics'), true);
      });
      it('should include bgLog report when all report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).includes('bgLog'), true);
      });
      it('should include agp report when all report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).includes('agp'), true);
      });
      it('should include settings report when all report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).includes('settings'), true);
      });
      it('should include daily report when all report queries when asked for', () => {
        assert.equal(Object.keys(allReportQueries).includes('settings'), true);
      });
      it('should not include an `all` report type ', () => {
        assert.equal(Object.keys(allReportQueries).includes('all'), false);
      });
      it('should default to all reports when none specified', () => {
        assert.equal(
          Object.keys(buildReportQueries({
            bgUnits: mmolLUnits,
            timePrefs: getTimePrefs(),
          })).length,
          5,
        );
      });
    });
  });
  describe('getUserDataQueryOptions', () => {
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
        opts = getUserDataQueryOptions({
          bgUnits: mgdLUnits,
          data: uploadData,
        });
      });
      it('should have bgPrefs for given units', () => {
        assert.deepEqual(opts.bgPrefs, getBGPrefs(mgdLUnits));
      });
      it('should have initial as true', () => {
        assert.equal(opts.initial, true);
      });
      it('should have endDate as latest item date + 1 day ', () => {
        assert.equal(
          opts.endDate,
          moment(uploadData[4].time).add(1, 'days').toISOString(),
        );
      });
      it('should have startDate as earliest diabetes datum item date - 30 days', () => {
        assert.equal(
          opts.startDate,
          moment(uploadData[3].time).subtract(30, 'days').toISOString(),
        );
      });
    });
    describe('when dates params used', () => {
      describe('and dates have a 30 day or greater difference', () => {
        let opts;
        before(() => {
          opts = getUserDataQueryOptions({
            bgUnits: mmolLUnits,
            dates: {
              startDate: '2022-06-25T00:00:00.000Z',
              endDate: '2022-07-25T00:00:00.000Z',
            },
          });
        });
        it('should have bgPrefs for given units', () => {
          assert.deepEqual(opts.bgPrefs, getBGPrefs(mmolLUnits));
        });
        it('should have initial as true', () => {
          assert.equal(opts.initial, true);
        });
        it('should have endDate as given', () => {
          assert.equal(opts.endDate, '2022-07-25T00:00:00.000Z');
        });
        it('should have startDate as given if dates are >= 30 day difference', () => {
          assert.equal(opts.startDate, '2022-06-25T00:00:00.000Z');
        });
      });
    });
    describe('and dates have a less than 30 day difference', () => {
      let opts;
      before(() => {
        opts = getUserDataQueryOptions({
          bgUnits: mmolLUnits,
          dates: {
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-10T00:00:00.000Z',
          },
        });
      });
      it('should have bgPrefs for given units', () => {
        assert.deepEqual(opts.bgPrefs, getBGPrefs(mmolLUnits));
      });
      it('should have initial as true', () => {
        assert.equal(opts.initial, true);
      });
      it('should have endDate as given', () => {
        assert.equal(opts.endDate, '2022-07-10T00:00:00.000Z');
      });
      it('should have startDate as 30 days prior to set end date', () => {
        assert.equal(opts.startDate, '2022-06-10T00:00:00.000Z');
      });
    });
  });
  describe('getReportOptions', () => {
    describe('when reportDates set', () => {
      const uploadData = [
        { type: 'upload', time: '2022-05-25T00:00:00.000Z' },
        { type: 'smbg', time: '2022-05-30T00:00:00.000Z' },
        { type: 'upload', time: '2022-06-25T00:00:00.000Z' },
        { type: 'cbg', time: '2022-07-25T00:00:00.000Z' },
        { type: 'upload', time: '2022-07-30T00:00:00.000Z' },
      ];
      const profile = {
        fullName: 'some name',
        patient: {
          birthday: 'dob92',
          mrn: 'mrn123',
        },
      };
      let opts;
      before(() => {
        opts = getReportOptions({
          bgUnits: mgdLUnits,
          data: uploadData,
          reportDates: {
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-25T00:00:00.000Z',
          },
          reports: ['basics'],
          userId: 'user-id',
          timePrefs: getTimePrefs('NZ'),
          userProfile: profile,
        });
      });
      it('should set printOptions', () => {
        const expectedPrintOpts = {
          endpoints: [
            moment('2022-06-24T12:00:00.000Z').toDate(),
            moment('2022-07-25T11:59:59.998Z').toDate(),
          ],
          disabled: false,
        };
        assert.deepEqual(opts.printOptions, {
          agp: expectedPrintOpts,
          basics: expectedPrintOpts,
          bgLog: expectedPrintOpts,
          daily: expectedPrintOpts,
          settings: { disabled: false },
          patient: {
            permissions: {},
            userid: 'user-id',
            profile,
            settings: {},
          },
        });
      });
      it('should set queries for basics only', () => {
        assert.equal(Object.keys(opts.queries).length, 1);
        assert.equal(Object.keys(opts.queries).includes('basics'), true);
      });
    });
  });
  describe('getDateRangeByReport', () => {
    describe('when dates set', () => {
      let dateRange;
      let expectedEndDate;
      let expectedStartDate;
      before(() => {
        dateRange = getDateRangeByReport({
          timezoneName: 'UTC',
          reportDates: {
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-25T00:00:00.000Z',
          },
        });
        expectedEndDate = moment('2022-07-25T00:00:00.000Z')
          .tz('UTC')
          .endOf('day')
          .subtract(1, 'ms');
        expectedStartDate = moment('2022-06-25T00:00:00.000Z')
          .tz('UTC')
          .startOf('day');
      });
      it('should set agp start and end dates', () => {
        assert.deepEqual(dateRange.agp, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set daily start and end dates', () => {
        assert.deepEqual(dateRange.daily, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set bgLog start and end dates', () => {
        assert.deepEqual(dateRange.bgLog, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
      it('should set basics start and end dates', () => {
        assert.deepEqual(dateRange.basics, {
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
    });
    describe('when dates set less than 30 days apart', () => {
      let dateRange;
      before(() => {
        dateRange = getDateRangeByReport({
          timezoneName: 'UTC',
          reportDates: {
            startDate: '2022-06-25T00:00:00.000Z',
            endDate: '2022-07-10T00:00:00.000Z',
          },
        });
      });
      it('should set agp start and end 15 days apart', () => {
        assert.deepEqual(dateRange.agp.endDate.diff(dateRange.agp.startDate, 'days'), 15);
      });
      it('should set daily start and end 15 days apart', () => {
        assert.deepEqual(dateRange.daily.endDate.diff(dateRange.daily.startDate, 'days'), 15);
      });
      it('should set bgLog start and end 30 days apart', () => {
        assert.deepEqual(dateRange.bgLog.endDate.diff(dateRange.bgLog.startDate, 'days'), 30);
      });
      it('should set basics start and end dates 15 days apart', () => {
        assert.deepEqual(dateRange.basics.endDate.diff(dateRange.basics.startDate, 'days'), 15);
      });
    });
  });
});
