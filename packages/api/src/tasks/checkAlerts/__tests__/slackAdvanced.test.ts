import { AlertState } from '@/models/alert';
import {
  AlertMessageParts,
  makeMessageField,
  Message,
  SLACK_MAX_FIELDS,
  SLACK_MAX_TEXT_LENGTH,
} from '@/tasks/checkAlerts/message';
import { buildSlackAdvancedBlocks } from '@/tasks/checkAlerts/providers/slackAdvanced';

const baseParts: AlertMessageParts = {
  metricValue: '12',
  thresholdText: 'lines found, which exceeds the threshold of 5 lines',
  totalCount: 12,
  timeRangeText:
    'Time Range (UTC): [2026-08-12T00:00:00Z - 2026-08-12T00:05:00Z)',
  group: [makeMessageField('error_group_id', 'abc-123')],
  sampleFields: [makeMessageField('exception.message', 'connection refused')],
};

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  hdxLink: 'http://app:8080/search/1',
  title: '🚨 Alert for "errors"',
  body: 'fallback body',
  state: AlertState.ALERT,
  startTime: 0,
  endTime: 1,
  eventId: 'event-1',
  parts: baseParts,
  ...overrides,
});

/** All mrkdwn text in a blocks payload, flattened for substring assertions. */
const allText = (blocks: any[]): string =>
  JSON.stringify(blocks.map(b => [b.text?.text, b.fields, b.elements]));

const sectionsWithFields = (blocks: any[]) =>
  blocks.filter(b => b.type === 'section' && Array.isArray(b.fields));

