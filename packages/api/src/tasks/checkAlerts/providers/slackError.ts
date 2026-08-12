import type { IncomingWebhookSendArguments } from '@slack/webhook';

import { AlertState } from '@/models/alert';
import {
  AlertMessageField,
  Message,
  SLACK_MAX_FIELDS,
  SLACK_MAX_TEXT_LENGTH,
} from '@/tasks/checkAlerts/message';

type SlackAttachment = NonNullable<
  IncomingWebhookSendArguments['attachments']
>[number];

const TRUNCATION_SUFFIX = '\n…(truncated)';

/** Slack renders markdown in these attachment fields only when opted in. */
const MRKDWN_IN: NonNullable<SlackAttachment['mrkdwn_in']> = ['text', 'fields'];

const truncate = (text: string): string =>
  text.length <= SLACK_MAX_TEXT_LENGTH
    ? text
    : text.slice(0, SLACK_MAX_TEXT_LENGTH - TRUNCATION_SUFFIX.length) +
      TRUNCATION_SUFFIX;

/**
 * Two-column fields, capped at Slack's limit. A dropped-count entry replaces the
 * last slot so a truncated payload never looks complete.
 */
const toAttachmentFields = (fields: AlertMessageField[]) => {
  const entry = (field: AlertMessageField) => ({
    title: field.label,
    value: truncate(field.value),
    short: true,
  });

  if (fields.length <= SLACK_MAX_FIELDS) {
    return fields.map(entry);
  }
  return [
    ...fields.slice(0, SLACK_MAX_FIELDS - 1).map(entry),
    {
      title: '…',
      value: `(${fields.length - (SLACK_MAX_FIELDS - 1)} more)`,
      short: true,
    },
  ];
};

/**
 * Render an alert notification for the error-oriented Slack service.
 *
 * Uses the legacy attachment shape (title / text / fields) rather than Block
 * Kit: Slack only draws the coloured left bar — the at-a-glance state signal,
 * red while firing and green once resolved — on attachments styled this way, and
 * ignores `color` when the attachment body is `blocks`.
 *
 * Long values get their own attachment so they can sit below the two-column
 * fields, which legacy attachments always render last. Every attachment carries
 * the same colour so the bar reads as one continuous block.
 */
export const buildSlackErrorPayload = (
  message: Message,
): IncomingWebhookSendArguments => {
  const { parts } = message;
  const color = message.state === AlertState.OK ? 'good' : 'danger';
  const base = () => ({
    color,
    mrkdwn_in: [...MRKDWN_IN],
  });

  // No structured parts means the alert's query could not be resolved; deliver
  // the plain body rather than dropping the notification.
  if (!parts) {
    return {
      attachments: [
        {
          fallback: message.title,
          ...base(),
          title: message.title,
          title_link: message.hdxLink,
          text: truncate(message.body),
        },
      ],
    };
  }

  const isResolved = message.state === AlertState.OK;
  const sampleFields = isResolved ? [] : parts.sampleFields;
  const shortFields = [
    ...parts.group,
    ...sampleFields.filter(field => !field.long),
  ];

  const head: SlackAttachment = {
    fallback: message.title,
    ...base(),
    title: message.title,
    title_link: parts.titleLink,
    text: truncate(
      isResolved
        ? 'The alert has been resolved.'
        : `*${parts.metricValue}* ${parts.thresholdText}`,
    ),
    ...(shortFields.length > 0 && { fields: toAttachmentFields(shortFields) }),
  };

  const longAttachments: SlackAttachment[] = sampleFields
    .filter(field => field.long)
    .map(field => ({
      ...base(),
      text: truncate(`*${field.label}*\n\`\`\`\n${field.value}\n\`\`\``),
    }));

  const attachments = [head, ...longAttachments];

  // Footers are plain text, so a link has to live in `text` — and legacy
  // attachments always render `fields` after `text`, which would put the link
  // above the group values. Give it its own trailing attachment instead.
  if (parts.originLink) {
    attachments.push({
      ...base(),
      text: `<${parts.originLink.url} | ${parts.originLink.label}>`,
    });
  }

  // The footer belongs on whatever ends up last, so it reads as the message's
  // closing line rather than being buried above a stack trace.
  attachments[attachments.length - 1].footer = truncate(
    `${parts.timeRangeText} · ${parts.totalCount} events`,
  );

  return {
    // A broadcast inside an attachment renders but does not reliably notify, so
    // it goes in the top-level text. Nothing else does: Slack prints top-level
    // text as its own line above the attachment, which would repeat the title.
    ...(parts.mention && { text: parts.mention }),
    attachments,
  };
};
