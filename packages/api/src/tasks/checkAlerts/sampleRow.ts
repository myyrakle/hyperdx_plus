import { ResponseJSON } from '@clickhouse/client-common';
import { ClickhouseClient } from '@hyperdx/common-utils/dist/clickhouse/node';
import { Metadata } from '@hyperdx/common-utils/dist/core/metadata';
import { renderChartConfig } from '@hyperdx/common-utils/dist/core/renderChartConfig';
import { splitAndTrimWithBracket } from '@hyperdx/common-utils/dist/core/utils';
import {
  BuilderChartConfigWithOptDateRange,
  ChartConfigWithOptDateRange,
  DisplayType,
  pickSampleWeightExpressionProps,
  SourceKind,
} from '@hyperdx/common-utils/dist/types';
import { serializeError } from 'serialize-error';

import { ISavedSearch } from '@/models/savedSearch';
import { ISource } from '@/models/source';
import {
  AlertMessageField,
  formatFieldLabel,
  makeMessageField,
} from '@/tasks/checkAlerts/message';
import logger from '@/utils/logger';

/**
 * Read the alert's `displayFields` off one representative row of the group that
 * fired, as labelled fields for the notification.
 *
 * Never throws: a notification is more valuable than the extra context, so any
 * failure (bad expression, ClickHouse error, empty group) yields an empty list
 * and the alert still goes out.
 */
export const fetchGroupSampleFields = async ({
  aliasWith,
  clickhouseClient,
  displayFields,
  endTime,
  groupFilterCondition,
  metadata,
  savedSearch,
  source,
  startTime,
}: {
  aliasWith?: BuilderChartConfigWithOptDateRange['with'];
  clickhouseClient: ClickhouseClient;
  displayFields?: string;
  endTime: Date;
  groupFilterCondition?: string;
  metadata: Metadata;
  savedSearch: ISavedSearch;
  source: ISource;
  startTime: Date;
}): Promise<AlertMessageField[]> => {
  const expressions = displayFields
    ? splitAndTrimWithBracket(displayFields).filter(Boolean)
    : [];
  if (expressions.length === 0) {
    return [];
  }

  // implicitColumnExpression and useTextIndexForImplicitColumn only exist on
  // Log and Trace sources.
  const isTextSource =
    source.kind === SourceKind.Log || source.kind === SourceKind.Trace;

  const chartConfig: ChartConfigWithOptDateRange = {
    connection: '', // the ClickHouse client is already bound to a connection
    displayType: DisplayType.Search,
    dateRange: [startTime, endTime],
    from: source.from,
    select: expressions.join(', '),
    where: savedSearch.where,
    whereLanguage: savedSearch.whereLanguage,
    implicitColumnExpression: isTextSource
      ? source.implicitColumnExpression
      : undefined,
    useTextIndexForImplicitColumn: isTextSource
      ? source.useTextIndexForImplicitColumn
      : undefined,
    ...pickSampleWeightExpressionProps(source),
    timestampValueExpression: source.timestampValueExpression,
    orderBy: savedSearch.orderBy,
    ...(groupFilterCondition && {
      filters: [{ type: 'sql', condition: groupFilterCondition }],
    }),
    limit: { limit: 1, offset: 0 },
  };
  if (aliasWith) {
    chartConfig.with = aliasWith;
  }

  try {
    const query = await renderChartConfig(
      chartConfig,
      metadata,
      source.querySettings,
    );
    const result = await clickhouseClient.query<'JSON'>({
      query: query.sql,
      query_params: query.params,
      format: 'JSON',
    });
    const { data } = await result.json<ResponseJSON<Record<string, unknown>>>();
    const row = data?.[0];
    if (row == null) {
      return [];
    }

    return expressions.map(expression =>
      makeMessageField(
        formatFieldLabel(expression),
        // A column the query did not return still gets a field, so a mismatch is
        // visible in the notification rather than silently dropped.
        row[expression] == null ? '' : `${row[expression]}`,
      ),
    );
  } catch (e) {
    logger.error(
      {
        savedSearchId: savedSearch.id,
        displayFields,
        error: serializeError(e),
      },
      'Failed to fetch alert sample row for display fields',
    );
    return [];
  }
};
