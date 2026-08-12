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
    displayFields: "SpanAttributes['exception.message']",
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  renderChartConfig.mockResolvedValue({ sql: 'SELECT 1', params: {} });
});

describe('fetchGroupSampleFields', () => {
  it('returns a labelled field per display field of the row', async () => {
    const result = await call({
      clickhouseClient: makeClient([
        {
          "SpanAttributes['exception.message']": 'connection refused',
          "SpanAttributes['exception.stacktrace']": 'at foo()\nat bar()',
        },
      ]) as any,
      displayFields:
        "SpanAttributes['exception.message'], SpanAttributes['exception.stacktrace']",
    });

    expect(result).toEqual([
      { label: 'exception.message', value: 'connection refused', long: false },
      {
        label: 'exception.stacktrace',
        value: 'at foo()\nat bar()',
        long: true,
      },
    ]);
  });

  it('selects only the requested display fields, limited to one row', async () => {
    await call();

    const chartConfig = renderChartConfig.mock.calls[0][0];
    expect(chartConfig.select).toBe("SpanAttributes['exception.message']");
    expect(chartConfig.limit).toEqual({ limit: 1, offset: 0 });
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

    const chartConfig = renderChartConfig.mock.calls[0][0];
    expect(chartConfig.filters).toEqual([
      { type: 'sql', condition: "toString(ServiceName) = 'api'" },
    ]);
  });

  it('sends no filters when there is no group condition', async () => {
    await call();

    expect(renderChartConfig.mock.calls[0][0].filters).toBeUndefined();
  });

  it('returns an empty list when no display fields are configured', async () => {
    const clickhouseClient = makeClient([{ Body: 'x' }]);

    expect(await call({ displayFields: undefined, clickhouseClient })).toEqual(
      [],
    );
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
      { label: 'exception.message', value: '', long: false },
    ]);
  });

  it('stringifies non-string column values', async () => {
    const result = await call({
      displayFields: 'SeverityNumber',
      clickhouseClient: makeClient([{ SeverityNumber: 17 }]) as any,
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
