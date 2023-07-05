import { Counter, Registry } from 'prom-client';
import _ from 'lodash';
import axios from 'axios';

const client = require('prom-client');

export const register = new Registry();

const { collectDefaultMetrics } = client;
collectDefaultMetrics({ register });

export const createCounter = (name, help, labelNames) => new Counter({
  name,
  help,
  labelNames,
  registers: [register],
});

export function getHeaders(request) {
  if (request.headers['x-tidepool-session-token']) {
    return {
      headers: {
        'x-tidepool-session-token': request.headers['x-tidepool-session-token'],
      },
    };
  }
  return {};
}

export const exportTimeout = _.defaultTo(
  parseInt(process.env.EXPORT_TIMEOUT, 10),
  120000,
);

const baseLog = require('bunyan').createLogger({
  name: 'data-export-service',
});

export function logMaker(filename, extraObjects) {
  const extras = _.cloneDeep(extraObjects == null ? {} : extraObjects);
  extras.srcFile = filename;

  return baseLog.child(extras);
}

export const mmolLUnits = 'mmol/L';
export const mgdLUnits = 'mg/dL';

export async function getServerTime() {
  const resp = await axios.get(`${process.env.API_HOST}/v1/time`);
  return resp.data.data.time;
}

export async function fetchUserData(userId, params, headers) {
  const resp = await axios
    .get(`${process.env.API_HOST}/data/${userId}`, {
      params,
      headers,
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.log('error fteching user data', err);
    });
  return resp.data;
}
