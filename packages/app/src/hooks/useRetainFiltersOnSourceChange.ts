import { useEffect, useRef } from 'react';

/**
 * Drop sidebar filters that the newly selected source has no column for.
 *
 * Switching sources swaps the whole schema underneath the filter sidebar, so
 * filters keyed on columns that no longer exist would silently match nothing.
 * The reconcile is deferred until the new source's columns have loaded — until
 * then a missing column is indistinguishable from a pending fetch — and runs
 * once per source change.
 */
export function useRetainFiltersOnSourceChange({
  sourceId,
  columns,
  retainFiltersByColumns,
  onFiltersDropped,
}: {
  sourceId?: string;
  columns?: { name: string }[];
  retainFiltersByColumns: (allowedColumnNames: Set<string>) => string[];
  onFiltersDropped?: (droppedKeys: string[]) => void;
}) {
  // The source the current filter set has already been checked against.
  const reconciledSourceRef = useRef<string | undefined>(sourceId);

  useEffect(() => {
    if (sourceId === reconciledSourceRef.current || !columns) {
      return;
    }
    reconciledSourceRef.current = sourceId;

    const dropped = retainFiltersByColumns(new Set(columns.map(c => c.name)));
    if (dropped.length > 0) {
      onFiltersDropped?.(dropped);
    }
  }, [sourceId, columns, retainFiltersByColumns, onFiltersDropped]);
}
