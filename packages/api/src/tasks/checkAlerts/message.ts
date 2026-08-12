import type { IncomingWebhookSendArguments } from '@slack/webhook';

import { AlertState } from '@/models/alert';

/**
 * Slack block payload type, derived from the webhook client rather than
 * imported from `@slack/types` (a transitive dependency).
 */
export type SlackBlocks = NonNullable<IncomingWebhookSendArguments['blocks']>;

/** Slack rejects a block whose text exceeds this length. */
export const SLACK_MAX_TEXT_LENGTH = 3000;
/** Slack renders at most this many entries in a section's `fields` array. */
export const SLACK_MAX_FIELDS = 10;
/** Slack rejects a message with more blocks than this. */
export const SLACK_MAX_BLOCKS = 50;

/**
 * A value long enough that Slack's two-column `fields` layout would mangle it,
 * so it gets its own full-width code block instead.
 */
const LONG_VALUE_LENGTH = 200;

export type AlertMessageField = {
  label: string;
  value: string;
  /** Render as a full-width code block rather than a two-column field. */
  long: boolean;
};

export const makeMessageField = (
  label: string,
  value: string,
): AlertMessageField => ({
  label,
  value,
  long: value.includes('\n') || value.length > LONG_VALUE_LENGTH,
});

/**
 * Structured view of an alert notification, for channels that render layout
 * rather than a markdown blob. Only populated for the `slack_advanced` service.
 */
export type AlertMessageParts = {
  /** Threshold-matched value, e.g. "12". */
  metricValue: string;
  /** Sentence tail describing the breach, e.g. "lines found, which ...". */
  thresholdText: string;
  totalCount: number;
  /** Pre-formatted time range line, shared with the plain-text body. */
  timeRangeText: string;
  /** The group-by columns and their values for the group that fired. */
  group: AlertMessageField[];
  /** Fields pulled from a representative row of the group. */
  sampleFields: AlertMessageField[];
  /** Search link scoped to this group. Absent for non-grouped alerts. */
  groupSearchLink?: string;
};

/**
 * Strip a SQL expression down to a readable label:
 * `SpanAttributes['exception.message']` becomes `exception.message`.
 * Anything that is not a trailing bracketed key is left alone.
 */
export const formatFieldLabel = (expression: string): string => {
  const bracketedKey = expression.match(/\[\s*'([^']*)'\s*\]$/);
  return bracketedKey ? bracketedKey[1] : expression;
};

export interface Message {
  hdxLink: string;
  title: string;
  body: string;
  state: AlertState;
  startTime: number;
  endTime: number;
  eventId: string;
  parts?: AlertMessageParts;
}
