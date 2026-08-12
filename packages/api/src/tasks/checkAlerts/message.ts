import { AlertState } from '@/models/alert';

/** Slack truncates attachment text beyond this length. */
export const SLACK_MAX_TEXT_LENGTH = 3000;
/** Slack renders at most this many entries in an attachment's `fields` array. */
export const SLACK_MAX_FIELDS = 10;

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
 * rather than a markdown blob. Only populated for the `slack_error` service.
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
  /**
   * Where the title points: the row list scoped to the group that fired, or the
   * alert's own view when there is no group filter to apply.
   */
  titleLink: string;
  /**
   * The alert's own chart/search view. Only set when it differs from
   * `titleLink`, so the footer never repeats the title's destination.
   */
  originLink?: { url: string; label: string };
  /**
   * Pre-rendered Slack broadcast token (`<!here>`). Absent unless the alert opts
   * in, and never set on a resolution.
   */
  mention?: string;
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

/**
 * Broadcast mentions an alert can opt into. Stored as the bare name so the
 * Slack-specific syntax stays in one place.
 */
export type AlertMention = 'here' | 'channel';

const MENTION_TOKENS: Record<AlertMention, string> = {
  here: '<!here>',
  channel: '<!channel>',
};

/**
 * Render a stored mention as its Slack token.
 *
 * An unrecognised value yields nothing rather than a literal string Slack would
 * print as plain text — stored data can predate a change to the allowed values.
 */
export const renderMention = (
  mention: AlertMention | undefined,
): string | undefined =>
  mention == null ? undefined : MENTION_TOKENS[mention];

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
