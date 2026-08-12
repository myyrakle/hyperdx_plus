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

/**
 * Render an alert notification as Slack Block Kit blocks.
 *
 * Falls back to the plain single-section layout used by the `slack` service when
 * the message carries no structured parts, so a delivery is never dropped just
 * because the representative-row lookup failed.
 */
export const buildSlackAdvancedBlocks = (message: Message): SlackBlocks => {
  const titleText = `*<${message.hdxLink} | ${message.title}>*`;
  const { parts } = message;

  if (!parts) {
    return [section(`${titleText}\n${message.body}`)];
  }

  const isResolved = message.state === AlertState.OK;
  const blocks: SlackBlocks = [
    section(titleText),
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
    ...(parts.groupSearchLink
      ? [`<${parts.groupSearchLink} | View this group in HyperDX>`]
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
