import type { IncomingWebhookSendArguments } from '@slack/webhook';

import { AlertState } from '@/models/alert';
import {
  AlertMessageField,
  Message,
  SLACK_MAX_BLOCKS,
  SLACK_MAX_FIELDS,
  SLACK_MAX_TEXT_LENGTH,
  SlackBlocks,
} from '@/tasks/checkAlerts/message';

const TRUNCATION_SUFFIX = '\n…(truncated)';

const truncateForBlock = (text: string): string =>
  text.length <= SLACK_MAX_TEXT_LENGTH
    ? text
    : text.slice(0, SLACK_MAX_TEXT_LENGTH - TRUNCATION_SUFFIX.length) +
      TRUNCATION_SUFFIX;

const section = (text: string) => ({
  type: 'section' as const,
  text: { type: 'mrkdwn' as const, text: truncateForBlock(text) },
});

const fieldEntry = (text: string) => ({
  type: 'mrkdwn' as const,
  text: truncateForBlock(text),
});

/**
 * Render the two-column fields block, capping at Slack's limit. A dropped-count
 * entry replaces the last slot so a truncated payload never looks complete.
 */
const fieldsBlock = (fields: AlertMessageField[]) => {
  if (fields.length === 0) {
    return undefined;
  }

  const entries =
    fields.length <= SLACK_MAX_FIELDS
      ? fields.map(f => fieldEntry(`*${f.label}*\n${f.value}`))
      : [
          ...fields
            .slice(0, SLACK_MAX_FIELDS - 1)
            .map(f => fieldEntry(`*${f.label}*\n${f.value}`)),
          fieldEntry(`…(${fields.length - (SLACK_MAX_FIELDS - 1)} more)`),
        ];

  return { type: 'section' as const, fields: entries };
};

const buildBlocks = (message: Message): SlackBlocks => {
  const { parts } = message;

  // No structured parts means the alert's query could not be resolved; deliver
  // the plain body rather than dropping the notification.
  if (!parts) {
    return [
      section(`*<${message.hdxLink} | ${message.title}>*\n${message.body}`),
    ];
  }

  const isResolved = message.state === AlertState.OK;
  const blocks: SlackBlocks = [
    section(`*<${parts.titleLink} | ${message.title}>*`),
    section(
      isResolved
        ? 'The alert has been resolved.'
        : `*${parts.metricValue}* ${parts.thresholdText}`,
    ),
  ];

  const sampleFields = isResolved ? [] : parts.sampleFields;
  const shortFields = [
    ...parts.group,
    ...sampleFields.filter(field => !field.long),
  ];
  const summary = fieldsBlock(shortFields);
  if (summary) {
    blocks.push(summary);
  }

  for (const field of sampleFields.filter(f => f.long)) {
    // Each long value gets a divider so consecutive stack traces stay legible.
    // Leave room for the trailing context block.
    if (blocks.length + 3 > SLACK_MAX_BLOCKS) {
      break;
    }
    blocks.push({ type: 'divider' as const });
    blocks.push(section(`*${field.label}*\n\`\`\`\n${field.value}\n\`\`\``));
  }

  const contextParts = [
    `${parts.timeRangeText} · ${parts.totalCount} events`,
    ...(parts.originLink
      ? [`<${parts.originLink.url} | ${parts.originLink.label}>`]
      : []),
  ];
  blocks.push({
    type: 'context' as const,
    elements: [
      {
        type: 'mrkdwn' as const,
        text: truncateForBlock(contextParts.join(' · ')),
      },
    ],
  });

  return blocks;
};

/**
 * Render an alert notification for the error-oriented Slack service.
 *
 * The blocks are wrapped in a single attachment because Slack only draws the
 * coloured left bar on attachments — top-level `blocks` cannot carry it. The
 * colour is the at-a-glance state signal: red while firing, green once resolved.
 */
export const buildSlackErrorPayload = (
  message: Message,
): IncomingWebhookSendArguments => ({
  // No top-level `text`: Slack renders it as its own line above the attachment,
  // which would print the title twice. `fallback` covers the same need — plain
  // text for mobile notifications and clients that do not render blocks.
  attachments: [
    {
      fallback: message.title,
      color: message.state === AlertState.OK ? 'good' : 'danger',
      blocks: buildBlocks(message),
    },
  ],
});
