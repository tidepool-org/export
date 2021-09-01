/*
 == BSD2 LICENSE ==
 Copyright (c) 2017, Tidepool Project

 This program is free software; you can redistribute it and/or modify it under
 the terms of the associated License, which is identical to the BSD 2-Clause
 License as published by the Open Source Initiative at opensource.org.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE. See the License for more details.

 You should have received a copy of the License along with this program; if
 not, you can obtain one from Tidepool Project at tidepool.org.
 == BSD2 LICENSE ==
*/
import _ from 'lodash';
import fs from 'fs';
import moment from 'moment';
import JSONStream from 'JSONStream';
import es from 'event-stream';
import flatten from 'flat';
import Excel from 'exceljs';
import createLogger from './log.js';

const MMOL_TO_MGDL = 18.01577;
const EXPORT_ERROR = 'Due to the size of your export, Tidepool was unable to retrieve all of your data at one time. '
                   + 'If your data appears incomplete, try the export again using a smaller date range.';

const log = createLogger('data-tools', { level: process.env.DEBUG_LEVEL || 'debug' });
let config = null;

export default class TidepoolDataTools {
  static initCache() {
    TidepoolDataTools.cache = {
      allFields: _.chain(config)
        .flatMap((field) => Object.keys(field.fields))
        .uniq()
        .sort()
        .value(),
      fieldsToStringify: _.mapValues(
        config, (item) => Object.keys(_.pickBy(item.fields, (n) => n.stringify)),
      ),
      typeDisplayName: _.mapValues(config, (item, key) => item.displayName || _.chain(key).replace(/([A-Z])/g, ' $1').startCase().value()),
      fieldHeader: _.mapValues(
        config, (type) => _.mapValues(type.fields,
          (item, key) => item.header || _.chain(key).replace(/([A-Z])/g, ' $1').replace('.', ' ').startCase()
            .value()),
      ),
      fieldHidden: _.mapValues(
        config, (type) => _.mapValues(type.fields, (item) => item.hidden || false),
      ),
      fieldWidth: _.mapValues(
        config, (type) => _.mapValues(type.fields, (item) => item.width || 22),
      ),
      cellFormat: _.mapValues(
        config, (type) => _.mapValues(type.fields, (item) => item.cellFormat || undefined),
      ),
      transformData:
        _.mapValues(config,
          (item) => (item.transform ? _.template(item.transform, { imports: { moment } }) : undefined)),
    };
  }

  static typeDisplayName(type) {
    return this.cache.typeDisplayName[type];
  }

  static fieldHeader(type, field) {
    return this.cache.fieldHeader[type][field];
  }

  static fieldHidden(type, field) {
    return this.cache.fieldHidden[type][field];
  }

  static fieldWidth(type, field) {
    return this.cache.fieldWidth[type][field];
  }

  static cellFormat(type, field, data = {}) {
    try {
      return _.template(this.cache.cellFormat[type][field])(data);
    } catch (err) {
      log.error('Error in cellFormat with data', { data });
      log.error('Template processing error', { err });
      return '';
    }
  }

  static fieldsToStringify(type) {
    return this.cache.fieldsToStringify[type];
  }

  static get allFields() {
    return this.cache.allFields;
  }

  static stringifyFields(data) {
    _.each(
      _.chain(data)
        .pick(this.fieldsToStringify(data.type))
        .keys()
        .value(),
      (item) => _.set(data, item, JSON.stringify(data[item])),
    );
  }

  static addLocalTime(data) {
    if (data.time) {
      const localTime = new Date(data.time);
      localTime.setUTCMinutes(localTime.getUTCMinutes() + (data.timezoneOffset || 0));
      _.assign(data, {
        localTime,
      });
    }
  }

  static transformData(data, options = {}) {
    const transformFunction = this.cache.transformData[data.type];
    if (transformFunction) {
      try {
        _.assign(data, transformFunction({ data, options }));
      } catch (err) {
        log.error('Error in transformData with data', { data });
        log.error('Template processing error', { err });
      }
    }
  }

