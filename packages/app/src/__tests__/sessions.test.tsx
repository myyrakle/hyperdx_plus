import * as React from 'react';
import { renderChartConfig } from '@hyperdx/common-utils/dist/core/renderChartConfig';
import {
  Filter,
  SourceKind,
  TSessionSource,
  TTraceSource,
} from '@hyperdx/common-utils/dist/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useSessions } from '@/sessions';

jest.mock('@hyperdx/common-utils/dist/core/renderChartConfig', () => ({
  renderChartConfig: jest.fn(async () => ({
    sql: 'SELECT 1',
    params: {},
  })),
}));

const mockQuery = jest.fn(async (_params: { query: string }) => ({
  json: async () => ({ data: [] }),
}));

jest.mock('@/clickhouse', () => ({
  useClickhouseClient: () => ({ query: mockQuery }),
  getClickhouseClient: () => ({ query: mockQuery }),
}));

jest.mock('@/hooks/useMetadata', () => ({
  useMetadataWithSettings: () => ({}),
}));

jest.mock('@/hooks/useFieldExpressionGenerator', () => ({
  __esModule: true,
  default: () => ({
    isLoading: false,
    getFieldExpression: (column: string, key: string) => `${column}['${key}']`,
  }),
}));

jest.mock('@/source', () => ({
  useSource: () => ({ data: undefined, isPending: false }),
  SESSION_TABLE_EXPRESSIONS: {
    implicitColumnExpression: 'Body',
    eventAttributesExpression: 'LogAttributes',
    resourceAttributesExpression: 'ResourceAttributes',
  },
}));

const traceSource = {
  id: 'trace-source',
  kind: SourceKind.Trace,
  connection: 'conn',
  from: { databaseName: 'default', tableName: 'otel_traces' },
  timestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'SpanName',
  serviceNameExpression: 'ServiceName',
  spanNameExpression: 'SpanName',
  statusCodeExpression: 'StatusCode',
  eventAttributesExpression: 'SpanAttributes',
  resourceAttributesExpression: 'ResourceAttributes',
} as unknown as TTraceSource;

const sessionSource = {
  id: 'session-source',
  kind: SourceKind.Session,
  connection: 'conn',
  from: { databaseName: 'default', tableName: 'hyperdx_sessions' },
  timestampValueExpression: 'TimestampTime',
  resourceAttributesExpression: 'ResourceAttributes',
} as unknown as TSessionSource;

const dateRange: [Date, Date] = [
  new Date('2026-08-13T00:00:00Z'),
  new Date('2026-08-13T01:00:00Z'),
];

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Config passed to the main sessions aggregation (the first render call). */
function mainSessionsConfig() {
  return (renderChartConfig as jest.Mock).mock.calls[0][0];
}

function renderUseSessions(args: {
  where?: string;
  filters?: Filter[];
  sessionSourceOverride?: TSessionSource;
}) {
  return renderHook(
    (props: { where?: string; filters?: Filter[] }) =>
      useSessions({
        traceSource,
        sessionSource: args.sessionSourceOverride ?? sessionSource,
        dateRange,
        where: props.where,
        whereLanguage: 'lucene',
        filters: props.filters,
      }),
    {
      wrapper,
      initialProps: { where: args.where, filters: args.filters },
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSessions filters', () => {
  it('omits the filters key entirely when there is no where and no filters', async () => {
    renderUseSessions({});

    await waitFor(() => expect(renderChartConfig).toHaveBeenCalled());

    expect(mainSessionsConfig()).not.toHaveProperty('filters');
  });

  it('passes sidebar filters through to the sessions aggregation', async () => {
    const filters: Filter[] = [
      { type: 'sql', condition: `ServiceName = 'frontend'` },
    ];

    renderUseSessions({ filters });

    await waitFor(() => expect(renderChartConfig).toHaveBeenCalled());

    expect(mainSessionsConfig().filters).toEqual(filters);
  });

  it('keeps the where condition alongside sidebar filters', async () => {
    const filters: Filter[] = [
      { type: 'sql', condition: `ServiceName = 'frontend'` },
    ];

    renderUseSessions({ where: 'level:error', filters });

    await waitFor(() => expect(renderChartConfig).toHaveBeenCalled());

    expect(mainSessionsConfig().filters).toEqual([
      { type: 'lucene', condition: 'level:error' },
      ...filters,
    ]);
  });

  it('keeps the interaction heuristic when only sidebar filters are set', async () => {
    renderUseSessions({
      filters: [{ type: 'sql', condition: `ServiceName = 'frontend'` }],
    });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());

    expect(mockQuery.mock.calls[0][0].query).toContain(
      'HAVING interactionCount > 0 OR recordingCount > 0',
    );
  });

  it('drops the interaction heuristic when a where condition is set', async () => {
    renderUseSessions({ where: 'level:error' });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());

    expect(mockQuery.mock.calls[0][0].query).not.toContain('HAVING');
  });

  it('re-queries when filters change', async () => {
    const { rerender } = renderUseSessions({ filters: [] });

    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));

    rerender({
      where: undefined,
      filters: [{ type: 'sql', condition: `ServiceName = 'checkout'` }],
    });

    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(2));
  });
});
