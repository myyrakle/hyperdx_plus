import {
  buildGroupSearchLinkUrl,
  buildSearchLinkUrl,
} from '@/tasks/checkAlerts/searchLink';

describe('buildGroupSearchLinkUrl', () => {
  const build = (overrides: Record<string, unknown> = {}) =>
    buildGroupSearchLinkUrl({
      frontendUrl: 'http://app:8080',
      startTime: new Date('2023-03-17T22:13:03.103Z'),
      endTime: new Date('2023-03-17T22:13:59.103Z'),
      sourceId: 'source-1',
      groupFilterCondition: "toString(ServiceName) = 'api'",
      query: {
        where: 'StatusCode:Error',
        whereLanguage: 'lucene',
        filters: [{ type: 'sql', condition: 'ServiceName IS NOT NULL' }],
      },
      ...overrides,
    });

  const readEncoded = (url: string, key: string): string | null => {
    const raw = new URL(url).searchParams.get(key);
    return raw == null ? null : decodeURIComponent(raw);
  };

  it('targets the source-based search route, which needs no saved search', () => {
    expect(new URL(build()).pathname).toBe('/search');
  });

  it('carries the source and time range', () => {
    const params = new URL(build()).searchParams;

    expect(params.get('source')).toBe('source-1');
    expect(params.get('from')).toBe('1679091183103');
    expect(params.get('to')).toBe('1679091239103');
    expect(params.get('isLive')).toBe('false');
  });

  it('carries the tile predicate', () => {
    const url = build();

    expect(readEncoded(url, 'where')).toBe('StatusCode:Error');
    expect(new URL(url).searchParams.get('whereLanguage')).toBe('lucene');
  });

  it('appends the group filter after the tile filters', () => {
    expect(JSON.parse(readEncoded(build(), 'filters')!)).toEqual([
      { type: 'sql', condition: 'ServiceName IS NOT NULL' },
      { type: 'sql', condition: "toString(ServiceName) = 'api'" },
    ]);
  });

  it('sends only the group filter when the tile has none', () => {
    const url = build({
      query: { where: '', whereLanguage: 'sql', filters: undefined },
    });

    expect(JSON.parse(readEncoded(url, 'filters')!)).toEqual([
      { type: 'sql', condition: "toString(ServiceName) = 'api'" },
    ]);
  });

  it('omits an empty predicate rather than sending a blank one', () => {
    const params = new URL(
      build({ query: { where: '', whereLanguage: 'sql' } }),
    ).searchParams;

    expect(params.get('where')).toBeNull();
  });

  it('round-trips a condition containing quotes', () => {
    const condition = "toString(StatusMessage) = 'it\\'s broken'";

    expect(
      JSON.parse(
        readEncoded(build({ groupFilterCondition: condition }), 'filters')!,
      ),
    ).toContainEqual({ type: 'sql', condition });
  });
});

const FRONTEND_URL = 'http://app:8080';
const START = new Date('2023-03-17T22:13:03.103Z');
const END = new Date('2023-03-17T22:13:59.103Z');

const savedSearch: any = {
  id: 'saved-search-1',
  source: 'source-1',
  select: 'Timestamp, Body',
  where: 'Body: "error"',
  whereLanguage: 'lucene',
  orderBy: 'Timestamp DESC',
  filters: [{ type: 'sql', condition: 'ServiceName IS NOT NULL' }],
};

/**
 * Mirrors how the app reads an encoded param: URLSearchParams.get() undoes the
 * transport layer, then the nuqs parser runs decodeURIComponent once more.
 */
const readEncoded = (url: string, key: string): string | null => {
  const raw = new URL(url).searchParams.get(key);
  return raw == null ? null : decodeURIComponent(raw);
};

describe('buildSearchLinkUrl', () => {
  describe('without a group filter', () => {
    it('produces the time-range-only URL', () => {
      expect(
        buildSearchLinkUrl({
          frontendUrl: FRONTEND_URL,
          savedSearch,
          startTime: START,
          endTime: END,
        }),
      ).toBe(
        'http://app:8080/search/saved-search-1?from=1679091183103&to=1679091239103&isLive=false',
      );
    });

    it('does not carry any saved-search config', () => {
      const result = buildSearchLinkUrl({
        frontendUrl: FRONTEND_URL,
        savedSearch,
        startTime: START,
        endTime: END,
      });
      const params = new URL(result).searchParams;

      for (const key of [
        'source',
        'where',
        'whereLanguage',
        'select',
        'orderBy',
        'filters',
      ]) {
        expect(params.get(key)).toBeNull();
      }
    });
  });

  describe('with a group filter', () => {
    const build = (overrides: Record<string, unknown> = {}) =>
      buildSearchLinkUrl({
        frontendUrl: FRONTEND_URL,
        savedSearch: { ...savedSearch, ...overrides },
        startTime: START,
        endTime: END,
        groupFilterCondition: "toString(ServiceName) = 'api'",
      });

    it('keeps the time range params', () => {
      const params = new URL(build()).searchParams;

      expect(params.get('from')).toBe('1679091183103');
      expect(params.get('to')).toBe('1679091239103');
      expect(params.get('isLive')).toBe('false');
    });

    it('carries the full saved-search config so the app does not blank it out', () => {
      const result = build();
      const params = new URL(result).searchParams;

      expect(params.get('source')).toBe('source-1');
      expect(params.get('whereLanguage')).toBe('lucene');
      expect(readEncoded(result, 'where')).toBe('Body: "error"');
      expect(readEncoded(result, 'select')).toBe('Timestamp, Body');
      expect(readEncoded(result, 'orderBy')).toBe('Timestamp DESC');
    });

    it('appends the group filter after the saved search filters', () => {
      expect(JSON.parse(readEncoded(build(), 'filters')!)).toEqual([
        { type: 'sql', condition: 'ServiceName IS NOT NULL' },
        { type: 'sql', condition: "toString(ServiceName) = 'api'" },
      ]);
    });

    it('sends only the group filter when the saved search has none', () => {
      expect(
        JSON.parse(readEncoded(build({ filters: undefined }), 'filters')!),
      ).toEqual([{ type: 'sql', condition: "toString(ServiceName) = 'api'" }]);
    });

    it('round-trips values containing quotes, spaces and newlines', () => {
      const where = "Body = 'it\\'s'\nAND ServiceName = 'a b'";
      const result = build({ where });

      expect(readEncoded(result, 'where')).toBe(where);
    });

    it('round-trips a group condition containing quotes', () => {
      const result = buildSearchLinkUrl({
        frontendUrl: FRONTEND_URL,
        savedSearch,
        startTime: START,
        endTime: END,
        groupFilterCondition: "toString(ServiceName) = 'it\\'s a b'",
      });

      expect(JSON.parse(readEncoded(result, 'filters')!)).toContainEqual({
        type: 'sql',
        condition: "toString(ServiceName) = 'it\\'s a b'",
      });
    });

    it('omits config keys the saved search does not define', () => {
      const result = build({ orderBy: undefined, select: '' });
      const params = new URL(result).searchParams;

      expect(params.get('orderBy')).toBeNull();
      expect(params.get('select')).toBeNull();
      // The group filter still applies.
      expect(params.get('filters')).not.toBeNull();
    });

    it('stringifies a non-string source id', () => {
      const result = build({ source: { toString: () => 'objectid-1' } });

      expect(new URL(result).searchParams.get('source')).toBe('objectid-1');
    });
  });
});
