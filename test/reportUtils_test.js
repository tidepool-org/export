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
const buildDataQueries = reportUtils.__get__('buildDataQueries');
const getQueryOptions = reportUtils.__get__('getQueryOptions');
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
        buildDataQueries(mmolLUnits, getTimePrefs(), reportTypes.settings),
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
        buildDataQueries(mmolLUnits, getTimePrefs(), reportTypes.basics),
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
        buildDataQueries(mgdLUnits, getTimePrefs('NZ'), reportTypes.daily),
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
        buildDataQueries(mgdLUnits, getTimePrefs(), reportTypes.agp),
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
        buildDataQueries(mmolLUnits, getTimePrefs(), reportTypes.bgLog),
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
        allReportQueries = buildDataQueries(
          mmolLUnits,
          getTimePrefs(),
          reportTypes.all,
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
          Object.keys(buildDataQueries(mmolLUnits, getTimePrefs())).length,
          5,
        );
      });
    });
  });
  describe('getQueryOptions', () => {
    describe('when dates set from given data', () => {
      const uploadData = [
        { type: 'upload', time: '2022-05-25T00:00:00.000Z' },
        { type: 'smbg', time: '2022-05-30T00:00:00.000Z' },
        { type: 'upload', time: '2022-06-25T00:00:00.000Z' },
        { type: 'cbg', time: '2022-07-25T00:00:00.000Z' },
        { type: 'upload', time: '2022-07-30T00:00:00.000Z' },
      ];
      let opts;
      before(() => {
        opts = getQueryOptions({
          units: mgdLUnits,
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
    describe('when dates given', () => {
      let opts;
      before(() => {
        opts = getQueryOptions({
          units: mmolLUnits,
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
      it('should have startDate as given', () => {
        assert.equal(opts.startDate, '2022-06-25T00:00:00.000Z');
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
  });
});
