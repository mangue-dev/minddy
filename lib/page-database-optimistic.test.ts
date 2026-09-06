// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageDatabase } from "./use-page-database";
import {
  usePagesQuery,
  pagesKey,
  pageKey,
  type UsePagesResult,
} from "./use-pages-query";
import { buildOptimisticPage } from "./optimistic-page";
import type { Page } from "./pages";
import { beginPagePresence } from "./optimistic-page-writes";

const h = vi.hoisted(() => ({ error: vi.fn(), t: (key: string) => key }));
vi.mock("mangue-ui", () => ({ toast: { error: h.error } }));
vi.mock("next-intl", () => ({ useTranslations: () => h.t }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let client: QueryClient;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  client?.clear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mount() {
  const database = buildOptimisticPage(
    "project",
    { id: "db", database_schema: [{ id: "text", name: "Text", type: "text" }] },
    [],
  );
  const entry = {
    ...buildOptimisticPage("project", { id: "entry", parent_id: "db" }, []),
    property_values: { text: "Original" },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(pagesKey("project"), [database, entry]);
  client.setQueryData(pageKey("db"), database);
  client.setQueryData(pageKey("entry"), entry);
  let first!: ReturnType<typeof usePageDatabase>;
  let second!: ReturnType<typeof usePageDatabase>;
  let pages!: UsePagesResult;
  const calls: {
    url: string;
    body: Record<string, unknown>;
    resolve: (page: unknown, status?: number) => void;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          calls.push({
            url,
            body: JSON.parse(String(init?.body ?? "{}")),
            resolve: (page, status = 200) =>
              resolve(new Response(JSON.stringify(page), { status })),
          });
        }),
    ),
  );
  function Harness() {
    first = usePageDatabase("project");
    second = usePageDatabase("project");
    pages = usePagesQuery("project");
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    root!.render(
      createElement(QueryClientProvider, { client }, createElement(Harness)),
    ),
  );
  return {
    database,
    entry,
    calls,
    get first() {
      return first;
    },
    get second() {
      return second;
    },
    get pages() {
      return pages;
    },
    row: (id = "entry") =>
      client
        .getQueryData<Page[]>(pagesKey("project"))!
        .find((page) => page.id === id)!,
  };
}

