import {
  AlertState,
  AlertThresholdType,
  SourceKind,
  WebhookService,
} from '@hyperdx/common-utils/dist/types';
import mongoose from 'mongoose';

import { makeTile } from '@/fixtures';
import { AlertSource } from '@/models/alert';
import { loadProvider } from '@/tasks/checkAlerts/providers';
import {
  AlertMessageTemplateDefaultView,
  buildAlertMessageTemplateTitle,
  renderAlertTemplate,
} from '@/tasks/checkAlerts/template';
import * as slack from '@/utils/slack';

let alertProvider: any;

beforeAll(async () => {
  alertProvider = await loadProvider();
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const mockMetadata = {
  getColumn: jest.fn().mockImplementation(({ column }) => {
    const columnMap = {
      Timestamp: { name: 'Timestamp', type: 'DateTime' },
      Body: { name: 'Body', type: 'String' },
      SeverityText: { name: 'SeverityText', type: 'String' },
      ServiceName: { name: 'ServiceName', type: 'String' },
    };
    return Promise.resolve(columnMap[column]);
  }),
  getColumns: jest.fn().mockResolvedValue([]),
  getMapKeys: jest.fn().mockResolvedValue([]),
  getMapValues: jest.fn().mockResolvedValue([]),
  getAllFields: jest.fn().mockResolvedValue([]),
  getTableMetadata: jest.fn().mockResolvedValue({}),
  getClickHouseSettings: jest.fn().mockReturnValue({}),
  setClickHouseSettings: jest.fn(),
  getSkipIndices: jest.fn().mockResolvedValue([]),
  getSetting: jest.fn().mockResolvedValue(undefined),
} as any;

const sampleLogsCsv = [
  '"2023-03-17 22:14:01","error","Failed to connect to database"',
  '"2023-03-17 22:13:45","error","Connection timeout after 30s"',
  '"2023-03-17 22:12:30","error","Retry limit exceeded"',
].join('\n');

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const mockClickhouseClient = {
  query: jest.fn().mockResolvedValue({
    json: jest.fn().mockResolvedValue({ data: [] }),
    text: jest.fn().mockResolvedValue(sampleLogsCsv),
  }),
} as any;

const startTime = new Date('2023-03-17T22:10:00.000Z');
const endTime = new Date('2023-03-17T22:15:00.000Z');

const makeSearchView = (
  overrides: Partial<AlertMessageTemplateDefaultView> & {
    thresholdType?: AlertThresholdType;
    threshold?: number;
    thresholdMax?: number;
    value?: number;
    group?: string;
  } = {},
): AlertMessageTemplateDefaultView => ({
  alert: {
    thresholdType: overrides.thresholdType ?? AlertThresholdType.ABOVE,
    threshold: overrides.threshold ?? 5,
    thresholdMax: overrides.thresholdMax,
    source: AlertSource.SAVED_SEARCH,
    channel: { type: null },
    interval: '1m',
  },
  source: {
    id: 'fake-source-id',
    kind: SourceKind.Log,
    team: 'team-123',
    from: { databaseName: 'default', tableName: 'otel_logs' },
    timestampValueExpression: 'Timestamp',
    connection: 'connection-123',
    name: 'Logs',
    defaultTableSelectExpression: 'Timestamp, Body',
  },
  savedSearch: {
    _id: 'fake-saved-search-id' as any,
    team: 'team-123' as any,
    id: 'fake-saved-search-id',
    name: 'My Search',
    select: 'Body',
    where: 'Body: "error"',
    whereLanguage: 'lucene',
    orderBy: 'timestamp',
    source: 'fake-source-id' as any,
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  attributes: {},
  attributesFlat: {},
  granularity: '1m',
  group: overrides.group,
  isGroupedAlert: false,
  startTime,
  endTime,
  value: overrides.value ?? 10,
});

const testTile = makeTile({ id: 'test-tile-id' });
const makeTileView = (
  overrides: Partial<AlertMessageTemplateDefaultView> & {
    thresholdType?: AlertThresholdType;
    threshold?: number;
    thresholdMax?: number;
    value?: number;
    group?: string;
  } = {},
): AlertMessageTemplateDefaultView => ({
  alert: {
    thresholdType: overrides.thresholdType ?? AlertThresholdType.ABOVE,
    threshold: overrides.threshold ?? 5,
    thresholdMax: overrides.thresholdMax,
    source: AlertSource.TILE,
    channel: { type: null },
    interval: '1m',
    tileId: 'test-tile-id',
  },
  dashboard: {
    _id: new mongoose.Types.ObjectId(),
    id: 'id-123',
    name: 'My Dashboard',
    tiles: [testTile],
    team: 'team-123' as any,
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  attributes: {},
  attributesFlat: {},
  granularity: '5 minute',
  group: overrides.group,
  isGroupedAlert: false,
  startTime,
  endTime,
  value: overrides.value ?? 10,
});

const render = (view: AlertMessageTemplateDefaultView, state: AlertState) =>
  renderAlertTemplate({
    alertProvider,
    clickhouseClient: mockClickhouseClient,
    metadata: mockMetadata,
    state,
    template: null,
    title: 'Test Alert Title',
    view,
    teamWebhooksById: new Map(),
  });

interface AlertCase {
  thresholdType: AlertThresholdType;
  threshold: number;
  thresholdMax?: number; // for between-type thresholds
  alertValue: number; // value that would trigger the alert
  okValue: number; // value that would resolve the alert
}

const alertCases: AlertCase[] = [
  {
    thresholdType: AlertThresholdType.ABOVE,
    threshold: 5,
    alertValue: 10,
    okValue: 3,
  },
  {
    thresholdType: AlertThresholdType.ABOVE_EXCLUSIVE,
    threshold: 5,
    alertValue: 10,
    okValue: 3,
  },
  {
    thresholdType: AlertThresholdType.BELOW,
    threshold: 5,
    alertValue: 2,
    okValue: 10,
  },
  {
    thresholdType: AlertThresholdType.BELOW_OR_EQUAL,
    threshold: 5,
    alertValue: 3,
    okValue: 10,
  },
  {
    thresholdType: AlertThresholdType.EQUAL,
    threshold: 5,
    alertValue: 5,
    okValue: 10,
  },
  {
    thresholdType: AlertThresholdType.NOT_EQUAL,
    threshold: 5,
    alertValue: 10,
    okValue: 5,
  },
  {
    thresholdType: AlertThresholdType.BETWEEN,
    threshold: 5,
    thresholdMax: 7,
    alertValue: 6,
    okValue: 10,
  },
  {
    thresholdType: AlertThresholdType.NOT_BETWEEN,
    threshold: 5,
    thresholdMax: 7,
    alertValue: 12,
    okValue: 6,
  },
];

describe('renderAlertTemplate group scoping', () => {
  const groupedView = (
    overrides: Partial<AlertMessageTemplateDefaultView> = {},
  ): AlertMessageTemplateDefaultView => {
    const view = makeSearchView({ group: 'ServiceName:api' });
    return {
      ...view,
      alert: { ...view.alert, groupBy: 'ServiceName' },
      attributesFlat: { ServiceName: 'api' },
      isGroupedAlert: true,
      ...overrides,
    };
  };

  const makeClient = (sampleRow?: Record<string, unknown>) =>
    ({
      query: jest.fn().mockResolvedValue({
        json: jest
          .fn()
          .mockResolvedValue({ data: sampleRow ? [sampleRow] : [] }),
        text: jest.fn().mockResolvedValue(sampleLogsCsv),
      }),
    }) as any;

  const renderWith = ({
    view,
    clickhouseClient,
    state = AlertState.ALERT,
    teamWebhooksById = new Map(),
  }: {
    view: AlertMessageTemplateDefaultView;
    clickhouseClient: any;
    state?: AlertState;
    teamWebhooksById?: Map<string, any>;
  }) =>
    renderAlertTemplate({
      alertProvider,
      clickhouseClient,
      metadata: mockMetadata,
      state,
      template: null,
      title: 'Test Alert Title',
      view,
      teamWebhooksById,
    });

  const queriedSql = (clickhouseClient: any): string[] =>
    clickhouseClient.query.mock.calls.map((call: any[]) => call[0].query);

  describe('sample log query', () => {
    it('restricts the sample rows to the group that fired', async () => {
      const clickhouseClient = makeClient();

      await renderWith({ view: groupedView(), clickhouseClient });

      expect(queriedSql(clickhouseClient)[0]).toContain(
        "toString(ServiceName) = 'api'",
      );
    });

    it('leaves a non-grouped alert query unfiltered', async () => {
      const clickhouseClient = makeClient();

      await renderWith({ view: makeSearchView(), clickhouseClient });

      expect(queriedSql(clickhouseClient)[0]).not.toContain('toString(');
    });
  });

  describe('Slack (Error) delivery', () => {
    const webhookId = '507f1f77bcf86cd799439011';
    const advancedWebhook = {
      _id: { toString: () => webhookId },
      name: 'advanced',
      service: WebhookService.SlackError,
      url: 'https://hooks.slack.com/services/T0/B0/XXXX',
    };
    const plainWebhook = {
      ...advancedWebhook,
      service: WebhookService.Slack,
    };

    const viewWithChannel = (
      overrides: Partial<AlertMessageTemplateDefaultView> = {},
    ) => {
      const view = groupedView(overrides);
      return {
        ...view,
        alert: { ...view.alert, channel: { type: 'webhook', webhookId } },
      } as AlertMessageTemplateDefaultView;
    };

    const lastSlackPayload = () => {
      const calls = (slack.postMessageToWebhook as jest.Mock).mock.calls;
      return calls[calls.length - 1][1];
    };

    /** All attachment text, flattened; the service uses legacy attachments. */
    const lastSlackText = () => JSON.stringify(lastSlackPayload().attachments);

    beforeEach(() => {
      (slack.postMessageToWebhook as jest.Mock).mockClear();
    });

    it('sends a coloured attachment rather than a single markdown section', async () => {
      await renderWith({
        view: viewWithChannel(),
        clickhouseClient: makeClient(),
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      const attachments = lastSlackPayload().attachments;
      expect(attachments[0].color).toBe('danger');
      expect(attachments[0].fields.length).toBeGreaterThan(0);
    });

    it('colours a firing alert red', async () => {
      await renderWith({
        view: viewWithChannel(),
        clickhouseClient: makeClient(),
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      expect(lastSlackPayload().attachments[0].color).toBe('danger');
    });

    it('colours a resolved alert green', async () => {
      await renderWith({
        view: viewWithChannel(),
        clickhouseClient: makeClient(),
        state: AlertState.OK,
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      expect(lastSlackPayload().attachments[0].color).toBe('good');
    });

    it('includes the display fields of a representative row of the group', async () => {
      const view = viewWithChannel();
      await renderWith({
        view: {
          ...view,
          alert: {
            ...view.alert,
            displayFields: { errorMessage: 'StatusMessage' },
          },
        },
        clickhouseClient: makeClient({ __hdx_display_0: 'connection refused' }),
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      expect(lastSlackText()).toContain('connection refused');
    });

    it('scopes the representative-row query to the group', async () => {
      const clickhouseClient = makeClient({ ServiceName: 'api' });
      const view = viewWithChannel();

      await renderWith({
        view: {
          ...view,
          alert: {
            ...view.alert,
            displayFields: { errorMessage: 'ServiceName' },
          },
        },
        clickhouseClient,
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      const sampleRowQuery = queriedSql(clickhouseClient)[1];
      expect(sampleRowQuery).toContain("toString(ServiceName) = 'api'");
    });

    it('points the title at the group-scoped row list', async () => {
      await renderWith({
        view: viewWithChannel(),
        clickhouseClient: makeClient(),
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      const titleLink = lastSlackPayload().attachments[0].title_link;
      expect(titleLink).toContain('/search?');
      expect(titleLink).toContain('filters=');
    });

    it('keeps the full saved search reachable from the footer', async () => {
      await renderWith({
        view: viewWithChannel(),
        clickhouseClient: makeClient(),
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      expect(lastSlackText()).toContain('Open search');
    });

    it('does not query for a representative row when no display fields are set', async () => {
      const clickhouseClient = makeClient();

      await renderWith({
        view: viewWithChannel(),
        clickhouseClient,
        teamWebhooksById: new Map([[webhookId, advancedWebhook as any]]),
      });

      // Only the sample-log query for the message body.
      expect(clickhouseClient.query).toHaveBeenCalledTimes(1);
    });

    it('leaves the plain Slack service on the single-section layout', async () => {
      const view = viewWithChannel();

      await renderWith({
        view: {
          ...view,
          alert: {
            ...view.alert,
            displayFields: { errorMessage: 'StatusMessage' },
          },
        },
        clickhouseClient: makeClient({ __hdx_display_0: 'connection refused' }),
        teamWebhooksById: new Map([[webhookId, plainWebhook as any]]),
      });

      const blocks = lastSlackPayload().blocks;
      expect(blocks).toHaveLength(1);
      expect(JSON.stringify(blocks)).not.toContain('connection refused');
    });
  });
});

describe('renderAlertTemplate for tile alerts', () => {
  const webhookId = '507f1f77bcf86cd799439011';
  const errorWebhook = {
    _id: { toString: () => webhookId },
    name: 'errors',
    service: WebhookService.SlackError,
    url: 'https://hooks.slack.com/services/T0/B0/XXXX',
  };

  const groupedTile = makeTile({ id: 'test-tile-id' });
  groupedTile.config = {
    ...(groupedTile.config as any),
    source: 'fake-source-id',
    where: 'StatusCode:Error',
    whereLanguage: 'lucene',
    groupBy: [{ valueExpression: 'StatusMessage' }],
    filters: [{ type: 'sql', condition: 'ServiceName IS NOT NULL' }],
  } as any;

  const tileView = (
    overrides: Partial<AlertMessageTemplateDefaultView> = {},
  ): AlertMessageTemplateDefaultView => {
    const view = makeTileView({ group: 'StatusMessage:boom' });
    return {
      ...view,
      alert: {
        ...view.alert,
        channel: { type: 'webhook', webhookId },
        displayFields: { errorMessage: 'StatusMessage' },
      },
      dashboard: { ...(view.dashboard as any), tiles: [groupedTile] },
      source: makeSearchView().source,
      attributesFlat: { StatusMessage: 'boom' },
      isGroupedAlert: true,
      ...overrides,
    } as AlertMessageTemplateDefaultView;
  };

  const makeClient = (sampleRow?: Record<string, unknown>) =>
    ({
      query: jest.fn().mockResolvedValue({
        json: jest
          .fn()
          .mockResolvedValue({ data: sampleRow ? [sampleRow] : [] }),
        text: jest.fn().mockResolvedValue(sampleLogsCsv),
      }),
    }) as any;

  const renderTile = (clickhouseClient: any, state = AlertState.ALERT) =>
    renderAlertTemplate({
      alertProvider,
      clickhouseClient,
      metadata: mockMetadata,
      state,
      template: null,
      title: 'Test Alert Title',
      view: tileView(),
      teamWebhooksById: new Map([[webhookId, errorWebhook as any]]),
    });

  const lastPayload = () => {
    const calls = (slack.postMessageToWebhook as jest.Mock).mock.calls;
    return calls[calls.length - 1][1];
  };
  const lastText = () => JSON.stringify(lastPayload().attachments);

  beforeEach(() => {
    (slack.postMessageToWebhook as jest.Mock).mockClear();
  });

  describe('mention', () => {
    const renderWithMention = (
      mention: 'here' | 'channel' | undefined,
      state = AlertState.ALERT,
    ) => {
      const view = tileView();
      return renderAlertTemplate({
        alertProvider,
        clickhouseClient: makeClient(),
        metadata: mockMetadata,
        state,
        template: null,
        title: 'Test Alert Title',
        view: { ...view, alert: { ...view.alert, mention } },
        teamWebhooksById: new Map([[webhookId, errorWebhook as any]]),
      });
    };

    it('broadcasts to the channel members when the alert opts in', async () => {
      await renderWithMention('here');

      expect(lastPayload().text).toBe('<!here>');
    });

    it('supports the whole-channel broadcast', async () => {
      await renderWithMention('channel');

      expect(lastPayload().text).toBe('<!channel>');
    });

    it('stays quiet when the alert does not opt in', async () => {
      await renderWithMention(undefined);

      expect(lastPayload().text).toBeUndefined();
    });

    it('does not wake anyone on a resolution', async () => {
      // A resolution is good news; paging people again would train them to
      // mute the channel.
      await renderWithMention('here', AlertState.OK);

      expect(lastPayload().text).toBeUndefined();
    });
  });

  it('renders the structured layout rather than the plain fallback', async () => {
    await renderTile(makeClient());

    // The fallback has no fields; the structured layout renders the group.
    const attachments = lastPayload().attachments;
    expect(attachments[0].fields.length).toBeGreaterThan(0);
    expect(attachments[attachments.length - 1].footer).toContain('events');
  });

  it('colours the attachment by state', async () => {
    await renderTile(makeClient());
    expect(lastPayload().attachments[0].color).toBe('danger');

    await renderTile(makeClient(), AlertState.OK);
    expect(lastPayload().attachments[0].color).toBe('good');
  });

  it('shows the group value from the tile group-by', async () => {
    await renderTile(makeClient());

    expect(lastText()).toContain('boom');
  });

  it('includes the display fields of a representative row', async () => {
    // Keyed by the alias the query asks for, which is what ClickHouse returns.
    await renderTile(makeClient({ __hdx_display_0: 'connection refused' }));

    expect(lastText()).toContain('connection refused');
  });

  it('scopes the representative-row query to the group', async () => {
    const clickhouseClient = makeClient({ StatusMessage: 'boom' });

    await renderTile(clickhouseClient);

    const sql = clickhouseClient.query.mock.calls.map((c: any[]) => c[0].query);
    expect(sql.join('\n')).toContain("toString(StatusMessage) = 'boom'");
  });

  it('aliases the display-field columns in the generated SQL', async () => {
    // Unit tests mock renderChartConfig, so only a real render proves the
    // response can be keyed back. ClickHouse names an unaliased
    // `SpanAttributes['x']` column `arrayElement(SpanAttributes, 'x')`, which
    // silently yielded empty fields before the alias was added.
    const clickhouseClient = makeClient({ __hdx_display_0: 'boom' });

    await renderTile(clickhouseClient);

    const sampleRowSql = clickhouseClient.query.mock.calls
      .map((c: any[]) => c[0].query)
      .find((sql: string) => sql.includes('__hdx_display_0'));

    expect(sampleRowSql).toContain('StatusMessage AS "__hdx_display_0"');
  });

  it('points the title at the group-filtered row list', async () => {
    await renderTile(makeClient());

    const titleLink = lastPayload().attachments[0].title_link;
    expect(titleLink).toContain('/search?');
    expect(titleLink).toContain('filters=');
  });

  it('keeps the dashboard chart reachable from the footer', async () => {
    await renderTile(makeClient());

    expect(lastText()).toContain('/dashboards/');
    expect(lastText()).toContain('Open chart');
  });
});

describe('renderAlertTemplate', () => {
  describe('saved search alerts', () => {
    describe('ALERT state', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold alertValue=$alertValue',
        async ({ thresholdType, threshold, thresholdMax, alertValue }) => {
          const result = await render(
            makeSearchView({
              thresholdType,
              threshold,
              thresholdMax,
              value: alertValue,
            }),
            AlertState.ALERT,
          );
          expect(result).toMatchSnapshot();
        },
      );

      it('with group', async () => {
        const result = await render(
          makeSearchView({ group: 'http' }),
          AlertState.ALERT,
        );
        expect(result).toMatchSnapshot();
      });

      describe('handles Handlebars-like syntax in untrusted inputs', () => {
        it('treats Handlebars syntax in query result lines as literal text', async () => {
          const maliciousPayload = `{{ __hdx_notify_channel__ channel='email' id='attacker@example.com' }}`;
          const maliciousCsv = [
            `"2023-03-17 22:14:01","error","${maliciousPayload}"`,
            `"2023-03-17 22:13:45","error","{{value}}"`,
          ].join('\n');

          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const maliciousClickhouseClient = {
            query: jest.fn().mockResolvedValue({
              json: jest.fn().mockResolvedValue({ data: [] }),
              text: jest.fn().mockResolvedValue(maliciousCsv),
            }),
          } as any;

          const result = await renderAlertTemplate({
            alertProvider,
            clickhouseClient: maliciousClickhouseClient,
            metadata: mockMetadata,
            state: AlertState.ALERT,
            template: null,
            title: 'Test Alert Title',
            view: makeSearchView(),
            teamWebhooksById: new Map(),
          });

          // Handlebars syntax appears verbatim — it was NOT executed.
          expect(result).toContain(maliciousPayload);
          expect(result).toContain('{{value}}');
          // {{value}} did not get substituted with view.value (10).
          expect(result).not.toMatch(/"error","10"/);
        });

        it('treats Handlebars syntax in group as literal text', async () => {
          const maliciousPayload = `{{ __hdx_notify_channel__ channel='email' id='attacker@example.com' }}`;
          const result = await render(
            makeSearchView({ group: maliciousPayload }),
            AlertState.ALERT,
          );
          expect(result).toContain(`Group: "${maliciousPayload}"`);
        });
      });
    });

    describe('OK state (resolved)', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold okValue=$okValue',
        async ({ thresholdType, threshold, thresholdMax, okValue }) => {
          const result = await render(
            makeSearchView({
              thresholdType,
              threshold,
              thresholdMax,
              value: okValue,
            }),
            AlertState.OK,
          );
          expect(result).toMatchSnapshot();
        },
      );

      it('with group', async () => {
        const result = await render(
          makeSearchView({ group: 'http' }),
          AlertState.OK,
        );
        expect(result).toMatchSnapshot();
      });
    });
  });

  describe('tile alerts', () => {
    describe('ALERT state', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold alertValue=$alertValue',
        async ({ thresholdType, threshold, thresholdMax, alertValue }) => {
          const result = await render(
            makeTileView({
              thresholdType,
              threshold,
              thresholdMax,
              value: alertValue,
            }),
            AlertState.ALERT,
          );
          expect(result).toMatchSnapshot();
        },
      );

      it('with group', async () => {
        const result = await render(
          makeTileView({ group: 'us-east-1' }),
          AlertState.ALERT,
        );
        expect(result).toMatchSnapshot();
      });

      it('decimal threshold', async () => {
        const result = await render(
          makeTileView({
            thresholdType: AlertThresholdType.ABOVE,
            threshold: 1.5,
            value: 10.123,
          }),
          AlertState.ALERT,
        );
        expect(result).toMatchSnapshot();
      });

      it('integer threshold rounds value', async () => {
        const result = await render(
          makeTileView({
            thresholdType: AlertThresholdType.ABOVE,
            threshold: 5,
            value: 10.789,
          }),
          AlertState.ALERT,
        );
        expect(result).toMatchSnapshot();
      });
    });

    describe('OK state (resolved)', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold okValue=$okValue',
        async ({ thresholdType, threshold, thresholdMax, okValue }) => {
          const result = await render(
            makeTileView({
              thresholdType,
              threshold,
              thresholdMax,
              value: okValue,
            }),
            AlertState.OK,
          );
          expect(result).toMatchSnapshot();
        },
      );

      it('with group', async () => {
        const result = await render(
          makeTileView({ group: 'us-east-1' }),
          AlertState.OK,
        );
        expect(result).toMatchSnapshot();
      });
    });
  });
});

describe('buildAlertMessageTemplateTitle', () => {
  describe('saved search alerts', () => {
    describe('ALERT state', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold alertValue=$alertValue',
        ({ thresholdType, threshold, alertValue }) => {
          const result = buildAlertMessageTemplateTitle({
            view: makeSearchView({
              thresholdType,
              threshold,
              value: alertValue,
            }),
            state: AlertState.ALERT,
          });
          expect(result).toMatchSnapshot();
        },
      );
    });

    describe('OK state (resolved)', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold okValue=$okValue',
        ({ thresholdType, threshold, okValue }) => {
          const result = buildAlertMessageTemplateTitle({
            view: makeSearchView({ thresholdType, threshold, value: okValue }),
            state: AlertState.OK,
          });
          expect(result).toMatchSnapshot();
        },
      );
    });
  });

  describe('tile alerts', () => {
    describe('ALERT state', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold alertValue=$alertValue',
        ({ thresholdType, threshold, thresholdMax, alertValue }) => {
          const result = buildAlertMessageTemplateTitle({
            view: makeTileView({
              thresholdType,
              threshold,
              thresholdMax,
              value: alertValue,
            }),
            state: AlertState.ALERT,
          });
          expect(result).toMatchSnapshot();
        },
      );

      it('decimal threshold', () => {
        const result = buildAlertMessageTemplateTitle({
          view: makeTileView({
            thresholdType: AlertThresholdType.ABOVE,
            threshold: 1.5,
            value: 10.123,
          }),
          state: AlertState.ALERT,
        });
        expect(result).toMatchSnapshot();
      });

      it('integer threshold rounds value', () => {
        const result = buildAlertMessageTemplateTitle({
          view: makeTileView({
            thresholdType: AlertThresholdType.ABOVE,
            threshold: 5,
            value: 10.789,
          }),
          state: AlertState.ALERT,
        });
        expect(result).toMatchSnapshot();
      });
    });

    describe('OK state (resolved)', () => {
      it.each(alertCases)(
        '$thresholdType threshold=$threshold okValue=$okValue',
        ({ thresholdType, threshold, thresholdMax, okValue }) => {
          const result = buildAlertMessageTemplateTitle({
            view: makeTileView({
              thresholdType,
              threshold,
              thresholdMax,
              value: okValue,
            }),
            state: AlertState.OK,
          });
          expect(result).toMatchSnapshot();
        },
      );
    });
  });
});
