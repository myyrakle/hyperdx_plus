import { AlertSource } from '@/models/alert';
import { resolveAlertQuerySpec } from '@/tasks/checkAlerts/alertQuerySpec';

const savedSearch: any = {
  id: 'saved-1',
  source: 'source-1',
  where: 'level:error',
  whereLanguage: 'lucene',
  select: 'Timestamp, Body',
  orderBy: 'Timestamp DESC',
  filters: [{ type: 'sql', condition: 'a = 1' }],
};

const builderTile: any = {
  id: 'tile-1',
  config: {
    source: 'source-2',
    displayType: 'line',
    select: [{ aggFn: 'count', valueExpression: '' }],
    where: 'StatusCode:Error',
    whereLanguage: 'lucene',
    groupBy: [{ valueExpression: 'StatusMessage' }],
    filters: [{ type: 'sql', condition: 'b = 2' }],
  },
};

const dashboard: any = { id: 'dash-1', tiles: [builderTile] };

describe('resolveAlertQuerySpec', () => {
  describe('saved search alerts', () => {
    it('takes the group-by, predicate and source from the saved search', () => {
      expect(
        resolveAlertQuerySpec({
          alert: { source: AlertSource.SAVED_SEARCH, groupBy: 'ServiceName' },
          savedSearch,
        }),
      ).toEqual({
        groupBy: 'ServiceName',
        sourceId: 'source-1',
        query: {
          where: 'level:error',
          whereLanguage: 'lucene',
          select: 'Timestamp, Body',
          orderBy: 'Timestamp DESC',
          filters: [{ type: 'sql', condition: 'a = 1' }],
        },
      });
    });

    it('returns undefined without a saved search', () => {
      expect(
        resolveAlertQuerySpec({ alert: { source: AlertSource.SAVED_SEARCH } }),
      ).toBeUndefined();
    });
  });

  describe('tile alerts', () => {
    const tileAlert = { source: AlertSource.TILE, tileId: 'tile-1' };

    it('takes the group-by and predicate from the tile config', () => {
      expect(resolveAlertQuerySpec({ alert: tileAlert, dashboard })).toEqual({
        groupBy: [{ valueExpression: 'StatusMessage' }],
        sourceId: 'source-2',
        query: {
          where: 'StatusCode:Error',
          whereLanguage: 'lucene',
          filters: [{ type: 'sql', condition: 'b = 2' }],
        },
      });
    });

    it('does not carry the tile select, which is an aggregate', () => {
      // A tile's select is `count()`-shaped; reusing it for a row query would
      // return the aggregate instead of the row.
      const spec = resolveAlertQuerySpec({ alert: tileAlert, dashboard });

      expect(spec?.query.select).toBeUndefined();
    });

    it('returns undefined when the tile is missing from the dashboard', () => {
      expect(
        resolveAlertQuerySpec({
          alert: { source: AlertSource.TILE, tileId: 'nope' },
          dashboard,
        }),
      ).toBeUndefined();
    });

    it('returns undefined for a raw SQL tile, which has no reusable predicate', () => {
      const rawTile: any = {
        id: 'tile-raw',
        config: {
          configType: 'sql',
          displayType: 'line',
          sqlTemplate: 'SELECT 1',
          source: 's',
        },
      };

      expect(
        resolveAlertQuerySpec({
          alert: { source: AlertSource.TILE, tileId: 'tile-raw' },
          dashboard: { id: 'd', tiles: [rawTile] } as any,
        }),
      ).toBeUndefined();
    });

    it('returns undefined without a dashboard', () => {
      expect(resolveAlertQuerySpec({ alert: tileAlert })).toBeUndefined();
    });
  });
});
