import { IAlert } from '@/models/alert';
import { IDashboard } from '@/models/dashboard';
import { ISavedSearch } from '@/models/savedSearch';
import { ISource } from '@/models/source';
import { AlertMessageTemplateDefaultView } from '@/tasks/checkAlerts/template';
import { unflattenObject } from '@/tasks/util';

/**
 * Assemble the view the notification templates and renderers read.
 *
 * The `alert` object is built field by field rather than spread, because the
 * view's shape is the contract with user-authored Handlebars templates and must
 * not leak Mongoose internals. The cost is that every setting the notification
 * layer reads has to be listed here — omitting one silently disables the feature
 * instead of failing to compile, so this is covered by its own test.
 */
export const buildAlertTemplateView = ({
  alert,
  attributes,
  dashboard,
  endTime,
  group,
  isGroupedAlert,
  savedSearch,
  source,
  startTime,
  totalCount,
  windowSizeInMins,
}: {
  alert: IAlert;
  attributes: Record<string, string>;
  dashboard?: IDashboard | null;
  endTime: Date;
  group?: string;
  isGroupedAlert: boolean;
  savedSearch?: ISavedSearch | null;
  source?: ISource | null;
  startTime: Date;
  totalCount: number;
  windowSizeInMins: number;
}): AlertMessageTemplateDefaultView => {
  if (alert.team == null) {
    throw new Error('Team not found');
  }

  return {
    alert: {
      id: alert.id,
      channel: alert.channel,
      dashboardId: dashboard?.id,
      groupBy: alert.groupBy,
      displayFields: alert.displayFields,
      mention: alert.mention,
      interval: alert.interval,
      ...(alert.scheduleOffsetMinutes != null && {
        scheduleOffsetMinutes: alert.scheduleOffsetMinutes,
      }),
      ...(alert.scheduleStartAt != null && {
        scheduleStartAt: alert.scheduleStartAt.toISOString(),
      }),
      message: alert.message,
      name: alert.name,
      savedSearchId: savedSearch?.id,
      silenced: alert.silenced,
      source: alert.source,
      threshold: alert.threshold,
      thresholdMax: alert.thresholdMax,
      thresholdType: alert.thresholdType,
      tileId: alert.tileId,
    },
    attributes: unflattenObject(attributes),
    // Group-scoped queries and links need the SELECT ordering that nesting
    // discards, so the flat form travels alongside.
    attributesFlat: attributes,
    dashboard,
    endTime,
    granularity: `${windowSizeInMins} minute`,
    group,
    isGroupedAlert,
    savedSearch,
    source,
    startTime,
    value: totalCount,
  };
};
