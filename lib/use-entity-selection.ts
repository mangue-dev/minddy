"use client";

// The multi-selection of a list surface (MIN-873): feedback posts, routines,
// objectives, wiki pages. Rows join or leave it with ⇧-click, as in triage;
// the selection only keeps records the surface still lists, so a record that
// is trashed, filtered out by its status or removed by someone else leaves it
// at the same time.

import { useCallback, useMemo, useState } from "react";

export interface EntitySelection<T> {
  /** The selected records, in the order the surface lists them. */
  selected: T[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

export function useEntitySelection<T extends { id: string }>(
  items: readonly T[],
): EntitySelection<T> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(
    () => (ids.size === 0 ? [] : items.filter((item) => ids.has(item.id))),
    [items, ids],
  );
  const live = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const isSelected = useCallback((id: string) => live.has(id), [live]);
  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setIds(new Set()), []);
  return { selected, isSelected, toggle, clear };
}
