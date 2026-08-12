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

import { ISource } from '@/models/source';
import {
  AlertMessageField,
  formatFieldLabel,
  makeMessageField,
} from '@/tasks/checkAlerts/message';
import { SearchLinkQuery } from '@/tasks/checkAlerts/searchLink';
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
  query,
  source,
  startTime,
}: {
  aliasWith?: BuilderChartConfigWithOptDateRange['with'];
  clickhouseClient: ClickhouseClient;
  displayFields?: string;
  endTime: Date;
  groupFilterCondition?: string;
  metadata: Metadata;
  /** The alert's predicate — from the saved search, or from the tile config. */
  query: SearchLinkQuery;
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

  // ClickHouse names an unaliased column after its own rendering of the
  // expression — `SpanAttributes['x']` comes back as
  // `arrayElement(SpanAttributes, 'x')` — so the response cannot be keyed by the
  // expression text. Alias every column and read the aliases back.
  const aliasOf = (index: number) => `__hdx_display_${index}`;

  const chartConfig: ChartConfigWithOptDateRange = {
    connection: '', // the ClickHouse client is already bound to a connection
    displayType: DisplayType.Search,
    dateRange: [startTime, endTime],
    from: source.from,
    select: expressions.map((valueExpression, i) => ({
      valueExpression,
      alias: aliasOf(i),
    })),
    where: query.where ?? '',
    whereLanguage: query.whereLanguage ?? undefined,
    implicitColumnExpression: isTextSource
      ? source.implicitColumnExpression
      : undefined,
    useTextIndexForImplicitColumn: isTextSource
      ? source.useTextIndexForImplicitColumn
      : undefined,
    ...pickSampleWeightExpressionProps(source),
    timestampValueExpression: source.timestampValueExpression,
    // Tiles carry no ordering, so without a default the "representative" row
    // would be whichever row ClickHouse happened to return first.
    orderBy: query.orderBy || `${source.timestampValueExpression} DESC`,
    ...((query.filters?.length || groupFilterCondition) && {
      filters: [
        ...(query.filters ?? []),
        ...(groupFilterCondition
          ? [{ type: 'sql' as const, condition: groupFilterCondition }]
          : []),
      ],
    }),
    limit: { limit: 1, offset: 0 },
  };
  if (aliasWith) {
    chartConfig.with = aliasWith;
  }

  try {
    const rendered = await renderChartConfig(
      chartConfig,
      metadata,
      source.querySettings,
    );
    const result = await clickhouseClient.query<'JSON'>({
      query: rendered.sql,
      query_params: rendered.params,
      format: 'JSON',
    });
    const { data } = await result.json<ResponseJSON<Record<string, unknown>>>();
    const row = data?.[0];
    if (row == null) {
      return [];
    }

    return expressions.map((expression, i) => {
      const value = row[aliasOf(i)];
      return makeMessageField(
        formatFieldLabel(expression),
        // A column the query did not return still gets a field, so a mismatch is
        // visible in the notification rather than silently dropped.
        value == null ? '' : `${value}`,
      );
    });
  } catch (e) {
    logger.error(
      {
        sourceId: source.id,
        displayFields,
        error: serializeError(e),
      },
      'Failed to fetch alert sample row for display fields',
    );
    return [];
  }
};
