import { splitAndTrimWithBracket } from '@hyperdx/common-utils/dist/core/utils';

import logger from '@/utils/logger';

/**
 * Escape a value for use inside a ClickHouse single-quoted string literal.
 *
 * `Filter.condition` is a plain string, so query parameters are not available
 * on this path — escaping is the only defense. Backslashes must be escaped
 * before quotes so an escaped quote is not double-escaped.
 */
const escapeStringLiteral = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Pair each group-by expression with the group value at the same position.
 *
 * `attributes` comes from `parseAlertData`'s `extraFields`, which preserves the
 * SELECT column order and contains only the group-by columns. The column names
 * ClickHouse returns do not necessarily match the group-by expression text, so
 * the pairing is **positional**.
 *
 * @returns the pairs, or `undefined` when the alert has no group-by or the
 * shapes disagree. Callers then skip anything group-scoped.
 */
export const zipGroupValues = (
  groupBy: string | undefined,
  attributes: Record<string, string>,
): Array<[string, string]> | undefined => {
  if (!groupBy) {
    return undefined;
  }

  const expressions = splitAndTrimWithBracket(groupBy).filter(Boolean);
  const values = Object.values(attributes);

  if (expressions.length === 0 || expressions.length !== values.length) {
    logger.warn(
      {
        groupBy,
        expressionCount: expressions.length,
        valueCount: values.length,
      },
      'Cannot resolve alert group values: group-by expressions do not line up with group values',
    );
    return undefined;
  }

  return expressions.map((expression, i) => [expression, values[i]]);
};

/**
 * Build a SQL condition restricting rows to the group that fired an alert.
 *
 * Sample-row queries for grouped alerts must be narrowed to the alerting group,
 * otherwise the rows attached to the notification come from the whole search
 * rather than the group being alerted on.
 *
 * Values are compared through `toString()` because group-by columns may be
 * numeric, UUID, Enum or LowCardinality while group values are always strings.
 *
 * @returns the condition, or `undefined` when no filter can be built (no
 * group-by, or a shape mismatch). Callers fall back to an unfiltered query.
 */
export const buildGroupFilterCondition = (
  groupBy: string | undefined,
  attributes: Record<string, string>,
): string | undefined => {
  const pairs = zipGroupValues(groupBy, attributes);
  if (!pairs) {
    return undefined;
  }

  return pairs
    .map(([expression, value]) => {
      // A NULL group-by value arrives as an empty string, so an empty value has
      // to match both NULL and the literal empty string.
      if (value === '') {
        return `(${expression} IS NULL OR toString(${expression}) = '')`;
      }
      return `toString(${expression}) = '${escapeStringLiteral(value)}'`;
    })
    .join(' AND ');
};