  static normalizeBgData(data, units) {
    // TODO: conversion should be done with config and a mapping function
    let conversion = 1;
    if (units === 'mg/dL') {
      conversion = MMOL_TO_MGDL;
    }
    if (data.units && data.type !== 'bloodKetone') {
      if (typeof data.units === 'string' && data.units !== units) {
        _.set(data, 'units', units);
      }
      if (typeof data.units === 'object' && data.units.bg && data.units.bg !== units) {
        _.set(data, 'units.bg', units);
      }
    }
    switch (data.type) {
      case 'cbg':
      case 'smbg':
      case 'deviceEvent':
        if (data.value) {
          _.assign(data, { value: data.value * conversion });
        }
        break;
      case 'wizard':
        if (data.bgInput) {
          _.assign(data, { bgInput: data.bgInput * conversion });
        }
        if (data.insulinSensitivity) {
          _.assign(data, { insulinSensitivity: data.insulinSensitivity * conversion });
        }
        if (data.bgTarget) {
          const bgTarget = _(_.cloneDeep(typeof data.bgTarget === 'string' ? JSON.parse(data.bgTarget) : data.bgTarget))
            .mapValues((value, key) => (_.includes(['high', 'low', 'target', 'range'], key) ? value * conversion : value))
            .value();
          _.assign(data, {
            bgTarget: typeof data.bgTarget === 'string' ? JSON.stringify(bgTarget) : bgTarget,
          });
        }
        break;
      case 'pumpSettings.bgTarget':
      case 'pumpSettings.bgTargets':
        if (data.bgTarget) {
          const bgTarget = _(_.cloneDeep(typeof data.bgTarget === 'string' ? JSON.parse(data.bgTarget) : data.bgTarget))
            .mapValues((value, key) => (_.includes(['high', 'low', 'target', 'range'], key) ? value * conversion : value))
            .value();
          _.assign(data, {
            bgTarget: typeof data.bgTarget === 'string' ? JSON.stringify(bgTarget) : bgTarget,
          });
        }
        break;
      case 'pumpSettings.insulinSensitivity':
      case 'pumpSettings.insulinSensitivities':
        if (data.insulinSensitivity) {
          const isf = _.cloneDeep(typeof data.insulinSensitivity === 'string' ? JSON.parse(data.insulinSensitivity) : data.insulinSensitivity);
          if (isf.amount) {
            _.assign(isf, { amount: isf.amount * conversion });
          }
          _.assign(data, {
            insulinSensitivity: typeof data.insulinSensitivity === 'string' ? JSON.stringify(isf) : isf,
          });
        }
        break;
      default:
        break;
    }
  }

  static splitPumpSettingsData() {
    return es.through(
      function write(data) {
        if (data.type === 'pumpSettings') {
          this.pause();
          const commonFields = _.omit(data, ['basalSchedules', 'bgTarget', 'bgTargets',
            'carbRatio', 'carbRatios', 'insulinSensitivity', 'insulinSensitivities', 'units']);
          /* eslint-disable no-restricted-syntax */
          for (const scheduleName of _.keys(data.basalSchedules)) {
            for (const basalSchedule of data.basalSchedules[scheduleName]) {
              const emitData = _.assign({ scheduleName, basalSchedule }, commonFields);
              emitData.type = 'pumpSettings.basalSchedules';
              this.emit('data', emitData);
            }
          }
          if (data.bgTarget) {
            for (const bgTarget of data.bgTarget) {
              const emitData = _.assign({ bgTarget, units: data.units }, commonFields);
              emitData.type = 'pumpSettings.bgTarget';
              this.emit('data', emitData);
            }
          }
          if (data.bgTargets) {
            for (const scheduleName of _.keys(data.bgTargets)) {
              for (const bgTarget of data.bgTargets[scheduleName]) {
                const emitData = _.assign({ bgTarget, scheduleName, units: data.units },
                  commonFields);
                emitData.type = 'pumpSettings.bgTargets';
                this.emit('data', emitData);
              }
            }
          }
          if (data.carbRatio) {
            for (const carbRatio of data.carbRatio) {
              const emitData = _.assign({ carbRatio, units: data.units }, commonFields);
              emitData.type = 'pumpSettings.carbRatio';
              this.emit('data', emitData);
            }
          }
          if (data.carbRatios) {
            for (const scheduleName of _.keys(data.carbRatios)) {
              for (const carbRatio of data.carbRatios[scheduleName]) {
                const emitData = _.assign({ carbRatio, scheduleName, units: data.units },
                  commonFields);
                emitData.type = 'pumpSettings.carbRatios';
                this.emit('data', emitData);
              }
            }
          }
          if (data.insulinSensitivity) {
            for (const insulinSensitivity of data.insulinSensitivity) {
              const emitData = _.assign({ insulinSensitivity, units: data.units }, commonFields);
              emitData.type = 'pumpSettings.insulinSensitivity';
              this.emit('data', emitData);
            }
          }
          if (data.insulinSensitivities) {
            for (const scheduleName of _.keys(data.insulinSensitivities)) {
              for (const insulinSensitivity of data.insulinSensitivities[scheduleName]) {
                const emitData = _.assign({ insulinSensitivity, scheduleName, units: data.units },
                  commonFields);
                emitData.type = 'pumpSettings.insulinSensitivities';
                this.emit('data', emitData);
              }
            }
          }
          /* eslint-enable no-restricted-syntax */
          this.resume();
        } else {
          this.emit('data', data);
        }
      },
      function end() {
        this.emit('end');
      },
    );
  }

