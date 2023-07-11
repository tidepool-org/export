/* eslint-disable no-underscore-dangle */

const mocha = require('mocha');
const rewire = require('rewire');

const { describe, it } = mocha;
const assert = require('assert');

const reportUtils = rewire('../lib/reportUtils');
const { mmolLUnits, mgdLUnits } = require('../lib/utils');

const reportDataTypes = reportUtils.__get__('reportDataTypes');
const reportTypes = reportUtils.__get__('reportTypes');
const getTimePrefs = reportUtils.__get__('getTimePrefs');
const getBGPrefs = reportUtils.__get__('getBGPrefs');

describe('reportUtils', () => {
  describe('reportDataTypes', () => {
    it('should have all required data types for query', () => {
      assert.deepEqual(reportDataTypes, ['cbg',
        'smbg',
        'basal',
        'bolus',
        'wizard',
        'food',
        'pumpSettings',
        'upload']);
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
      assert.deepEqual(
        getBGPrefs(),
        {
          bgUnits: mmolLUnits,
          ...mmolLClasses,
        },
      );
    });
    it('should use mmol/L when mmol/L units passed', () => {
      assert.deepEqual(
        getBGPrefs(mmolLUnits),
        {
          bgUnits: mmolLUnits,
          ...mmolLClasses,
        },
      );
    });
    it('should use mg/dL when mg/dL units passed', () => {
      assert.deepEqual(
        getBGPrefs(mgdLUnits),
        {
          bgUnits: mgdLUnits,
          ...mgdLClasses,
        },
      );
    });
    it('should use default when unmatched units given', () => {
      assert.deepEqual(
        getBGPrefs('g'),
        {
          bgUnits: mmolLUnits,
          ...mmolLClasses,
        },
      );
    });
  });
  describe('getTimePrefs', () => {
    it('should default to UTC', () => {
      assert.deepEqual(
        getTimePrefs(),
        {
          timezoneAware: true,
          timezoneName: 'UTC',
        },
      );
    });
    it('should set timezoneName name when passed', () => {
      assert.deepEqual(
        getTimePrefs('NZ'),
        {
          timezoneAware: true,
          timezoneName: 'NZ',
        },
      );
    });
  });
});
