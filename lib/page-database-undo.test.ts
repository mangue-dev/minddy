// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageDatabase } from "./use-page-database";
import { pagesKey, pageKey } from "./use-pages-query";
import { buildOptimisticPage } from "./optimistic-page";
import type { PageSummary } from "./pages-api";
import type { DatabaseProperty, DatabaseValue } from "./page-databases";
import type { UndoAction } from "./undo/undo-core";

type Replay = Extract<UndoAction, { kind: "replay" }>;
const h = vi.hoisted(() => ({ error: vi.fn(), t: (key: string) => key, records: [] as unknown[] }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { error: h.error },
}));
vi.mock("next-intl", () => ({ useTranslations: () => h.t }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
// The history's recording side only: each test replays the entries itself.
vi.mock("./undo/undo-context", () => ({
  useUndoHistory: () => ({
    record: (action: unknown) => { h.records.push(action); return { entry: action, retract: vi.fn() }; },
    linked: <T,>(run: () => T) => run(),
    currentLink: () => undefined,
    undo: vi.fn(),
  }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const TEXT: DatabaseProperty = { id: "text", name: "Text", type: "text" };
let root: Root | undefined;
let client: QueryClient;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  client?.clear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  h.records.length = 0;
});

/**
 * The hook over a small stand-in for the database route: it keeps the schema
 * and the entry's values, and answers each operation the way the server does.
 */
async function mount() {
  const server = {
    schema: [TEXT] as DatabaseProperty[],
    revision: 0,
    values: { text: "12" } as Record<string, DatabaseValue>,
  };
  const database = buildOptimisticPage("project", { id: "db", database_schema: [TEXT] }, []);
  const entry = { ...buildOptimisticPage("project", { id: "entry", parent_id: "db" }, []),
    property_values: { ...server.values } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(pagesKey("project"), [database, entry]);
  client.setQueryData(pageKey("db"), database);
  client.setQueryData(pageKey("entry"), entry);
  const requests: Record<string, unknown>[] = [];
  const convert = (target: string) => {
    const number = Number(server.values.text);
    const value: DatabaseValue = target === "number"
      ? (Number.isFinite(number) && server.values.text !== null ? number : null)
      : server.values.text === null ? null : String(server.values.text);
    return { column: { ...TEXT, type: target } as DatabaseProperty, value };
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push(body);
    const page = url.includes("/pages/db/") ? database : entry;
    const respond = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
      ...page, database_schema: page.id === "db" ? server.schema : undefined,
      database_revision: server.revision, property_values: page.id === "entry" ? server.values : {},
      ...extra }));
    if (body.operation === "schema") {
      server.schema = body.schema as DatabaseProperty[];
      server.revision += 1;
      for (const id of Object.keys(server.values))
        if (!server.schema.some((property) => property.id === id)) delete server.values[id];
    } else if (body.operation === "value") {
      server.values = { ...server.values, [body.propertyId as string]: body.value as DatabaseValue };
    } else if (body.operation === "values") {
      server.values = { ...server.values, ...(body.values as Record<string, DatabaseValue>) };
    } else if (body.operation === "convert") {
      const { column, value } = convert(body.targetType as string);
      if (body.preview) return new Response(JSON.stringify({ status: "preview", totalCount: 1,
        incompatibleCount: value === null && server.values.text !== null ? 1 : 0,
        token: "0".repeat(32), column, values: { entry: value } }));
      server.schema = [column];
      server.revision += 1;
      server.values = { text: value };
      return respond({ conversion_values: { entry: value } });
    }
    return respond();
  }));
  let database_hook!: ReturnType<typeof usePageDatabase>;
  function Harness() {
    database_hook = usePageDatabase("project");
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client }, createElement(Harness))));
  const rows = () => client.getQueryData<PageSummary[]>(pagesKey("project"))!;
  return { hook: () => database_hook, server, requests, rows,
    row: (id: string) => rows().find((page) => page.id === id)!,
    last: () => h.records.at(-1) as Replay };
}

describe("undoing database edits", () => {
  it("puts a cell back, then applies the edit again", async () => {
    const { hook, server, row, last } = await mount();
    await act(async () => { await hook().saveValue(row("entry"), "text", "Edited"); });
    expect(server.values.text).toBe("Edited");
    await act(async () => { await last().undo(); });
    expect(server.values.text).toBe("12");
    expect(row("entry").property_values?.text).toBe("12");
    await act(async () => { await last().redo(); });
    expect(server.values.text).toBe("Edited");
  });

  it("records nothing for a write that changes nothing", async () => {
    const { hook, row } = await mount();
    await act(async () => { await hook().saveValue(row("entry"), "text", "12"); });
    expect(h.records).toHaveLength(0);
  });

  it("brings a deleted column back with the values it held", async () => {
    const { hook, server, row, last, requests } = await mount();
    await act(async () => { await hook().saveSchema(row("db"), []); });
    expect(server.schema).toEqual([]);
    expect(server.values).toEqual({});
    requests.length = 0;
    await act(async () => { await last().undo(); });
    // The column first, then its values: an option or a column must exist again.
    expect(requests.map((request) => request.operation)).toEqual(["schema", "value"]);
    expect(server.schema).toEqual([TEXT]);
    expect(server.values).toEqual({ text: "12" });
    expect(row("entry").property_values?.text).toBe("12");
  });

  it("converts a column back to its former type and definition", async () => {
    const { hook, server, row, last, requests } = await mount();
    await act(async () => {
      const preview = await hook().previewConversion(row("db"), "text", "number", "Amount");
      await hook().convertColumn(row("db"), "text", "number", "Amount", preview!, false);
    });
    expect(server.schema[0].type).toBe("number");
    expect(server.values.text).toBe(12);
    requests.length = 0;
    await act(async () => { await last().undo(); });
    expect(requests.map((request) => [request.operation, request.preview]))
      .toEqual([["convert", true], ["convert", false], ["schema", undefined]]);
    expect(server.schema).toEqual([TEXT]);
    // "12" came back through the conversion itself: no value write was needed.
    expect(server.values.text).toBe("12");
    expect(row("db").database_schema).toEqual([TEXT]);
  });

  it("restores the cells a conversion had to clear", async () => {
    const { hook, server, row, last } = await mount();
    await act(async () => { await hook().saveValue(row("entry"), "text", "abc"); });
    await act(async () => {
      const preview = await hook().previewConversion(row("db"), "text", "number", "Text");
      await hook().convertColumn(row("db"), "text", "number", "Text", preview!, true);
    });
    expect(server.values.text).toBeNull();
    await act(async () => { await last().undo(); });
    expect(server.schema).toEqual([TEXT]);
    expect(server.values.text).toBe("abc");
  });
});
