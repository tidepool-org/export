// Tests that getUserReportsHandler forwards the glycemic-range query params to
// the Report unchanged. Parsing of the CSV-encoded thresholds is Report's job
// (via lib/glycemicRanges.mjs parseThresholds), not the handler's.
// Each test loads the handler with fresh mocks via jest.isolateModules to avoid
// hoisting issues with ESM default-export mocks.

const mockGenerateFn = jest.fn().mockResolvedValue({
  blob: {
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(4)),
  },
});

const mockReportConstructor = jest.fn().mockImplementation(() => ({
  generate: mockGenerateFn,
}));

function makeReq(query = {}) {
  return {
    params: { userid: 'user-123' },
    query: {
      bgUnits: 'mmol/L',
      tzName: 'UTC',
      reports: ['all'],
      ...query,
    },
    setTimeout: jest.fn(),
  };
}

function makeRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    emit: jest.fn(),
  };
}

async function invokeHandler(query) {
  let getUserReportsHandler;
  jest.isolateModules(() => {
    jest.doMock('../lib/report.mjs', () => ({
      __esModule: true,
      default: { Report: mockReportConstructor },
    }));
    jest.doMock('../lib/utils.mjs', () => ({
      getSessionHeader: jest.fn().mockReturnValue({}),
      createCounter: jest.fn().mockReturnValue({ inc: jest.fn() }),
      exportTimeout: 1000,
      logMaker: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      }),
    }));
    // eslint-disable-next-line global-require
    getUserReportsHandler = require('../lib/handlers/getUserReportsHandler.mjs').default;
  });

  mockReportConstructor.mockClear();
  const middleware = getUserReportsHandler();
  const req = makeReq(query);
  const res = makeRes();
  jest.useFakeTimers();
  const promise = middleware(req, res);
  jest.runAllTimers();
  jest.useRealTimers();
  await promise;

  if (res.status.mock.calls.length > 0) {
    const [statusCode] = res.status.mock.calls[0];
    const [{ message } = {}] = res.json.mock.calls[0] || [{}];
    throw new Error(`Handler returned status ${statusCode}: ${message}`);
  }
  expect(mockReportConstructor).toHaveBeenCalled();
  return mockReportConstructor.mock.calls[0][2]; // reportDetail arg
}

describe('getUserReportsHandler – glycemic-range query params', () => {
  it('forwards glycemicRangeType and glycemicRangePreset unchanged', async () => {
    const reportDetail = await invokeHandler({
      glycemicRangeType: 'preset',
      glycemicRangePreset: 'adaPregnancyType1',
    });
    expect(reportDetail.glycemicRangeType).toBe('preset');
    expect(reportDetail.glycemicRangePreset).toBe('adaPregnancyType1');
  });

  it('leaves glycemicRangeThresholds undefined when absent', async () => {
    const reportDetail = await invokeHandler({});
    expect(reportDetail.glycemicRangeThresholds).toBeUndefined();
  });

  it('forwards a single CSV-encoded threshold string unchanged', async () => {
    const raw = 'name,low,upperBound.value,70,upperBound.units,mg/dL,inclusive,true';
    const reportDetail = await invokeHandler({ glycemicRangeThresholds: raw });
    expect(reportDetail.glycemicRangeThresholds).toBe(raw);
  });

  it('forwards a repeated (array) threshold param unchanged', async () => {
    const thresholds = [
      'name,low,upperBound.value,70,upperBound.units,mg/dL,inclusive,true',
      'name,high,upperBound.value,180,upperBound.units,mg/dL,inclusive,false',
    ];
    const reportDetail = await invokeHandler({ glycemicRangeThresholds: thresholds });
    expect(reportDetail.glycemicRangeThresholds).toEqual(thresholds);
  });
});