  static flatMap(data, toFields) {
    return _.pick(flatten(data, {
      maxDepth: 2,
    }), toFields);
  }

  static jsonParser() {
    return JSONStream.parse('*');
  }

  static tidepoolProcessor(processorConfig = {}) {
    return es.mapSync((data) => {
      // Synthesize the 'localTime' field
      this.addLocalTime(data);
      // Stringify objects configured with { "stringify": true }
      this.stringifyFields(data);
      // Convert BGL data to mg/dL if configured to do so
      if (processorConfig.bgUnits) {
        this.normalizeBgData(data, processorConfig.bgUnits);
      }
      this.transformData(data, processorConfig);
      // Return flattened layout mapped to all fields in the config
      return this.flatMap(data, this.allFields);
    });
  }

  static jsonStreamWriter() {
    // Return a "compact" JSON Stream
    const jsonStream = JSONStream.stringify('[', ',', ']');

    jsonStream.cancel = () => {
      jsonStream.end({ exportError: EXPORT_ERROR });
      jsonStream.destroy();
    };

    return jsonStream;
  }

  static xlsxStreamWriter(outStream, streamConfig = { bgUnits: 'mmol/L' }) {
    const options = {
      stream: outStream,
      useStyles: true,
      useSharedStrings: false,
    };
    const wb = new Excel.stream.xlsx.WorkbookWriter(options);

    // Create the error sheet first, and hide it.
    // We create this up front, so that if the user experiences an error, this is the
    // first sheet they see when they open the XLSX.
    const errorSheet = wb.addWorksheet('EXPORT ERROR');
    (async () => {
      await errorSheet.addRow([EXPORT_ERROR]).commit();
    })();

    const xlsxStream = es.through(
      (data) => {
        if (data.type) {
          const sheetName = this.typeDisplayName(data.type);
          if (_.isUndefined(sheetName)) {
            log.warn(`Configuration ignores data type: '${data.type}'`);
            return;
          }
          let sheet = wb.getWorksheet(sheetName);
          if (_.isUndefined(sheet)) {
            sheet = wb.addWorksheet(sheetName, {
              views: [{
                state: 'frozen',
                xSplit: 0,
                ySplit: 1,
                topLeftCell: 'A2',
                activeCell: 'A2',
              }],
            });
            sheet.columns = Object.keys(config[data.type].fields).map((field) => ({
              header: this.fieldHeader(data.type, field),
              key: field,
              hidden: this.fieldHidden(data.type, field),
              width: this.fieldWidth(data.type, field),
              style: { numFmt: this.cellFormat(data.type, field, streamConfig) },
            }));
            sheet.getRow(1).font = {
              bold: true,
            };
          }
          // Convert timestamps to Excel Dates
          if (data.time) {
            _.assign(data, {
              time: moment(data.time).toDate(),
            });
          }
          if (data.deviceTime) {
            _.assign(data, {
              deviceTime: moment.utc(data.deviceTime).toDate(),
            });
          }
          if (data.computerTime) {
            _.assign(data, {
              computerTime: moment.utc(data.computerTime).toDate(),
            });
          }
          sheet.addRow(data).commit();
        } else {
          log.warn('No data type specified', { data });
        }
      },
      async function end() {
        // Worksheet 1 will always exist.
        // It's the ERROR sheet that we create at the beginning of this function.
        if (wb.getWorksheet(2) === undefined) {
          const emptySheet = wb.addWorksheet('NO DATA');
          await emptySheet.addRow(['Data is not available within the specified date range.']).commit();
        }
        // Hide the ERROR sheet on success
        errorSheet.state = 'veryHidden';
        await wb.commit();
        this.emit('end');
      },
    );

    xlsxStream.cancel = async () => {
      xlsxStream.destroy();
      // Close out the XLSX file without hiding the ERROR sheet.
      await wb.commit();
    };

    return xlsxStream;
  }
}

fs.promises.readFile('./config.json', { encoding: 'utf-8' }).then((configString) => {
  config = JSON.parse(configString);
  log.info('config.json successfully loaded');
  TidepoolDataTools.initCache();
}).catch((reason) => {
  log.error('Failed to read config.json', { reason });
});
