import { Counter, Registry } from 'prom-client';
import _ from 'lodash';

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


export function buildHeaders(request) {
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
