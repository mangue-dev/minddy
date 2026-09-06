import type { QueryClient } from "@tanstack/react-query";
import type { PageSummary } from "./pages-api";
import type { Page } from "./pages";
import { isPageCreationPending } from "./page-creation-settlement";

type Field = keyof Page | `value:${string}`;
type Layer = { fields: Field[]; apply: (page: PageSummary) => PageSummary };
type Entry = { base: PageSummary; layers: Layer[] };
const clients = new WeakMap<
  QueryClient,
  {
    entries: Map<string, Entry>;
    queues: Map<string, Promise<unknown>>;
    presence: Map<
      string,
      { projectId: string; row: PageSummary; visible: boolean }
    >;
  }
>();

function copyFields<T extends PageSummary>(
  target: T,
  source: PageSummary,
  fields: Field[],
): T {
  const next = { ...target };
  for (const field of fields) {
    if (field.startsWith("value:")) {
      const id = field.slice(6);
      next.property_values = { ...next.property_values };
      if (source.property_values && id in source.property_values)
        next.property_values[id] = source.property_values[id];
      else delete next.property_values[id];
    } else {
      Object.assign(next, { [field]: source[field as keyof PageSummary] });
    }
  }
  return next;
}

function stateFor(client: QueryClient) {
  let state = clients.get(client);
  if (state) return state;
  state = { entries: new Map(), queues: new Map(), presence: new Map() };
  clients.set(client, state);
  const { entries, presence } = state;
  let writing = false;
  // Realtime refetches, creation responses and autosaves all use these caches.
  // Reapply only fields owned by pending writes, preserving the document body.
  client.getQueryCache().subscribe((event) => {
    if (
      (!entries.size && !presence.size) ||
      writing ||
      event.type !== "updated" ||
      event.action.type !== "success"
    )
      return;
    const key = event.query.queryKey;
    if (key[0] !== "pages" && key[0] !== "page") return;
    const data = event.query.state.data;
    if (!data) return;
    const apply = <T extends PageSummary>(row: T): T => {
      const entry = entries.get(row.id);
      if (!entry?.layers.length) return row;
      const fields = entry.layers.flatMap((layer) => layer.fields);
      const projected = entry.layers.reduce(
        (base, layer) => layer.apply(base),
        entry.base,
      );
      return copyFields(row, projected, fields);
    };
    writing = true;
    try {
      if (Array.isArray(data)) {
        let rows = data as PageSummary[];
        for (const [id, item] of presence) {
          if (item.projectId !== key[1]) continue;
          if (!item.visible) rows = rows.filter((row) => row.id !== id);
          else if (!rows.some((row) => row.id === id))
            rows = [...rows, item.row];
        }
        client.setQueryData(key, rows.map(apply));
      } else client.setQueryData(key, apply(data as Page));
    } finally {
      writing = false;
    }
  });
  return state;
}

/** Serialize dependent requests while publishing every local edit immediately. */
export function queuePageWrite<T>(
  client: QueryClient,
  scope: string,
  run: () => Promise<T>,
): Promise<T> {
  const { queues } = stateFor(client);
  const previous = queues.get(scope);
  const request = (previous ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(scope, request);
  void request
    .finally(() => {
      if (queues.get(scope) === request) queues.delete(scope);
    })
    .catch(() => {});
  return request;
}

/** Wait for existing document writes before copying their persisted contents. */
export async function waitForPageWrites(client: QueryClient, scopes: string[]): Promise<void> {
  const { queues } = stateFor(client);
  await Promise.all(scopes.map((scope) => queues.get(scope)));
}

/** A field-scoped layer: failure removes this edit without undoing later edits. */
export function beginPageWrite(
  client: QueryClient,
  projectId: string,
  page: PageSummary,
  fields: Field[],
  apply: Layer["apply"],
) {
  const { entries } = stateFor(client);
  const existing = entries.get(page.id);
  const chained =
    existing?.layers.some((layer) =>
      layer.fields.some((field) => fields.includes(field)),
    ) ?? false;
  const cached =
    client
      .getQueryData<PageSummary[]>(["pages", projectId])
      ?.find((row) => row.id === page.id) ??
    client.getQueryData<Page>(["page", page.id]) ??
    page;
  const entry = existing ?? { base: cached, layers: [] };
  // Newly owned fields start from the latest cache, not an unrelated older edit.
  const newFields = fields.filter(
    (field) => !entry.layers.some((layer) => layer.fields.includes(field)),
  );
  entry.base = copyFields(entry.base, cached, newFields);
  const layer = { fields, apply };
  entry.layers.push(layer);
  entries.set(page.id, entry);
  const publish = (owned: Field[]) => {
    const projected = entry.layers.reduce(
      (base, item) => item.apply(base),
      entry.base,
    );
    client.setQueryData<PageSummary[]>(["pages", projectId], (rows) =>
      rows?.map((row) =>
        row.id === page.id ? copyFields(row, projected, owned) : row,
      ),
    );
    client.setQueryData<Page>(["page", page.id], (row) =>
      row ? copyFields(row, projected, owned) : row,
    );
  };
  void client.cancelQueries({ queryKey: ["pages", projectId] });
  // A creation query owns the POST; never cancel it when editing its draft.
  publish(fields);
  return {
    chained,
    base: () => entry.base,
    settle(server?: PageSummary) {
      void client.cancelQueries({ queryKey: ["pages", projectId] });
      if (!isPageCreationPending(page.id))
        void client.cancelQueries({ queryKey: ["page", page.id] });
      if (server) entry.base = copyFields(entry.base, server, fields);
      entry.layers.splice(entry.layers.indexOf(layer), 1);
      publish([...fields, ...entry.layers.flatMap((item) => item.fields)]);
      if (!entry.layers.length) entries.delete(page.id);
    },
  };
}

/** Keep inserted or removed rows stable during background list refreshes. */
export function beginPagePresence(
  client: QueryClient,
  projectId: string,
  rows: PageSummary[],
  visible: boolean,
) {
  const { presence } = stateFor(client);
  void client.cancelQueries({ queryKey: ["pages", projectId] });
  const items = rows.map((row) => ({ projectId, row, visible }));
  for (const item of items) presence.set(item.row.id, item);
  const ids = new Set(rows.map((row) => row.id));
  client.setQueryData<PageSummary[]>(["pages", projectId], (current = []) =>
    visible
      ? [...current.filter((row) => !ids.has(row.id)), ...rows]
      : current.filter((row) => !ids.has(row.id)),
  );
  return (success: boolean, confirmed = rows) => {
    void client.cancelQueries({ queryKey: ["pages", projectId] });
    const owned = items.filter((item) => presence.get(item.row.id) === item);
    for (const item of owned) presence.delete(item.row.id);
    const ownedIds = new Set(owned.map((item) => item.row.id));
    client.setQueryData<PageSummary[]>(["pages", projectId], (current = []) => {
      const keep = current.filter((row) => !ownedIds.has(row.id));
      const restore = success === visible ? confirmed : [];
      return [...keep, ...restore.filter((row) => ownedIds.has(row.id))];
    });
  };
}
