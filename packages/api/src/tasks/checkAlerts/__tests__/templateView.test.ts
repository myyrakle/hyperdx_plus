import { AlertSource, AlertThresholdType } from '@/models/alert';
import { buildAlertTemplateView } from '@/tasks/checkAlerts/templateView';

const alert: any = {
  id: 'alert-1',
  channel: { type: 'webhook', webhookId: 'w1' },
  groupBy: 'ServiceName',
  displayFields: {
    errorMessage: 'StatusMessage',
    stacktrace: "SpanAttributes['code.stacktrace']",
  },
  mention: 'here',
  interval: '5m',
  message: 'msg',
  name: 'name',
  silenced: undefined,
  source: AlertSource.TILE,
  threshold: 1,
  thresholdMax: undefined,
  thresholdType: AlertThresholdType.ABOVE,
  tileId: 'tile-1',
  team: 'team-1',
};

const build = (overrides: Record<string, unknown> = {}) =>
  buildAlertTemplateView({
    alert,
    attributes: { ServiceName: 'api' },
    dashboard: { id: 'dash-1' } as any,
    endTime: new Date('2026-08-13T00:05:00Z'),
    group: 'ServiceName:api',
    isGroupedAlert: true,
    savedSearch: null,
    source: null,
    startTime: new Date('2026-08-13T00:00:00Z'),
    totalCount: 3,
    windowSizeInMins: 5,
    ...overrides,
  });

describe('buildAlertTemplateView', () => {
  /**
   * The view's `alert` is assembled field by field, so every setting the
   * notification layer reads has to be listed explicitly — a missing line here
   * silently drops the feature rather than failing to compile.
   */
  it.each([
    ['mention', 'here'],
    ['groupBy', 'ServiceName'],
    ['tileId', 'tile-1'],
    ['threshold', 1],
    ['thresholdType', AlertThresholdType.ABOVE],
    ['interval', '5m'],
  ])('carries %s through to the template', (field, expected) => {
    expect(build().alert[field]).toEqual(expected);
  });

  it('carries the display field slots', () => {
    expect(build().alert.displayFields).toEqual({
      errorMessage: 'StatusMessage',
      stacktrace: "SpanAttributes['code.stacktrace']",
    });
  });

  it('exposes the group values both flat and nested', () => {
    const view = build();

    expect(view.attributesFlat).toEqual({ ServiceName: 'api' });
    expect(view.attributes).toEqual({ ServiceName: 'api' });
  });

  it('reports the window as a granularity string', () => {
    expect(build({ windowSizeInMins: 15 }).granularity).toBe('15 minute');
  });

  it('uses the total count as the alert value', () => {
    expect(build({ totalCount: 42 }).value).toBe(42);
  });

  it('throws when the alert has no team, which every query is scoped by', () => {
    expect(() => build({ alert: { ...alert, team: null } })).toThrow(
      'Team not found',
    );
  });
});