describe("optimistic database edits", () => {
  it("keeps typing responsive while a title autosave and a property edit overlap", async () => {
    const m = await mount();
    let title!: Promise<Page>;
    let value!: Promise<boolean>;
    await act(async () => {
      title = m.pages.updatePage("entry", { title: "First title" });
      m.pages.previewPage("entry", { title: "Still typing" });
      value = m.first.saveValue(m.entry, "text", "New value");
    });
    expect(m.row().title).toBe("Still typing");
    const valueCall = m.calls.find((call) => call.body.operation === "value")!;
    const titleCall = m.calls.find(
      (call) => call.body.title === "First title",
    )!;
    await act(async () => {
      valueCall.resolve({ ...m.entry, property_values: { text: "New value" } });
      await value;
    });
    await act(async () => {
      titleCall.resolve({ ...m.entry, title: "First title", version: 2 });
      await title;
    });
    expect(m.row().title).toBe("Still typing");
    expect(m.row().property_values?.text).toBe("New value");
    expect(
      client.getQueryData<Page>(pageKey("entry"))?.property_values?.text,
    ).toBe("New value");
  });

  it("removes deleted column values immediately and restores them if the schema is refused", async () => {
    const m = await mount();
    let save!: Promise<boolean>;
    await act(async () => {
      save = m.first.saveSchema(m.database, []);
    });
    expect(m.row("db").database_schema).toEqual([]);
    expect(m.row().property_values?.text).toBeNull();
    await act(async () => {
      m.calls[0].resolve({ error: "Conflict" }, 409);
      await save;
    });
    expect(m.row("db").database_schema).toEqual(m.database.database_schema);
    expect(m.row().property_values?.text).toBe("Original");
  });

  it("leaves later row moves visible when an earlier move fails", async () => {
    const m = await mount();
    let first!: Promise<Page>;
    let second!: Promise<Page>;
    await act(async () => {
      first = m.pages.updatePage("entry", { position: "b" });
      second = m.pages.updatePage("entry", { position: "c" });
    });
    expect(m.row().position).toBe("c");
    expect(m.calls).toHaveLength(1);
    await act(async () => {
      m.calls[0].resolve({ error: "Offline" }, 500);
      await first.catch(() => {});
    });
    expect(m.row().position).toBe("c");
    await act(async () => {
      m.calls[1].resolve({ ...m.entry, position: "c" });
      await second;
    });
    expect(m.row().position).toBe("c");
  });

  it("publishes rapid edits in both caches and sends dependent values in order", async () => {
    const m = await mount();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = m.first.saveValue(m.entry, "text", "First");
      second = m.second.saveValue(m.row(), "text", "Second");
    });
    expect(m.row().property_values?.text).toBe("Second");
    expect(
      client.getQueryData<Page>(pageKey("entry"))?.property_values?.text,
    ).toBe("Second");
    expect(m.calls).toHaveLength(1);
    await act(async () => {
      m.calls[0].resolve({ ...m.entry, property_values: { text: "First" } });
      await first;
    });
    expect(m.row().property_values?.text).toBe("Second");
    expect(m.calls[1].body.expected).toBe("First");
    await act(async () => {
      m.calls[1].resolve({ ...m.entry, property_values: { text: "Second" } });
      await second;
    });
    expect(m.row().property_values?.text).toBe("Second");
  });

  it("rolls back only a failed field and preserves later edits and document changes", async () => {
    const m = await mount();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = m.first.saveValue(m.entry, "text", "First");
      second = m.second.saveValue(m.row(), "text", "Second");
      client.setQueryData(pageKey("entry"), {
        ...m.entry,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        title: "Edited title",
      });
      m.calls[0]?.resolve({ error: "Offline" }, 500);
    });
    // The requests start on the next microtask.
    await act(async () => {
      m.calls[0].resolve({ error: "Offline" }, 500);
      await first;
    });
    expect(m.row().property_values?.text).toBe("Second");
    const secondCall = m.calls.find((call) => call.body.value === "Second")!;
    expect(secondCall.body.expected).toBe("Original");
    await act(async () => {
      secondCall.resolve({ ...m.entry, property_values: { text: "Second" } });
      await second;
    });
    const detail = client.getQueryData<Page>(pageKey("entry"))!;
    expect(detail.title).toBe("Edited title");
    expect(detail.content).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(h.error).toHaveBeenCalledWith("Offline");
  });

  it("keeps optimistic values through background list and detail responses", async () => {
    const m = await mount();
    let save!: Promise<boolean>;
    await act(async () => {
      save = m.first.saveValue(m.entry, "text", "Local");
      client.setQueryData(pagesKey("project"), [
        m.database,
        { ...m.entry, title: "Remote title" },
      ]);
      client.setQueryData(pageKey("entry"), m.entry);
    });
    expect(m.row().property_values?.text).toBe("Local");
    expect(m.row().title).toBe("Remote title");
    expect(
      client.getQueryData<Page>(pageKey("entry"))?.property_values?.text,
    ).toBe("Local");
    await act(async () => {
      m.calls[0].resolve({ ...m.entry, property_values: { text: "Local" } });
      await save;
    });
  });

  it("queues column additions and rebases revisions across hook instances", async () => {
    const m = await mount();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    const added = { id: "number", name: "Number", type: "number" as const };
    await act(async () => {
      first = m.first.saveSchema(m.database, [
        ...m.database.database_schema!,
        added,
      ]);
      second = m.second.saveSchema(m.database, [
        { ...m.database.database_schema![0], name: "Renamed" },
      ]);
    });
    expect(m.row("db").database_schema?.map((p) => p.name)).toEqual([
      "Renamed",
      "Number",
    ]);
    await act(async () => {
      m.calls[0].resolve({
        ...m.database,
        database_schema: [...m.database.database_schema!, added],
        database_revision: 1,
      });
      await first;
    });
    expect(m.calls[1].body.revision).toBe(1);
    expect(
      (m.calls[1].body.schema as { name: string }[]).map((p) => p.name),
    ).toEqual(["Renamed", "Number"]);
    await act(async () => {
      m.calls[1].resolve({ ...m.row("db"), database_revision: 2 });
      await second;
    });
  });

  it("shows a created row and edits it before its POST has completed", async () => {
    const m = await mount();
    let created!: Awaited<ReturnType<UsePagesResult["createPage"]>>;
    let save!: Promise<boolean>;
    await act(async () => {
      created = await m.pages.createPage({ parent_id: "db" });
      save = m.first.saveValue(created, "text", "Already typing");
    });
    expect(m.row(created.id).property_values?.text).toBe("Already typing");
    expect(m.calls).toHaveLength(1);
    const canonical = buildOptimisticPage(
      "project",
      { id: created.id, parent_id: "db" },
      [],
    );
    await act(async () => {
      m.calls[0].resolve(canonical);
      await created.settled;
    });
    expect(m.row(created.id).property_values?.text).toBe("Already typing");
    await act(async () => {
      m.calls[1].resolve({
        ...canonical,
        property_values: { text: "Already typing" },
      });
      await save;
    });
  });

  it("copies a row immediately with the same identity used by its server request", async () => {
    const m = await mount();
    let copy!: Awaited<ReturnType<UsePagesResult["duplicatePage"]>>;
    await act(async () => {
      copy = await m.pages.duplicatePage("entry");
    });
    expect(m.row(copy.id).property_values).toEqual(m.entry.property_values);
    expect(m.calls[0].body.ids).toEqual({ entry: copy.id });
    await act(async () => {
      m.calls[0].resolve({ ...m.entry, id: copy.id });
      await copy.settled;
    });
    expect(
      client
        .getQueryData<Page[]>(pagesKey("project"))!
        .filter((row) => row.id === copy.id),
    ).toHaveLength(1);
  });

  it("restores only the failed deletion when several rows are removed", async () => {
    const m = await mount();
    const other = { ...m.entry, id: "other" };
    await act(async () =>
      client.setQueryData(pagesKey("project"), [m.database, m.entry, other]),
    );
    let first!: Promise<number>;
    let second!: Promise<number>;
    await act(async () => {
      first = m.pages.trashPage("entry");
      second = m.pages.trashPage("other");
    });
    expect(
      client.getQueryData<Page[]>(pagesKey("project"))!.map((row) => row.id),
    ).toEqual(["db"]);
    await act(async () => {
      m.calls[0].resolve({ error: "Offline" }, 500);
      await first.catch(() => {});
    });
    expect(
      client.getQueryData<Page[]>(pagesKey("project"))!.map((row) => row.id),
    ).toEqual(["db", "entry"]);
    await act(async () => {
      m.calls[1].resolve({ trashed: 1 });
      await second;
    });
    expect(
      client.getQueryData<Page[]>(pagesKey("project"))!.map((row) => row.id),
    ).toEqual(["db", "entry"]);
  });

  it("does not resurrect a newly created row when it has already been deleted", async () => {
    const m = await mount();
    await act(async () => {
      const create = beginPagePresence(client, "project", [m.entry], true);
      const remove = beginPagePresence(client, "project", [m.entry], false);
      create(true);
      expect(m.row()).toBeUndefined();
      remove(true);
    });
    expect(m.row()).toBeUndefined();
  });

  it("projects a guarded conversion immediately and restores the schema and cells on conflict", async () => {
    const m = await mount();
    let result!: Promise<boolean>;
    await act(async () => {
      result = m.first.convertColumn(
        m.database,
        "text",
        "number",
        "Amount",
        {
          status: "preview",
          token: "token",
          incompatibleCount: 0,
          totalCount: 1,
          column: { id: "text", name: "Amount", type: "number" },
          values: { entry: 42 },
        },
        false,
      );
    });
    expect(m.row("db").database_schema?.[0].type).toBe("number");
    expect(m.row().property_values?.text).toBe(42);
    await act(async () => {
      m.calls[0].resolve({ error: "Conflict" }, 409);
      await result;
    });
    expect(m.row("db").database_schema?.[0].type).toBe("text");
    expect(m.row().property_values?.text).toBe("Original");
  });
});
