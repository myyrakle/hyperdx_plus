import { AlertState } from '@/models/alert';
import {
  AlertMessageParts,
  makeMessageField,
  Message,
  SLACK_MAX_FIELDS,
  SLACK_MAX_TEXT_LENGTH,
} from '@/tasks/checkAlerts/message';
import { buildSlackErrorPayload } from '@/tasks/checkAlerts/providers/slackError';

const baseParts: AlertMessageParts = {
  metricValue: '3',
  thresholdText: 'meets or exceeds 1',
  totalCount: 3,
  timeRangeText:
    'Time Range (UTC): [2026-08-12T00:00:00Z - 2026-08-12T00:05:00Z)',
  group: [makeMessageField('error_group_id', 'abc-123')],
  sampleFields: [makeMessageField('StatusMessage', 'relation does not exist')],
  titleLink: 'http://app:8080/search?filters=x',
};

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  hdxLink: 'http://app:8080/dashboards/d1',
  title: '🚨 Alert for "errors"',
  body: 'fallback body',
  state: AlertState.ALERT,
  startTime: 0,
  endTime: 1,
  eventId: 'event-1',
  parts: baseParts,
  ...overrides,
});

const attachmentsOf = (message: Message): any[] =>
  (buildSlackErrorPayload(message).attachments ?? []) as any[];

const first = (message: Message) => attachmentsOf(message)[0];
const last = (message: Message) => {
  const all = attachmentsOf(message);
  return all[all.length - 1];
};

