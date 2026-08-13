import { renderHook } from '@testing-library/react';

import { useRetainFiltersOnSourceChange } from '@/hooks/useRetainFiltersOnSourceChange';

const columnsA = [{ name: 'ServiceName' }, { name: 'Timestamp' }];
const columnsB = [{ name: 'Timestamp' }];

function setup(initial: {
  sourceId?: string;
  columns?: { name: string }[];
  retain?: jest.Mock;
  onDropped?: jest.Mock;
}) {
  const retain = initial.retain ?? jest.fn(() => []);
  const onDropped = initial.onDropped ?? jest.fn();
  const view = renderHook(
    (props: { sourceId?: string; columns?: { name: string }[] }) =>
      useRetainFiltersOnSourceChange({
        sourceId: props.sourceId,
        columns: props.columns,
        retainFiltersByColumns: retain,
        onFiltersDropped: onDropped,
      }),
    {
      initialProps: { sourceId: initial.sourceId, columns: initial.columns },
    },
  );
  return { ...view, retain, onDropped };
}

describe('useRetainFiltersOnSourceChange', () => {
  it('leaves filters alone on the first render', () => {
    const { retain } = setup({ sourceId: 'a', columns: columnsA });

    expect(retain).not.toHaveBeenCalled();
  });

  it('drops filters that the new source has no column for', () => {
    const { rerender, retain } = setup({ sourceId: 'a', columns: columnsA });

    rerender({ sourceId: 'b', columns: columnsB });

    expect(retain).toHaveBeenCalledWith(new Set(['Timestamp']));
  });

  it('waits for the new columns before dropping anything', () => {
    const { rerender, retain } = setup({ sourceId: 'a', columns: columnsA });

    rerender({ sourceId: 'b', columns: undefined });
    expect(retain).not.toHaveBeenCalled();

    rerender({ sourceId: 'b', columns: columnsB });
    expect(retain).toHaveBeenCalledWith(new Set(['Timestamp']));
  });

  it('reconciles only once per source change', () => {
    const { rerender, retain } = setup({ sourceId: 'a', columns: columnsA });

    rerender({ sourceId: 'b', columns: columnsB });
    rerender({ sourceId: 'b', columns: columnsB });

    expect(retain).toHaveBeenCalledTimes(1);
  });

  it('reports the dropped filter keys', () => {
    const retain = jest.fn(() => ['ServiceName']);
    const { rerender, onDropped } = setup({
      sourceId: 'a',
      columns: columnsA,
      retain,
    });

    rerender({ sourceId: 'b', columns: columnsB });

    expect(onDropped).toHaveBeenCalledWith(['ServiceName']);
  });

  it('stays quiet when nothing was dropped', () => {
    const { rerender, onDropped } = setup({ sourceId: 'a', columns: columnsA });

    rerender({ sourceId: 'b', columns: columnsB });

    expect(onDropped).not.toHaveBeenCalled();
  });
});
