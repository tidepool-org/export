/* eslint-disable no-underscore-dangle */

import moment from 'moment-timezone';

import reports from '../lib/report.mjs';

import { mmolLUnits, mgdLUnits, logMaker } from '../lib/utils.mjs';

const { Report } = reports;

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

  beforeAll(() => {
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
    const data = [];
    const cbgNonAutoNonOverride = {
      data: {
        metaData: {
          bgSources: {
            current: 'cbg',
          },
          latestPumpUpload: {
            isAutomatedBasalDevice: false,
            isSettingsOverrideDevice: false,
          },
        },
      },
    };

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

      expect(settingReport.buildReportQueries({ data })).toEqual({
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

      expect(basicsReport.buildReportQueries(cbgNonAutoNonOverride)).toEqual({
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

      expect(dailyReport.buildReportQueries(cbgNonAutoNonOverride)).toEqual({
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

    it('should return just agpBGM when asked for', () => {
      const agpBGMReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['agpBGM'],
        },
        requestDetail,
      );

      expect(agpBGMReport.buildReportQueries(cbgNonAutoNonOverride)).toEqual({
        agpBGM: {
          aggregationsByDate: 'dataByDate, statsByDate',
          excludedDevices: [],
          bgPrefs: expectedMgdLPref,
          bgSource: 'smbg',
          endpoints: [],
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'averageGlucose',
            'bgExtents',
            'coefficientOfVariation',
            'glucoseManagementIndicator',
            'readingsInRange',
          ],
          timePrefs: expectedTZPrefs,
          types: {
            smbg: {},
          },
        },
      });
    });

    it('should return just agpCGM when asked for', () => {
      const agpCGMReport = new Report(
        testLog,
        userDetails,
        {
          tzName: 'NZ',
          bgUnits: mgdLUnits,
          reports: ['agpCGM'],
        },
        requestDetail,
      );

      expect(agpCGMReport.buildReportQueries(cbgNonAutoNonOverride)).toEqual({
        agpCGM: {
          aggregationsByDate: 'dataByDate, statsByDate',
          excludedDevices: [],
          bgPrefs: expectedMgdLPref,
          bgSource: 'cbg',
          endpoints: [],
          metaData: 'latestPumpUpload, bgSources',
          stats: [
            'averageGlucose',
            'bgExtents',
            'coefficientOfVariation',
            'glucoseManagementIndicator',
            'sensorUsage',
            'timeInRange',
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

      expect(bgLogReport.buildReportQueries(cbgNonAutoNonOverride)).toEqual({
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

      beforeAll(() => {
        allReportQueries = report.buildReportQueries(cbgNonAutoNonOverride);
      });

      it('should return all 6 report queries when asked for', () => {
        expect(Object.keys(allReportQueries).length).toBe(6);
      });

      it('should include basics report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('basics')).toBe(true);
      });

      it('should include bgLog report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('bgLog')).toBe(true);
      });

      it('should include agpBGM report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('agpBGM')).toBe(true);
      });

      it('should include agpCGM report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('agpCGM')).toBe(true);
      });

      it('should include settings report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('settings')).toBe(true);
      });

      it('should include daily report when all report queries when asked for', () => {
        expect(Object.keys(allReportQueries).includes('daily')).toBe(true);
      });

      it('should not include an `all` report type ', () => {
        expect(Object.keys(allReportQueries).includes('all')).toBe(false);
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

        expect(
          Object.keys(
            reportDefaultAll.buildReportQueries(cbgNonAutoNonOverride),
          ).length,
        ).toBe(6);
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

      expect(r.getTimePrefs()).toEqual({
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

      expect(r.getTimePrefs()).toEqual({
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

      expect(r.getBGPrefs()).toEqual(expectedMgdLPref);
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

      expect(r.getBGPrefs()).toEqual(expectedMmoLPref);
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

      beforeAll(() => {
        opts = report.userDataQueryOptions({
          data: uploadData,
        });
      });

      it('should have bgPrefs for given units', () => {
        expect(opts.bgPrefs).toEqual(expectedMmoLPref);
      });

      it('should have initial as true', () => {
        expect(opts.initial).toBe(true);
      });

      it('should have endDate as latest item date + 1 day ', () => {
        expect(opts.endDate).toBe(
          moment(uploadData[4].time).add(1, 'days').toISOString(),
        );
      });

      it('should have startDate as earliest diabetes datum item date - 30 days', () => {
        expect(opts.startDate).toBe(
          moment(uploadData[3].time).subtract(30, 'days').toISOString(),
        );
      });
    });

    describe('when dates params used', () => {
      describe('and dates have a 30 day or greater difference', () => {
        let opts;

        beforeAll(() => {
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
          expect(opts.bgPrefs).toEqual(expectedMmoLPref);
        });

        it('should have initial as true', () => {
          expect(opts.initial).toBe(true);
        });

        it('should have endDate as given', () => {
          expect(opts.endDate).toBe('2022-07-25T00:00:00.000Z');
        });

        it('should have startDate as given if dates are >= 30 day difference', () => {
          expect(opts.startDate).toBe('2022-06-25T00:00:00.000Z');
        });
      });
    });

    describe('and dates have a less than 30 day difference', () => {
      let opts;

      beforeAll(() => {
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
        expect(opts.bgPrefs).toEqual(expectedMmoLPref);
      });

      it('should have initial as true', () => {
        expect(opts.initial).toBe(true);
      });

      it('should have endDate as given', () => {
        expect(opts.endDate).toBe('2022-07-10T00:00:00.000Z');
      });

      it('should have startDate as 30 days prior to set end date', () => {
        expect(opts.startDate).toBe('2022-06-10T00:00:00.000Z');
      });
    });
  });

  describe('getDateRangeByReport', () => {
    describe('when dates set', () => {
      let dateRange;
      let expectedEndDate;
      let expectedStartDate;

      beforeAll(() => {
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
          .startOf('day')
          .add(1, 'day');
        expectedStartDate = moment('2022-06-25T00:00:00.000Z')
          .tz('UTC')
          .add(1, 'day')
          .startOf('day');
      });

      it('should set agpBGM start and end dates', () => {
        expect(dateRange.agpBGM).toEqual({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });

      it('should set agpCGM start and end dates', () => {
        expect(dateRange.agpCGM).toEqual({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });

      it('should set daily start and end dates', () => {
        expect(dateRange.daily).toEqual({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });

      it('should set bgLog start and end dates', () => {
        expect(dateRange.bgLog).toEqual({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });

      it('should set basics start and end dates', () => {
        expect(dateRange.basics).toEqual({
          startDate: expectedStartDate,
          endDate: expectedEndDate,
        });
      });
    });

    describe('when dates set less than 30 days apart', () => {
      let dateRange;

      beforeAll(() => {
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

      it('should set agpBGM start and end 30 days apart', () => {
        expect(
          dateRange.agpBGM.endDate.diff(dateRange.agpBGM.startDate, 'days'),
        ).toBe(30);
      });

      it('should set agpCGM start and end 15 days apart', () => {
        expect(
          dateRange.agpCGM.endDate.diff(dateRange.agpCGM.startDate, 'days'),
        ).toBe(15);
      });

      it('should set daily start and end 15 days apart', () => {
        expect(
          dateRange.daily.endDate.diff(dateRange.daily.startDate, 'days'),
        ).toBe(15);
      });

      it('should set bgLog start and end 30 days apart', () => {
        expect(
          dateRange.bgLog.endDate.diff(dateRange.bgLog.startDate, 'days'),
        ).toBe(30);
      });

      it('should set basics start and end dates 15 days apart', () => {
        expect(
          dateRange.basics.endDate.diff(dateRange.basics.startDate, 'days'),
        ).toBe(15);
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

      beforeAll(() => {
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
            moment('2022-06-25T12:00:00.000Z').toDate(),
            moment('2022-07-25T12:00:00.000Z').toDate(),
          ],
          disabled: false,
        };
        expect(opts.printOptions).toEqual({
          agpBGM: expectedPrintOpts,
          agpCGM: expectedPrintOpts,
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
        expect(Object.keys(opts.queries).length).toBe(6);
        expect(Object.keys(opts.queries).includes('basics')).toBe(true);
        expect(Object.keys(opts.queries).includes('settings')).toBe(true);
        expect(Object.keys(opts.queries).includes('agpBGM')).toBe(true);
        expect(Object.keys(opts.queries).includes('agpCGM')).toBe(true);
        expect(Object.keys(opts.queries).includes('daily')).toBe(true);
        expect(Object.keys(opts.queries).includes('bgLog')).toBe(true);
      });
    });
  });
});

describe('getStatsByChartType', () => {
  const cbgAutoOverride = {
    metaData: {
      bgSources: {
        current: 'cbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: true,
        isSettingsOverrideDevice: true,
      },
    },
  };
  const cbgAutoNonOverride = {
    metaData: {
      bgSources: {
        current: 'cbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: true,
        isSettingsOverrideDevice: false,
      },
    },
  };
  const cbgNonAutoNonOverride = {
    metaData: {
      bgSources: {
        current: 'cbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: false,
        isSettingsOverrideDevice: false,
      },
    },
  };
  const cbgNonAutoOverride = {
    metaData: {
      bgSources: {
        current: 'cbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: false,
        isSettingsOverrideDevice: true,
      },
    },
  };
  const smbgAutoOverride = {
    metaData: {
      bgSources: {
        current: 'smbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: true,
        isSettingsOverrideDevice: true,
      },
    },
  };
  const smbgNonAutoNonOverride = {
    metaData: {
      bgSources: {
        current: 'smbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: false,
        isSettingsOverrideDevice: false,
      },
    },
  };
  const smbgNonAutoOverride = {
    metaData: {
      bgSources: {
        current: 'smbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: false,
        isSettingsOverrideDevice: true,
      },
    },
  };
  const smbgAutoNonOverride = {
    metaData: {
      bgSources: {
        current: 'smbg',
      },
      latestPumpUpload: {
        isAutomatedBasalDevice: true,
        isSettingsOverrideDevice: false,
      },
    },
  };

  const report = new Report(
    logMaker('report_test.js', {
      level: process.env.DEBUG_LEVEL || 'info',
    }),
    {
      userId: '1234',
      fullName: 'Test User',
      dob: '25-10-1997',
      mrn: '12345',
    },
    {
      tzName: 'NZ',
      bgUnits: mmolLUnits,
      reports: ['all'],
    },
    {
      token: 'token',
      sessionHeader: { session: 'stuff' },
    },
  );

  describe('cbg', () => {
    it('should return correct stats for basics chart type with cbg selected and auto and override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'timeInAuto',
        'timeInOverride',
        'carbs',
        'averageDailyDose',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with cbg selected and auto and no override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'timeInAuto',
        'carbs',
        'averageDailyDose',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with cbg selected and no auto and no override', () => {
      const chartType = 'basics';
      const expectedStats = [
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
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with cbg selected and no auto and override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'timeInOverride',
        'carbs',
        'averageDailyDose',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with cbg selected and auto and override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'averageDailyDose',
        'timeInAuto',
        'timeInOverride',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with cbg selected and auto and no override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'averageDailyDose',
        'timeInAuto',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with cbg selected and no auto and no override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'averageDailyDose',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with cbg selected and no auto and override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'sensorUsage',
        'totalInsulin',
        'averageDailyDose',
        'timeInOverride',
        'glucoseManagementIndicator',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with cbg selected and auto and override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'timeInOverride',
        'carbs',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });
    it('should return correct stats for daily chart type with cbg selected and auto and no override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'carbs',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with cbg selected and no auto and no override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'totalInsulin',
        'carbs',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with cbg selected and no auto and override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'timeInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInOverride',
        'carbs',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with cbg selected and auto and override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with cbg selected and auto and no override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with cbg selected and no auto and no override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with cbg selected and no auto and override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with cbg selected and auto and override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with cbg selected and auto and no override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with cbg selected and no auto and no override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with cbg selected and no auto and override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with cbg selected and auto and override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with cbg selected and auto and no override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with cbg selected and no auto and no override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        cbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with cbg selected and no auto and override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, cbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });
  });

  describe('smbg', () => {
    it('should return correct stats for basics chart type with smbg selected and auto and override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'timeInOverride',
        'carbs',
        'averageDailyDose',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with smbg selected and auto and no override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'carbs',
        'averageDailyDose',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with smbg selected and no auto and no override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'carbs',
        'averageDailyDose',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for basics chart type with smbg selected and no auto and override', () => {
      const chartType = 'basics';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInOverride',
        'carbs',
        'averageDailyDose',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with smbg selected and auto and override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'averageDailyDose',
        'timeInAuto',
        'timeInOverride',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with smbg selected and auto and no override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'averageDailyDose',
        'timeInAuto',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with smbg selected and no auto and no override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'averageDailyDose',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for trends chart type with smbg selected and no auto and override', () => {
      const chartType = 'trends';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'averageDailyDose',
        'timeInOverride',
        'standardDev',
        'coefficientOfVariation',
        'bgExtents',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with smbg selected and auto and override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'timeInOverride',
        'carbs',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with smbg selected and auto and no override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInAuto',
        'carbs',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with smbg selected and no auto and no override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'carbs',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for daily chart type with smbg selected and no auto and override', () => {
      const chartType = 'daily';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'totalInsulin',
        'timeInOverride',
        'carbs',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with smbg selected and auto and override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with smbg selected and auto and no override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with smbg selected and no auto and no override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpCGM chart type with smbg selected and no auto and override', () => {
      const chartType = 'agpCGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'sensorUsage',
        'timeInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with smbg selected and auto and override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with smbg selected and auto and no override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with smbg selected and no auto and no override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for agpBGM chart type with smbg selected and no auto and override', () => {
      const chartType = 'agpBGM';
      const expectedStats = [
        'averageGlucose',
        'bgExtents',
        'coefficientOfVariation',
        'glucoseManagementIndicator',
        'readingsInRange',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with smbg selected and auto and override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with smbg selected and auto and no override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, smbgAutoNonOverride);
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with smbg selected and no auto and no override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(
        chartType,
        smbgNonAutoNonOverride,
      );
      expect(stats).toEqual(expectedStats);
    });

    it('should return correct stats for bgLog chart type with smbg selected and no auto and override', () => {
      const chartType = 'bgLog';
      const expectedStats = [
        'readingsInRange',
        'averageGlucose',
        'standardDev',
        'coefficientOfVariation',
      ];
      const stats = report.getStatsByChartType(chartType, smbgNonAutoOverride);
      expect(stats).toEqual(expectedStats);
    });
  });
});

describe('Report.getLatestInsulinAndPumpSettingsParams', () => {
  it('returns pumpSettings params for latest in-range insulin uploadId bounded by insulin time', () => {
    const startDate = '2025-01-01T00:00:00.000Z';
    const endDate = '2025-01-31T00:00:00.000Z';

    const latestInsulinUploadId = 'upload-insulin';
    const latestInsulinTime = '2025-01-30T12:00:00.000Z';

    const userData = [
      { type: 'upload', uploadId: latestInsulinUploadId },
      { type: 'basal', time: '2025-01-10T00:00:00.000Z', uploadId: 'older-upload' },
      { type: 'bolus', time: latestInsulinTime, uploadId: latestInsulinUploadId },
      { type: 'basal', time: '2025-02-01T00:00:00.000Z', uploadId: 'out-of-range' },
    ];

    const { pumpSettingsParams } = Report.getLatestInsulinAndPumpSettingsParams(
      userData,
      startDate,
      endDate,
      'test-token',
      { session: 'stuff' },
    );

    expect(pumpSettingsParams).toEqual({
      type: 'pumpSettings',
      uploadId: latestInsulinUploadId,
      latest: 1,
      endDate: moment.utc(latestInsulinTime).toISOString(),
      restricted_token: 'test-token',
    });
  });

  it('returns null params when no in-range insulin data', () => {
    const startDate = '2025-01-01T00:00:00.000Z';
    const endDate = '2025-01-31T00:00:00.000Z';

    const userData = [
      { type: 'upload', uploadId: 'u1' },
      { type: 'basal', time: '2024-12-31T23:00:00.000Z', uploadId: 'u1' },
    ];

    const { pumpSettingsParams } = Report.getLatestInsulinAndPumpSettingsParams(
      userData,
      startDate,
      endDate,
      'test-token',
      { session: 'stuff' },
    );

    expect(pumpSettingsParams).toBeNull();
  });
});