describe('buildSlackErrorPayload', () => {
  describe('state colour', () => {
    it('marks a firing alert red', () => {
      expect(first(makeMessage()).color).toBe('danger');
    });

    it('marks a resolved alert green', () => {
      expect(first(makeMessage({ state: AlertState.OK })).color).toBe('good');
    });

    it('colours every attachment so the bar reads as one block', () => {
      const attachments = attachmentsOf(
        makeMessage({
          parts: {
            ...baseParts,
            sampleFields: [makeMessageField('code.stacktrace', 'a()\nb()')],
          },
        }),
      );

      expect(attachments.length).toBeGreaterThan(1);
      expect(attachments.every(a => a.color === 'danger')).toBe(true);
    });
  });

  describe('mention', () => {
    const withMention = (mention: string) =>
      buildSlackErrorPayload(
        makeMessage({ parts: { ...baseParts, mention } as any }),
      );

    it('goes in the top-level text, which is what Slack notifies on', () => {
      // A broadcast inside an attachment renders but does not reliably notify.
      expect(withMention('<!here>').text).toBe('<!here>');
    });

    it('stays out of the attachments', () => {
      const payload = withMention('<!here>');

      expect(JSON.stringify(payload.attachments)).not.toContain('<!here>');
    });

    it('sends no top-level text when no mention is configured', () => {
      expect(buildSlackErrorPayload(makeMessage()).text).toBeUndefined();
    });

    it('does not duplicate the title alongside the mention', () => {
      // The title lives in the attachment; a title in `text` would print twice.
      expect(withMention('<!here>').text).not.toContain('Alert for');
    });
  });

  describe('payload shape', () => {
    it('uses legacy attachment fields, which Slack colours', () => {
      // Slack does not draw the coloured left bar for an attachment whose body
      // is Block Kit `blocks`, so the content has to be title/text/fields.
      expect(first(makeMessage()).blocks).toBeUndefined();
    });

    it('sends no top-level blocks', () => {
      expect(buildSlackErrorPayload(makeMessage()).blocks).toBeUndefined();
    });

    it('summarises the attachment for notification previews', () => {
      expect(first(makeMessage()).fallback).toBe('🚨 Alert for "errors"');
    });

    it('marks text and fields as markdown', () => {
      expect(first(makeMessage()).mrkdwn_in).toEqual(['text', 'fields']);
    });
  });

  describe('title', () => {
    it('links the title at the group-scoped row list', () => {
      const attachment = first(makeMessage());

      expect(attachment.title).toBe('🚨 Alert for "errors"');
      expect(attachment.title_link).toBe('http://app:8080/search?filters=x');
    });
  });

  it('states the metric value and threshold', () => {
    expect(first(makeMessage()).text).toContain('*3* meets or exceeds 1');
  });

  it('renders group and short sample fields as two-column fields', () => {
    expect(first(makeMessage()).fields).toEqual([
      { title: 'error_group_id', value: 'abc-123', short: true },
      { title: 'StatusMessage', value: 'relation does not exist', short: true },
    ]);
  });

  describe('long values', () => {
    const withStack = makeMessage({
      parts: {
        ...baseParts,
        sampleFields: [makeMessageField('code.stacktrace', 'a()\nb()\nc()')],
      },
    });

    it('gets its own attachment with a code block', () => {
      const stack = attachmentsOf(withStack).find(a =>
        a.text?.includes('code.stacktrace'),
      );

      expect(stack.text).toBe('*code.stacktrace*\n```\na()\nb()\nc()\n```');
    });

    it('stays out of the two-column fields', () => {
      expect(first(withStack).fields).toEqual([
        { title: 'error_group_id', value: 'abc-123', short: true },
      ]);
    });
  });

  describe('footer', () => {
    it('carries the time range and event count', () => {
      expect(last(makeMessage()).footer).toBe(
        'Time Range (UTC): [2026-08-12T00:00:00Z - 2026-08-12T00:05:00Z) · 3 events',
      );
    });

    it('sits on the last attachment when long values follow', () => {
      const attachments = attachmentsOf(
        makeMessage({
          parts: {
            ...baseParts,
            sampleFields: [makeMessageField('code.stacktrace', 'a()\nb()')],
          },
        }),
      );

      expect(attachments[0].footer).toBeUndefined();
      expect(attachments[attachments.length - 1].footer).toContain('3 events');
    });

    it('links the alert own view when it differs from the title', () => {
      const message = makeMessage({
        parts: {
          ...baseParts,
          originLink: {
            url: 'http://app:8080/dashboards/d1',
            label: 'Open chart',
          },
        },
      });

      expect(last(message).text).toContain(
        '<http://app:8080/dashboards/d1 | Open chart>',
      );
    });

    it('puts that link below the fields, not above them', () => {
      // Legacy attachments always render `fields` after `text`, so a link left
      // in the head attachment's text would sit above the group values.
      const message = makeMessage({
        parts: {
          ...baseParts,
          originLink: {
            url: 'http://app:8080/dashboards/d1',
            label: 'Open chart',
          },
        },
      });
      const attachments = attachmentsOf(message);
      const withFields = attachments.findIndex(a => a.fields?.length);
      const withLink = attachments.findIndex(a =>
        a.text?.includes('Open chart'),
      );

      expect(withLink).toBeGreaterThan(withFields);
    });

    it('omits that link when the title already goes there', () => {
      expect(
        attachmentsOf(makeMessage())
          .map(a => a.text ?? '')
          .join(''),
      ).not.toContain('Open chart');
    });
  });

  describe('resolved alerts', () => {
    const resolved = makeMessage({ state: AlertState.OK });

    it('says the alert resolved instead of restating the metric', () => {
      expect(first(resolved).text).toContain('The alert has been resolved.');
    });

    it('drops sample fields but keeps the group', () => {
      expect(first(resolved).fields).toEqual([
        { title: 'error_group_id', value: 'abc-123', short: true },
      ]);
    });
  });

  describe('Slack payload limits', () => {
    it('truncates a code block that exceeds the per-attachment text limit', () => {
      const attachments = attachmentsOf(
        makeMessage({
          parts: {
            ...baseParts,
            sampleFields: [
              makeMessageField('code.stacktrace', 'x\n'.repeat(4000)),
            ],
          },
        }),
      );
      const stack = attachments.find(a => a.text?.includes('code.stacktrace'));

      expect(stack.text.length).toBeLessThanOrEqual(SLACK_MAX_TEXT_LENGTH);
      expect(stack.text).toContain('…(truncated)');
    });

    it('caps the fields list and reports how many were dropped', () => {
      const many = Array.from({ length: SLACK_MAX_FIELDS + 4 }, (_, i) =>
        makeMessageField(`field_${i}`, `value_${i}`),
      );
      const fields = first(
        makeMessage({
          parts: { ...baseParts, group: [], sampleFields: many },
        }),
      ).fields;

      expect(fields).toHaveLength(SLACK_MAX_FIELDS);
      expect(fields[SLACK_MAX_FIELDS - 1]).toEqual({
        title: '…',
        value: '(5 more)',
        short: true,
      });
    });
  });

  describe('without structured parts', () => {
    it('falls back to one coloured attachment with the plain body', () => {
      const attachments = attachmentsOf(makeMessage({ parts: undefined }));

      expect(attachments).toHaveLength(1);
      expect(attachments[0]).toEqual({
        fallback: '🚨 Alert for "errors"',
        color: 'danger',
        mrkdwn_in: ['text', 'fields'],
        title: '🚨 Alert for "errors"',
        title_link: 'http://app:8080/dashboards/d1',
        text: 'fallback body',
      });
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