describe('buildSlackAdvancedBlocks', () => {
  it('links the title in the first block', () => {
    const blocks = buildSlackAdvancedBlocks(makeMessage()) as any[];

    expect(blocks[0]).toEqual({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*<http://app:8080/search/1 | 🚨 Alert for "errors">*',
      },
    });
  });

  it('states the metric value and threshold', () => {
    const blocks = buildSlackAdvancedBlocks(makeMessage()) as any[];

    expect((blocks[1] as any).text.text).toBe(
      '*12* lines found, which exceeds the threshold of 5 lines',
    );
  });

  it('renders group and short sample fields as labelled fields', () => {
    const blocks = buildSlackAdvancedBlocks(makeMessage()) as any[];
    const fields = sectionsWithFields(blocks).flatMap(b => b.fields);

    expect(fields).toEqual([
      { type: 'mrkdwn', text: '*error_group_id*\nabc-123' },
      { type: 'mrkdwn', text: '*exception.message*\nconnection refused' },
    ]);
  });

  it('renders a long field as its own code block after a divider', () => {
    const stacktrace = 'at foo()\nat bar()\nat baz()';
    const blocks = buildSlackAdvancedBlocks(
      makeMessage({
        parts: {
          ...baseParts,
          sampleFields: [makeMessageField('exception.stacktrace', stacktrace)],
        },
      }),
    ) as any[];

    const dividerIndex = blocks.findIndex(b => b.type === 'divider');
    expect(dividerIndex).toBeGreaterThan(-1);
    expect((blocks[dividerIndex + 1] as any).text.text).toBe(
      '*exception.stacktrace*\n```\nat foo()\nat bar()\nat baz()\n```',
    );
  });

  it('does not put long fields in the two-column fields block', () => {
    const blocks = buildSlackAdvancedBlocks(
      makeMessage({
        parts: {
          ...baseParts,
          sampleFields: [
            makeMessageField('exception.stacktrace', 'at foo()\nat bar()'),
          ],
        },
      }),
    ) as any[];

    const fields = sectionsWithFields(blocks).flatMap(b => b.fields);
    expect(fields).toEqual([
      { type: 'mrkdwn', text: '*error_group_id*\nabc-123' },
    ]);
  });

  it('ends with a context block carrying the time range and event count', () => {
    const blocks = buildSlackAdvancedBlocks(makeMessage()) as any[];
    const context = blocks[blocks.length - 1];

    expect(context.type).toBe('context');
    expect(context.elements[0].text).toBe(
      'Time Range (UTC): [2026-08-12T00:00:00Z - 2026-08-12T00:05:00Z) · 12 events',
    );
  });

  it('adds a group-scoped search link to the context when available', () => {
    const blocks = buildSlackAdvancedBlocks(
      makeMessage({
        parts: {
          ...baseParts,
          groupSearchLink: 'http://app:8080/search/1?x=1',
        },
      }),
    ) as any[];

    expect(allText(blocks)).toContain(
      '<http://app:8080/search/1?x=1 | View this group in HyperDX>',
    );
  });

  it('omits the group link when there is none', () => {
    const blocks = buildSlackAdvancedBlocks(makeMessage()) as any[];

    expect(allText(blocks)).not.toContain('View this group in HyperDX');
  });

  describe('resolved alerts', () => {
    const resolved = makeMessage({ state: AlertState.OK });

    it('says the alert resolved instead of restating the metric', () => {
      const blocks = buildSlackAdvancedBlocks(resolved) as any[];

      expect((blocks[1] as any).text.text).toBe('The alert has been resolved.');
    });

    it('drops sample fields but keeps the group', () => {
      const blocks = buildSlackAdvancedBlocks(resolved) as any[];
      const fields = sectionsWithFields(blocks).flatMap(b => b.fields);

      expect(fields).toEqual([
        { type: 'mrkdwn', text: '*error_group_id*\nabc-123' },
      ]);
    });
  });

  describe('Slack payload limits', () => {
    it('truncates a code block that exceeds the per-block text limit', () => {
      const blocks = buildSlackAdvancedBlocks(
        makeMessage({
          parts: {
            ...baseParts,
            sampleFields: [
              makeMessageField('exception.stacktrace', 'x\n'.repeat(4000)),
            ],
          },
        }),
      ) as any[];

      const codeBlock = blocks.find(b =>
        b.text?.text?.includes('exception.stacktrace'),
      ) as any;

      expect(codeBlock.text.text.length).toBeLessThanOrEqual(
        SLACK_MAX_TEXT_LENGTH,
      );
      expect(codeBlock.text.text).toContain('…(truncated)');
    });

    it('caps the fields block and reports how many were dropped', () => {
      const many = Array.from({ length: SLACK_MAX_FIELDS + 4 }, (_, i) =>
        makeMessageField(`field_${i}`, `value_${i}`),
      );
      const blocks = buildSlackAdvancedBlocks(
        makeMessage({
          parts: { ...baseParts, group: [], sampleFields: many },
        }),
      ) as any[];

      const fields = sectionsWithFields(blocks).flatMap(b => b.fields);
      expect(fields).toHaveLength(SLACK_MAX_FIELDS);
      expect(fields[SLACK_MAX_FIELDS - 1].text).toBe('…(5 more)');
    });
  });

  describe('without structured parts', () => {
    it('falls back to the plain single-section layout', () => {
      const blocks = buildSlackAdvancedBlocks(
        makeMessage({ parts: undefined }),
      ) as any[];

      expect(blocks).toEqual([
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*<http://app:8080/search/1 | 🚨 Alert for "errors">*\nfallback body',
          },
        },
      ]);
    });
  });
});

describe('makeMessageField', () => {
  it('marks a single-line short value as short', () => {
    expect(makeMessageField('a', 'b')).toEqual({
      label: 'a',
      value: 'b',
      long: false,
    });
  });

  it('marks a multi-line value as long', () => {
    expect(makeMessageField('a', 'line1\nline2').long).toBe(true);
  });

  it('marks a value over 200 characters as long', () => {
    expect(makeMessageField('a', 'x'.repeat(201)).long).toBe(true);
    expect(makeMessageField('a', 'x'.repeat(200)).long).toBe(false);
  });
});
