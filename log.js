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
import bunyan from 'bunyan';

function ConsoleRawStream() {}
ConsoleRawStream.prototype.write = function (rec) {
    const content = JSON.parse(rec);

    // Prefix all JSON keys with 'dbl_' for some k8s parsing log reason.
    for (const key in content) {
      const value = content[key];
      delete content[key];

      const newKey = `dbl_${key}`;
      if (key === 'level') {
        content.dbl_level = bunyan.nameFromLevel[value];
      } else {
        content[newKey] = value;
      }
    }

    const message = JSON.stringify(content);
    if (rec.level < bunyan.INFO) {
        console.log(message);
    } else if (rec.level < bunyan.WARN) {
        console.info(message);
    } else if (rec.level < bunyan.ERROR) {
        console.warn(message);
    } else {
        console.error(message);
    }
};

const baseLog = bunyan.createLogger({
  name: 'data-export-service',
  stream: new ConsoleRawStream(),
});

function createLogger(filename, extraObjects = {}) {
  const extras = _.cloneDeep(extraObjects);
  extras.srcFile = filename;
  return baseLog.child(extras);
}

export default createLogger;
