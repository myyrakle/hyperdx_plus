import {
  buildGroupFilterCondition,
  zipGroupValues,
} from '@/tasks/checkAlerts/groupFilter';

describe('zipGroupValues', () => {
  it('pairs each group-by expression with the value at the same position', () => {
    expect(
      zipGroupValues('ServiceName, SeverityText', {
        col_0: 'api',
        col_1: 'error',
      }),
    ).toEqual([
      ['ServiceName', 'api'],
      ['SeverityText', 'error'],
    ]);
  });

  it('keeps bracketed expressions whole', () => {
    expect(
      zipGroupValues("ResourceAttributes['a,b'], ServiceName", {
        x: '1',
        y: '2',
      }),
    ).toEqual([
      ["ResourceAttributes['a,b']", '1'],
      ['ServiceName', '2'],
    ]);
  });

  it('returns undefined without a group-by', () => {
    expect(zipGroupValues(undefined, { a: '1' })).toBeUndefined();
  });

  it('returns undefined on a count mismatch', () => {
    expect(zipGroupValues('a, b', { x: '1' })).toBeUndefined();
  });

  describe('tile group-by, which is a select list rather than a string', () => {
    it('reads each entry as an expression', () => {
      expect(
        zipGroupValues(
          [{ valueExpression: 'ServiceName' }, { valueExpression: 'SpanName' }],
          { a: 'api', b: 'GET /x' },
        ),
      ).toEqual([
        ['ServiceName', 'api'],
        ['SpanName', 'GET /x'],
      ]);
    });

    it('filters on the expression, not the alias', () => {
      // The alias only exists in the SELECT list; a WHERE clause at the same
      // level cannot reference it.
      expect(
        zipGroupValues(
          [{ valueExpression: "SpanAttributes['k']", alias: 'k' }],
          { k: 'v' },
        ),
      ).toEqual([["SpanAttributes['k']", 'v']]);
    });

    it('returns undefined for an empty list', () => {
      expect(zipGroupValues([], { a: '1' })).toBeUndefined();
    });

    it('skips entries with a blank expression', () => {
      expect(
        zipGroupValues(
          [{ valueExpression: 'ServiceName' }, { valueExpression: '' }],
          {
            a: 'api',
          },
        ),
      ).toEqual([['ServiceName', 'api']]);
    });
  });
});

describe('buildGroupFilterCondition', () => {
  it('builds an equality condition for a single group-by expression', () => {
    expect(
      buildGroupFilterCondition('ServiceName', { ServiceName: 'api' }),
    ).toBe("toString(ServiceName) = 'api'");
  });

  it('joins multiple group-by expressions with AND in group-by order', () => {
    expect(
      buildGroupFilterCondition('ServiceName, SeverityText', {
        ServiceName: 'api',
        SeverityText: 'error',
      }),
    ).toBe(
      "toString(ServiceName) = 'api' AND toString(SeverityText) = 'error'",
    );
  });

  it('keeps commas inside brackets as part of a single expression', () => {
    expect(
      buildGroupFilterCondition("SpanAttributes['a,b']", {
        "SpanAttributes['a,b']": 'x',
      }),
    ).toBe("toString(SpanAttributes['a,b']) = 'x'");
  });

  it('matches NULL and empty string when the group value is empty', () => {
    expect(buildGroupFilterCondition('ServiceName', { ServiceName: '' })).toBe(
      "(ServiceName IS NULL OR toString(ServiceName) = '')",
    );
  });

  it('escapes single quotes in group values', () => {
    expect(
      buildGroupFilterCondition('ServiceName', { ServiceName: "it's" }),
    ).toBe("toString(ServiceName) = 'it\\'s'");
  });

  it('escapes backslashes in group values', () => {
    expect(buildGroupFilterCondition('Path', { Path: 'C:\\tmp' })).toBe(
      "toString(Path) = 'C:\\\\tmp'",
    );
  });

  it('pairs expressions with attribute values by position, not by key name', () => {
    // ClickHouse returns group-by columns aliased differently from the
    // expression text, so the pairing must rely on insertion order.
    expect(
      buildGroupFilterCondition("ResourceAttributes['k8s.pod.name']", {
        "ResourceAttributes['k8s.pod.name'] AS pod": 'pod-1',
      }),
    ).toBe("toString(ResourceAttributes['k8s.pod.name']) = 'pod-1'");
  });

  it('returns undefined when the alert has no group-by', () => {
    expect(buildGroupFilterCondition(undefined, {})).toBeUndefined();
    expect(buildGroupFilterCondition('', {})).toBeUndefined();
  });

  it('returns undefined when expression and value counts disagree', () => {
    expect(
      buildGroupFilterCondition('ServiceName, SeverityText', {
        ServiceName: 'api',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when there are no attribute values', () => {
    expect(buildGroupFilterCondition('ServiceName', {})).toBeUndefined();
  });
});
