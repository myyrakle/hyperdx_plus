import { ResponseJSON } from '@clickhouse/client-common';
import { ClickhouseClient } from '@hyperdx/common-utils/dist/clickhouse/node';
import { Metadata } from '@hyperdx/common-utils/dist/core/metadata';
import { renderChartConfig } from '@hyperdx/common-utils/dist/core/renderChartConfig';
import {
  AlertDisplayFields,
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
  displayFields?: AlertDisplayFields;
  endTime: Date;
  groupFilterCondition?: string;
  metadata: Metadata;
  /** The alert's predicate — from the saved search, or from the tile config. */
  query: SearchLinkQuery;
  source: ISource;
  startTime: Date;
}): Promise<AlertMessageField[]> => {
  // Named slots have fixed labels and a fixed layout; extras are labelled by the
  // user or by their expression. A blank expression is a half-filled form row,
  // not something to query.
  const slots: Array<{ expression: string; label: string; long: boolean }> = [
    ...(displayFields?.errorMessage?.trim()
      ? [
          {
            expression: displayFields.errorMessage.trim(),
            label: 'Error message',
            long: false,
          },
        ]
      : []),
    ...(displayFields?.extra ?? [])
      .filter(field => field.valueExpression.trim())
      .map(field => ({
        expression: field.valueExpression.trim(),
        label:
          field.alias?.trim() || formatFieldLabel(field.valueExpression.trim()),
        long: false,
      })),
    // Last, and always full width: a stack trace is unreadable in two columns.
    ...(displayFields?.stacktrace?.trim()
      ? [
          {
            expression: displayFields.stacktrace.trim(),
            label: 'Stack trace',
            long: true,
          },
        ]
      : []),
  ];
  if (slots.length === 0) {
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
    select: slots.map((slot, i) => ({
      valueExpression: slot.expression,
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

    return (
      slots
        .map((slot, i) => ({
          label: slot.label,
          value: row[aliasOf(i)] == null ? '' : `${row[aliasOf(i)]}`,
          long: slot.long,
        }))
        // A row often has nothing for a slot — a span that timed out carries no
        // stack trace — and rendering it anyway leaves a labelled empty code
        // block in the notification. Zero is a real reading, so only blank
        // strings drop out.
        .filter(field => field.value.trim() !== '')
    );
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
