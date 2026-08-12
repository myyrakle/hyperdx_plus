import {
  Filter,
  SearchConditionLanguage,
} from '@hyperdx/common-utils/dist/types';

import { ISavedSearch } from '@/models/savedSearch';

/**
 * The predicate a search link has to reproduce. Saved-search alerts take it from
 * the saved search, tile alerts from the tile's chart config.
 */
export type SearchLinkQuery = {
  where?: string | null;
  whereLanguage?: SearchConditionLanguage | null;
  select?: string | null;
  orderBy?: string | null;
  filters?: Filter[] | null;
};

/**
 * Encode a value the way the app's `parseAsStringEncoded` / `parseAsJsonEncoded`
 * parsers expect. They run `decodeURIComponent` on top of the decoding
 * `URLSearchParams.get()` already does, so values are encoded once here and a
 * second time by `URLSearchParams.toString()`.
 */
const encodeParam = (value: string): string => encodeURIComponent(value);

/**
 * Put the whole search config on the URL, scoped to one group.
 *
 * The search page only hydrates from its own stored config when the URL carries
 * *no* config at all (`isSearchConfigEmpty` in `DBSearchPage`), so adding a
 * filter means everything else has to travel with it — otherwise
 * source/where/select land empty.
 */
const setSearchConfigParams = (
  queryParams: URLSearchParams,
  {
    groupFilterCondition,
    query,
    sourceId,
  }: {
    groupFilterCondition: string;
    query: SearchLinkQuery;
    sourceId: string;
  },
) => {
  const filters: Filter[] = [
    ...(query.filters ?? []),
    { type: 'sql', condition: groupFilterCondition },
  ];

  queryParams.set('source', sourceId);
  if (query.whereLanguage) {
    queryParams.set('whereLanguage', query.whereLanguage);
  }
  if (query.where) {
    queryParams.set('where', encodeParam(query.where));
  }
  if (query.select) {
    queryParams.set('select', encodeParam(query.select));
  }
  if (query.orderBy) {
    queryParams.set('orderBy', encodeParam(query.orderBy));
  }
  queryParams.set('filters', encodeParam(JSON.stringify(filters)));
};

const timeRangeParams = (startTime: Date, endTime: Date) =>
  new URLSearchParams({
    from: startTime.getTime().toString(),
    to: endTime.getTime().toString(),
    isLive: 'false',
  });

/**
 * Build a link to a saved search for an alert.
 *
 * Without `groupFilterCondition` this yields the time-range-only link the app
 * has always produced: landing on `/search/:id` with no config params lets the
 * page hydrate itself from the saved search.
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
  const queryParams = timeRangeParams(startTime, endTime);

  if (groupFilterCondition) {
    setSearchConfigParams(queryParams, {
      groupFilterCondition,
      query: savedSearch,
      sourceId: String(savedSearch.source),
    });
  }

  url.search = queryParams.toString();
  return url.toString();
};

/**
 * Build a link to the row list for one group, without a saved search.
 *
 * Tile alerts have no saved search to land on, but `/search` accepts a bare
 * source plus a config, so the group's rows are still reachable.
 */
export const buildGroupSearchLinkUrl = ({
  endTime,
  frontendUrl,
  groupFilterCondition,
  query,
  sourceId,
  startTime,
}: {
  endTime: Date;
  frontendUrl: string;
  groupFilterCondition: string;
  query: SearchLinkQuery;
  sourceId: string;
  startTime: Date;
}): string => {
  const url = new URL(`${frontendUrl}/search`);
  const queryParams = timeRangeParams(startTime, endTime);

  setSearchConfigParams(queryParams, {
    groupFilterCondition,
    query,
    sourceId,
  });

  url.search = queryParams.toString();
  return url.toString();
};
