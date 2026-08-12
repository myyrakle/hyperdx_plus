import { Filter } from '@hyperdx/common-utils/dist/types';

import { ISavedSearch } from '@/models/savedSearch';

/**
 * Encode a value the way the app's `parseAsStringEncoded` / `parseAsJsonEncoded`
 * parsers expect. They run `decodeURIComponent` on top of the decoding
 * `URLSearchParams.get()` already does, so values are encoded once here and a
 * second time by `URLSearchParams.toString()`.
 */
const encodeParam = (value: string): string => encodeURIComponent(value);

/**
 * Build a link to the search page for an alert.
 *
 * Without `groupFilterCondition` this yields the time-range-only link the app
 * has always produced: landing on `/search/:id` with no config params lets the
 * page hydrate itself from the saved search.
 *
 * With `groupFilterCondition` the link must additionally scope the search to the
 * group that fired. The page only hydrates from the saved search when the URL
 * carries *no* config at all (`isSearchConfigEmpty` in `DBSearchPage`), so
 * adding a filter means the whole config has to travel in the URL too —
 * otherwise source/where/select would land empty.
 */
export const buildSearchLinkUrl = ({
  endTime,
  frontendUrl,
  groupFilterCondition,
  savedSearch,
  startTime,
}: {
  endTime: Date;
  frontendUrl: string;
  groupFilterCondition?: string;
  savedSearch: ISavedSearch;
  startTime: Date;
}): string => {
  const url = new URL(`${frontendUrl}/search/${savedSearch.id}`);
  const queryParams = new URLSearchParams({
    from: startTime.getTime().toString(),
    to: endTime.getTime().toString(),
    isLive: 'false',
  });

  if (groupFilterCondition) {
    const filters: Filter[] = [
      ...(savedSearch.filters ?? []),
      { type: 'sql', condition: groupFilterCondition },
    ];

    queryParams.set('source', String(savedSearch.source));
    if (savedSearch.whereLanguage) {
      queryParams.set('whereLanguage', savedSearch.whereLanguage);
    }
    if (savedSearch.where) {
      queryParams.set('where', encodeParam(savedSearch.where));
    }
    if (savedSearch.select) {
      queryParams.set('select', encodeParam(savedSearch.select));
    }
    if (savedSearch.orderBy) {
      queryParams.set('orderBy', encodeParam(savedSearch.orderBy));
    }
    queryParams.set('filters', encodeParam(JSON.stringify(filters)));
  }

  url.search = queryParams.toString();
  return url.toString();
};
