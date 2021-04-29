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
import path from 'path';
import crypto from 'crypto';
import mkdirp from 'mkdirp';
import events from 'events';
import program from 'commander';
import es from 'event-stream';
import * as CSV from 'csv-string';
import TidepoolDataTools from './data-tools.js';

function convert(command) {
  if (!command.inputTidepoolData) command.help();

  const inFilename = path.basename(command.inputTidepoolData, '.json');
  const outFilename = path.join(command.outputDataPath,
    crypto
      .createHash('sha256')
      .update(`${inFilename}${command.salt}`)
      .digest('hex'));

  const readStream = fs.createReadStream(command.inputTidepoolData);

  readStream.on('error', () => {
    console.error(`Could not read input file '${command.inputTidepoolData}'`);
    process.exit(1);
  });

  readStream.on('open', () => {
    if (!fs.existsSync(command.outputDataPath)) {
      mkdirp.sync(command.outputDataPath, (err) => {
        if (err) {
          console.error(`Could not create export output path '${command.outputDataPath}'`);
          process.exit(1);
        }
      });
    }

    let counter = 0;

    // Data processing
    const processorConfig = { bgUnits: command.units };

    events.EventEmitter.defaultMaxListeners = 3;
    const processingStream = readStream
      .pipe(TidepoolDataTools.jsonParser())
      .pipe(TidepoolDataTools.splitPumpSettingsData())
      .pipe(TidepoolDataTools.tidepoolProcessor(processorConfig));

    events.EventEmitter.defaultMaxListeners += 1;
    processingStream
      .pipe(es.mapSync(() => {
        counter += 1;
      }));

    // JSON
    if (_.includes(command.outputFormat, 'json') || _.includes(command.outputFormat, 'all')) {
      events.EventEmitter.defaultMaxListeners += 2;
      const jsonStream = fs.createWriteStream(`${outFilename}.json`);
      processingStream
        .pipe(TidepoolDataTools.jsonStreamWriter())
        .pipe(jsonStream);
    }

    // Single CSV
    if (_.includes(command.outputFormat, 'csv') || _.includes(command.outputFormat, 'all')) {
      events.EventEmitter.defaultMaxListeners += 2;
      const csvStream = fs.createWriteStream(`${outFilename}.csv`);
      csvStream.write(CSV.stringify(TidepoolDataTools.allFields));
      processingStream
        .pipe(es.mapSync(
          (data) => CSV.stringify(TidepoolDataTools.allFields.map((field) => data[field] || '')),
        ))
        .pipe(csvStream);
    }

    // Multiple CSVs
    if (_.includes(command.outputFormat, 'csvs') || _.includes(command.outputFormat, 'all')) {
      if (!fs.existsSync(outFilename)) {
        fs.mkdirSync(outFilename);
      }
      Object.keys(config).forEach((key) => {
        const csvStream2 = fs.createWriteStream(`${outFilename}/${TidepoolDataTools.typeDisplayName(key)}.csv`);
        csvStream2.write(CSV.stringify(Object.keys(config[key].fields)));
        events.EventEmitter.defaultMaxListeners += 2;
        processingStream
          // eslint-disable-next-line consistent-return
          .pipe(es.mapSync((data) => {
            if (data.type === key) {
              return CSV.stringify(Object.keys(config[key].fields).map((field) => data[field] || ''));
            }
          }))
          .pipe(csvStream2);
      });
    }

    // XLSX
    if (_.includes(command.outputFormat, 'xlsx') || _.includes(command.outputFormat, 'all')) {
      const xlsxStream = fs.createWriteStream(`${outFilename}.xlsx`);

      events.EventEmitter.defaultMaxListeners += 1;
      processingStream
        .pipe(TidepoolDataTools.xlsxStreamWriter(xlsxStream, processorConfig));
    }

    readStream.on('end', () => {
      console.info(`Exported ${counter} records.`);
    });
  });
}

/*
function getData() {
  // Implement this command
}
*/

if (require.main === module) {
  program
    .name('tidepool-data-tools')
    .version('0.1.0');

  let commandInvoked = false;

  program
    .command('convert')
    .description('Convert data between different formats')
    .option('-i, --input-tidepool-data <file>', 'csv, xlsx, or json file that contains Tidepool data')
    .option('-c, --config <file>', 'a JSON file that contains the field export configuration')
    .option('-u, --units <units>', 'BG Units (mg/dL|mmol/L)', (value) => {
      if (_.indexOf(['mmol/L', 'mg/dL'], value) < 0) {
        console.error('Units must be "mg/dL" or "mmol/L"');
        process.exit(1);
      }
      return value;
    }, 'mmol/L')
    .option('--salt <salt>', 'salt used in the hashing algorithm', '')
    .option('-o, --output-data-path <path>', 'the path where the data is exported',
      path.join(__dirname, 'example-data', 'export'))
    .option('-f, --output-format <format>', 'the format of file to export to. Can be xlsx, csv, csvs, json or all. Can be specified multiple times', (val, list) => {
      if (list[0] === 'all' && list.length === 1) {
        list.splice(0);
      }
      list.push(val);
      return list;
    }, ['all'])
    // TODO: Implement options below this TODO
    .option('--start-date [date]', 'filter data by startDate')
    .option('--end-date [date]', 'filter data by endDate')
    .option('--merge-wizard-data', 'option to merge wizard data with bolus data. Default is true')
    .option(
      '--filterByDatesExceptUploadsAndSettings',
      'upload and settings data can occur before and after start and end dates, so include ALL upload and settings data in export',
    )
    .action((command, options) => {
      convert(command, options);
      commandInvoked = true;
    });

  /*
  program
    .command('getdata')
    .description('Get data from the Tidepool API')
    .option('-e, --env <envirnoment>',
      'Environment to pull the Tidepool data from. dev, stg, int or prd')
    .action((command, options) => {
      getData(command, options);
      commandInvoked = true;
    });
  */

  program
    .parse(process.argv);

  if (!commandInvoked) {
    program.outputHelp();
  }
}
