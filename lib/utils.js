import client, { Counter, Registry } from 'prom-client';
import _ from 'lodash';
import axios from 'axios';

const { defaultTo, cloneDeep } = _;
const { get } = axios;

const register = new Registry();

const { collectDefaultMetrics } = client;
collectDefaultMetrics({ register });

const createCounter = (name, help, labelNames) => new Counter({
  name,
  help,
  labelNames,
  registers: [register],
});

function getSessionHeader(request) {
  if (request.headers['x-tidepool-session-token']) {
    return {
      'x-tidepool-session-token': request.headers['x-tidepool-session-token'],
    };
  }
  return {};
}

const exportTimeout = defaultTo(
  parseInt(process.env.EXPORT_TIMEOUT, 10),
  120000,
);
const bunyan = await import('bunyan');
const baseLog = bunyan.createLogger({
  name: 'data-export-service',
});

function logMaker(filename, extraObjects) {
  const extras = cloneDeep(extraObjects == null ? {} : extraObjects);
  extras.srcFile = filename;

  return baseLog.child(extras);
}

const mmolLUnits = 'mmol/L';
const mgdLUnits = 'mg/dL';

async function getServerTime() {
  try {
    const resp = await get(`${process.env.API_HOST}/v1/time`);
    return resp.data.data.time;
  } catch (err) {
    throw new Error(
      `Error fetching server time: ${err.message}\n${err.stack}`,
      { cause: err },
    );
  }
}

async function fetchUserData(userId, config) {
  const fetchConfig = config;
  const controller = new AbortController();
  fetchConfig.signal = controller.signal;
  try {
    const resp = await get(`${process.env.API_HOST}/data/${userId}`, fetchConfig);
    return resp.data;
  } catch (err) {
    controller.abort('Data fetch timed out.');
    throw new Error(`Error fetching user data: ${err.message}\n${err.stack}`, {
      cause: err,
    });
  }
}

export default {
  fetchUserData,
  getSessionHeader,
  getServerTime,
  createCounter,
  exportTimeout,
  logMaker,
  mmolLUnits,
  mgdLUnits,
  register,
};

export {
  fetchUserData,
  getSessionHeader,
  getServerTime,
  createCounter,
  exportTimeout,
  logMaker,
  mmolLUnits,
  mgdLUnits,
  register,
};
