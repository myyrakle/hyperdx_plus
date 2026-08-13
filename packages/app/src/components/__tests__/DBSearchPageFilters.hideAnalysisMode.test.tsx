import { BuilderChartConfigWithDateRange } from '@hyperdx/common-utils/dist/types';
import { screen } from '@testing-library/react';

import { DBSearchPageFilters } from '@/components/DBSearchPageFilters';

jest.mock('@/hooks/useMetadata', () => ({
  useColumns: () => ({ data: [] }),
  useGetValuesDistribution: () => ({
    data: undefined,
    isFetching: false,
    error: undefined,
  }),
  useJsonColumns: () => ({ data: [] }),
  useTableMetadata: () => ({ data: undefined }),
}));

jest.mock('@/pinnedFilters', () => ({
  usePinnedFiltersApi: () => ({ data: undefined }),
  useUpdatePinnedFilters: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/source', () => ({
  useSource: () => ({ data: undefined }),
}));

jest.mock('@/components/DBSearchPageFilters/hooks', () => ({
  useFetchFacets: () => ({
    data: [{ key: 'ServiceName', value: ['frontend', 'checkout'], type: null }],
    isLoading: false,
    isFetching: false,
    loadMoreFacetsForKey: jest.fn(),
    areExtraFacetsLoading: false,
    loadMoreLoadingKeys: new Set(),
    extraFacetKeys: new Set(),
  }),
}));

const chartConfig = {
  from: { databaseName: 'default', tableName: 'otel_traces' },
  connection: 'conn',
  timestampValueExpression: 'Timestamp',
  where: '',
  select: '',
  dateRange: [
    new Date('2026-08-13T00:00:00Z'),
    new Date('2026-08-13T01:00:00Z'),
  ],
} as unknown as BuilderChartConfigWithDateRange;

const filterStateHook = {
  filters: {},
  setFilters: jest.fn(),
  setFilterValue: jest.fn(),
  setOnlyFilters: jest.fn(),
  replaceFilterValue: jest.fn(),
  setFilterRange: jest.fn(),
  clearFilter: jest.fn(),
  clearAllFilters: jest.fn(),
  retainFiltersByColumns: jest.fn(),
};

describe('DBSearchPageFilters without analysis mode', () => {
  it('hides the analysis mode tabs but keeps the facet list', () => {
    renderWithMantine(
      <DBSearchPageFilters
        hideAnalysisMode
        chartConfig={chartConfig}
        sourceId="trace-source"
        {...filterStateHook}
      />,
    );

    expect(screen.queryByText('Analysis Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Results Table')).not.toBeInTheDocument();
    expect(screen.queryByText('Denoise Results')).not.toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('ServiceName')).toBeInTheDocument();
  });

  it('still renders the analysis mode tabs by default', () => {
    renderWithMantine(
      <DBSearchPageFilters
        chartConfig={chartConfig}
        sourceId="trace-source"
        analysisMode="results"
        setAnalysisMode={jest.fn()}
        denoiseResults={false}
        setDenoiseResults={jest.fn()}
        {...filterStateHook}
      />,
    );

    expect(screen.getByText('Analysis Mode')).toBeInTheDocument();
    expect(screen.getByText('Results Table')).toBeInTheDocument();
  });
});
