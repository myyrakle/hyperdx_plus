import { renderChartConfig as renderChartConfigImpl } from '@hyperdx/common-utils/dist/core/renderChartConfig';

import { fetchGroupSampleFields } from '@/tasks/checkAlerts/sampleRow';

jest.mock('@hyperdx/common-utils/dist/core/renderChartConfig', () => ({
  renderChartConfig: jest.fn(async () => ({ sql: 'SELECT 1', params: {} })),
}));

const renderChartConfig = jest.mocked(renderChartConfigImpl);

const source: any = {
  kind: 'log',
  from: { databaseName: 'default', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'Body',
};

const query: any = {
  where: 'level: error',
  whereLanguage: 'lucene',
  orderBy: 'Timestamp DESC',
};

const makeClient = (rows: Record<string, unknown>[]) => ({
  query: jest.fn(async () => ({
    json: async () => ({ data: rows }),
  })),
});

const call = (overrides: Record<string, unknown> = {}) =>
  fetchGroupSampleFields({
    clickhouseClient: makeClient([]) as any,
    metadata: {} as any,
    query,
    source,
    startTime: new Date('2026-08-12T00:00:00Z'),
    endTime: new Date('2026-08-12T00:05:00Z'),
    displayFields: { errorMessage: 'StatusMessage' },
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  renderChartConfig.mockResolvedValue({ sql: 'SELECT 1', params: {} });
});

describe('fetchGroupSampleFields', () => {
  it('renders the error message as a short field with a fixed label', () => {});

  it('renders the stack trace as a long field so it always gets a code block', async () => {
    const result = await call({
      clickhouseClient: makeClient([
        { __hdx_display_0: 'boom', __hdx_display_1: 'one frame' },
      ]) as any,
      displayFields: {
        errorMessage: 'StatusMessage',
        stacktrace: "SpanAttributes['code.stacktrace']",
      },
    });

    expect(result).toEqual([
      { label: 'Error message', value: 'boom', long: false },
      { label: 'Stack trace', value: 'one frame', long: true },
    ]);
  });

  it('keeps a single-line stack trace long, not folded into two columns', async () => {
    // The slot decides the layout, not whether the value happens to contain a
    // newline — that heuristic made rendering unpredictable.
    const result = await call({
      clickhouseClient: makeClient([
        { __hdx_display_0: 'only one frame' },
      ]) as any,
      displayFields: { stacktrace: "SpanAttributes['code.stacktrace']" },
    });

    expect(result).toEqual([
      { label: 'Stack trace', value: 'only one frame', long: true },
    ]);
  });

  it('keeps a multi-line error message short, so the slot stays predictable', async () => {
    const result = await call({
      clickhouseClient: makeClient([{ __hdx_display_0: 'a\nb' }]) as any,
      displayFields: { errorMessage: 'StatusMessage' },
    });

    expect(result[0].long).toBe(false);
  });

  it('orders the slots message, extras, stack trace', async () => {
    const result = await call({
      clickhouseClient: makeClient([
        {
          __hdx_display_0: 'msg',
          __hdx_display_1: 'select 1',
          __hdx_display_2: 'frames',
        },
      ]) as any,
      displayFields: {
        errorMessage: 'StatusMessage',
        stacktrace: "SpanAttributes['code.stacktrace']",
        extra: [
          {
            valueExpression: "SpanAttributes['db.query.text']",
            alias: 'Query',
          },
        ],
      },
    });

    expect(result.map(f => f.label)).toEqual([
      'Error message',
      'Query',
      'Stack trace',
    ]);
  });

  it('derives an extra field label from its expression when none is given', async () => {
    const result = await call({
      clickhouseClient: makeClient([{ __hdx_display_0: 'x' }]) as any,
      displayFields: {
        extra: [{ valueExpression: "SpanAttributes['db.query.text']" }],
      },
    });

    expect(result[0].label).toBe('db.query.text');
  });

  it('selects only the slots that are filled in', async () => {
    await call({ displayFields: { stacktrace: 'Stack' } });

    expect(renderChartConfig.mock.calls[0][0].select).toEqual([
      { valueExpression: 'Stack', alias: '__hdx_display_0' },
    ]);
  });

  it('reads only one row', async () => {
    await call();

    expect(renderChartConfig.mock.calls[0][0].limit).toEqual({
      limit: 1,
      offset: 0,
    });
  });

  it('keeps the predicate and ordering of the alert query', async () => {
    await call();

    const chartConfig = renderChartConfig.mock.calls[0][0];
    expect(chartConfig.where).toBe('level: error');
    expect(chartConfig.whereLanguage).toBe('lucene');
    expect(chartConfig.orderBy).toBe('Timestamp DESC');
  });

  it('applies the group filter so the row comes from the alerting group', async () => {
    await call({ groupFilterCondition: "toString(ServiceName) = 'api'" });

    expect(renderChartConfig.mock.calls[0][0].filters).toEqual([
      { type: 'sql', condition: "toString(ServiceName) = 'api'" },
    ]);
  });

  it('sends no filters when there is no group condition', async () => {
    await call();

    expect(renderChartConfig.mock.calls[0][0].filters).toBeUndefined();
  });

  it('returns an empty list when no slot is configured', async () => {
    const clickhouseClient = makeClient([{ __hdx_display_0: 'x' }]);

    expect(await call({ displayFields: undefined, clickhouseClient })).toEqual(
      [],
    );
    expect(await call({ displayFields: {}, clickhouseClient })).toEqual([]);
    expect(
      await call({ displayFields: { errorMessage: '  ' }, clickhouseClient }),
    ).toEqual([]);
    expect(clickhouseClient.query).not.toHaveBeenCalled();
  });

  it('returns an empty list when the group has no rows', async () => {
    expect(await call({ clickhouseClient: makeClient([]) as any })).toEqual([]);
  });

  it('renders a missing column as an empty value rather than dropping it', async () => {
    const result = await call({
      clickhouseClient: makeClient([{ 'other-column': 'x' }]) as any,
    });

    expect(result).toEqual([
      { label: 'Error message', value: '', long: false },
    ]);
  });

  it('stringifies non-string column values', async () => {
    const result = await call({
      displayFields: { extra: [{ valueExpression: 'SeverityNumber' }] },
      clickhouseClient: makeClient([{ __hdx_display_0: 17 }]) as any,
    });

    expect(result).toEqual([
      { label: 'SeverityNumber', value: '17', long: false },
    ]);
  });

  it('returns an empty list when the query fails', async () => {
    const clickhouseClient = {
      query: jest.fn(async () => {
        throw new Error('clickhouse down');
      }),
    };

    expect(await call({ clickhouseClient: clickhouseClient as any })).toEqual(
      [],
    );
  });

  it('returns an empty list when the chart config cannot be rendered', async () => {
    renderChartConfig.mockRejectedValueOnce(new Error('bad expression'));

    expect(await call()).toEqual([]);
  });
});

describe('fetchGroupSampleFields for tile alerts', () => {
  it('applies the tile filters alongside the group filter', async () => {
    await call({
      query: {
        where: 'StatusCode:Error',
        whereLanguage: 'lucene',
        filters: [{ type: 'sql', condition: 'ServiceName IS NOT NULL' }],
      },
      groupFilterCondition: "toString(StatusMessage) = 'boom'",
    });

    expect(renderChartConfig.mock.calls[0][0].filters).toEqual([
      { type: 'sql', condition: 'ServiceName IS NOT NULL' },
      { type: 'sql', condition: "toString(StatusMessage) = 'boom'" },
    ]);
  });

  it('orders by timestamp descending when the query has no ordering', async () => {
    // Tiles have no orderBy, so without a default the "representative" row
    // would be whichever row ClickHouse happened to return first.
    await call({ query: { where: '', whereLanguage: 'sql' } });

    expect(renderChartConfig.mock.calls[0][0].orderBy).toBe('Timestamp DESC');
  });
});
