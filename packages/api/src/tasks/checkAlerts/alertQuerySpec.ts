import { isBuilderSavedChartConfig } from '@hyperdx/common-utils/dist/guards';

import { AlertSource } from '@/models/alert';
import { IDashboard } from '@/models/dashboard';
import { ISavedSearch } from '@/models/savedSearch';
import { AlertGroupBy } from '@/tasks/checkAlerts/groupFilter';
import { SearchLinkQuery } from '@/tasks/checkAlerts/searchLink';

export type AlertQuerySpec = {
  /** Where the alert's grouping lives: the alert for saved searches, the tile config for tiles. */
  groupBy: AlertGroupBy;
  /** The predicate to reproduce when querying rows or building a search link. */
  query: SearchLinkQuery;
  sourceId: string;
};

/**
 * Resolve what an alert is actually querying, regardless of where it came from.
 *
 * Saved-search and tile alerts keep their group-by and predicate in different
 * places; everything downstream (group filter, representative row, group link)
 * only needs the resolved shape.
 *
 * @returns `undefined` when no row-level query can be derived — a missing saved
 * search or dashboard, a deleted tile, or a Raw SQL / PromQL tile whose
 * predicate is not expressible as a `where` + `filters` pair.
 */
export const resolveAlertQuerySpec = ({
  alert,
  dashboard,
  savedSearch,
}: {
  alert: { source?: AlertSource; groupBy?: string; tileId?: string };
  dashboard?: IDashboard | null;
  savedSearch?: ISavedSearch | null;
}): AlertQuerySpec | undefined => {
  if (alert.source === AlertSource.SAVED_SEARCH) {
    if (savedSearch == null) {
      return undefined;
    }
    return {
      groupBy: alert.groupBy,
      sourceId: String(savedSearch.source),
      query: {
        where: savedSearch.where,
        whereLanguage: savedSearch.whereLanguage,
        select: savedSearch.select,
        orderBy: savedSearch.orderBy,
        filters: savedSearch.filters,
      },
    };
  }

  if (alert.source === AlertSource.TILE) {
    const tile = dashboard?.tiles?.find(t => t.id === alert.tileId);
    if (tile == null || !isBuilderSavedChartConfig(tile.config)) {
      return undefined;
    }
    return {
      groupBy: tile.config.groupBy,
      sourceId: tile.config.source,
      query: {
        where: tile.config.where,
        whereLanguage: tile.config.whereLanguage,
        // The tile's select is an aggregate (`count()`-shaped); reusing it for a
        // row query would return the aggregate instead of the row.
        filters: tile.config.filters,
      },
    };
  }

  return undefined;
};
