import { describe, expect, it } from "vitest";
import {
  canonicalSql,
  migrationFiles,
  readBaseline,
  readMigration,
} from "@/test/sql-migrations";

import {
  keysForProjectEvent,
  projectScopeKeys,
  type BroadcastChange,
} from "./realtime-keys";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const PAGE = "44444444-4444-4444-8444-444444444444";

function change(
  table: string,
  overrides: Partial<BroadcastChange> = {}
): BroadcastChange {
  return {
    operation: "INSERT",
    table,
    schema: "public",
    record: null,
    old_record: null,
    ...overrides,
  };
}

/** The `pages` line as the trigger broadcasts it (without body, see migration). */
function pageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAGE,
    project_id: PROJECT,
    parent_id: null,
    title: "Brief initial",
    icon: null,
    version: 1,
    position: "a0",
    favorite: false,
    deleted_at: null,
    deleted_root_id: null,
    ...overrides,
  };
}

const hasKey = (keys: { key: readonly unknown[] }[], expected: unknown[]) =>
  keys.some((k) => JSON.stringify(k.key) === JSON.stringify(expected));

/* ── PAGES (MIN-346) ───────────────────────────────── ──────────────────
 The original hole: the table was broadcasting (since this same delivery) but
 the switcher did not have a branch for it — the tree remained that of
 loading, and a page created on the web app did not exist for the
 desktop app. */

describe("keysForProjectEvent — pages", () => {
  it("rafraîchit l'arbre du projet quand une page est créée ailleurs", () => {
    const keys = keysForProjectEvent(
      change("pages", { operation: "INSERT", record: pageRow() }),
      PROJECT
    );
    expect(hasKey(keys, ["pages", PROJECT])).toBe(true);
    // And it GOES AGAIN to the server: a mounted tree must be repaint, not only
    // mark yourself expired.
    expect(keys.find((k) => k.key[0] === "pages")?.refetch).toBe("active");
  });

  it("rafraîchit l'arbre sur un renommage, un déplacement, un épinglage", () => {
    for (const patch of [
      { title: "Architecture" },
      { parent_id: PAGE, position: "a1" },
      { favorite: true },
    ]) {
      const keys = keysForProjectEvent(
        change("pages", {
          operation: "UPDATE",
          record: pageRow(patch),
          old_record: pageRow(),
        }),
        PROJECT
      );
      expect(hasKey(keys, ["pages", PROJECT])).toBe(true);
    }
  });

  it("refetches the body of the affected open page", () => {
    const keys = keysForProjectEvent(
      change("pages", { operation: "UPDATE", record: pageRow() }),
      PROJECT
    );
    expect(hasKey(keys, ["page", PAGE])).toBe(true);
    expect(
      keys.find((key) => JSON.stringify(key.key) === JSON.stringify(["page", PAGE]))
        ?.refetch
    ).toBe("active");
  });

  it("bouge la corbeille et l'index de la palette, pas le board cross-projet", () => {
    const keys = keysForProjectEvent(
      change("pages", {
        operation: "UPDATE",
        record: pageRow({ deleted_at: "2026-08-14T09:00:00Z" }),
        old_record: pageRow(),
      }),
      PROJECT
    );
    expect(hasKey(keys, ["me", "trash"])).toBe(true);
    // The palette index has the page titles, but it is marked outdated
    // without request: it is a snapshot which revalidates when opened.
    expect(
      keys.find((k) => JSON.stringify(k.key) === '["me","search-index"]')?.refetch
    ).toBe("none");
    // A page is not a ticket: nothing to ask again from `/api/me/board`.
    expect(hasKey(keys, ["me", "board"])).toBe(false);
  });

  it("rattrape l'arbre après une coupure", () => {
    // The page cache is persisted to disk and its staleTime is five
    // minutes: without this entry, a tab that has slept does not request anything again.
    expect(
      projectScopeKeys(PROJECT).some(
        (key) => JSON.stringify(key) === JSON.stringify(["pages", PROJECT])
      )
    ).toBe(true);
  });
});

/* ── The safeguard: no distributed table must remain silent ─────────────
 This is the fault that MIN-346 corrected, and it raises NOTHING — neither at the
 type-check, nor at execution. The only way to see it happen again is to confront the switcher with the actual list of triggers. */

const baselineSql = canonicalSql(readBaseline());
const allMigrationsSql = canonicalSql(
  migrationFiles().map((file) => readMigration(file)).join("\n"),
);

/** All tables for which a trigger emits on a `project:{id}` topic. */
function projectBroadcastTables(): string[] {
  const sql = allMigrationsSql;

  const projectFns = new Set<string>();
  const fnRe =
    /create or replace function public\.(\w+)\s*\(\s*\)\s*returns trigger([\s\S]*?)\$\$;/g;
  for (const m of sql.matchAll(fnRe)) {
    if (m[2].includes("'project:'")) projectFns.add(m[1]);
  }

  const tables = new Set<string>();
  const trigRe =
    /create (?:or replace )?trigger\s+\w+\s+after[\s\S]*?on public\.(\w+)[\s\S]*?execute function public\.(\w+)\s*\(\s*\)/gi;
  for (const m of sql.matchAll(trigRe)) {
    if (projectFns.has(m[2])) tables.add(m[1]);
  }
  return [...tables].sort();
}

describe("aucune table diffusée sur project:{id} n'est sans réponse", () => {
  const tables = projectBroadcastTables();

  it("la liste est bien lue depuis les migrations", () => {
    // Two probes: one historic, one new. If the extraction breaks, it
    // would return an empty list and the next test would pass for nothing.
    expect(tables).toContain("issues");
    expect(tables).toContain("pages");
    expect(tables.length).toBeGreaterThan(10);
  });

  it.each(tables)("%s a une branche dans keysForProjectEvent", (table) => {
    // The four possible parents are informed at once: this test does not judge
    // no fine switching (the tests by table take care of it), only one
    // distribution of this table does not fall into the `default:`.
    const record = {
      id: "22222222-2222-4222-8222-222222222222",
      project_id: PROJECT,
      issue_id: "33333333-3333-4333-8333-333333333333",
      objective_id: "55555555-5555-4555-8555-555555555555",
      page_id: PAGE,
      feedback_post_id: "66666666-6666-4666-8666-666666666666",
    };
    expect(
      keysForProjectEvent(change(table, { record }), PROJECT).length
    ).toBeGreaterThan(0);
  });
});

/* ── The payload of a page does not carry its body ──────────────────────
 `content` goes up to 1 MB and autosave writes the page one
 times per second of typing. A successful broadcast would push the
 document to all project members, every second. */

describe("le trigger des pages", () => {
  const sql = baselineSql;

  it("retranche le corps et ses deux dérivées de la charge utile", () => {
    for (const column of ["content", "search_text", "search_tsv"]) {
      expect(sql).toContain(`- '${column}'`);
    }
  });

  it("ne déclenche pas sur une écriture du corps", () => {
    // The `when (…)` of the UPDATE ONLY names visible columns: neither
    // `content`, nor `version`, nor the write timestamp columns.
    const triggerStart = sql.indexOf("create or replace trigger pages_broadcast_update");
    const trigger = sql.slice(triggerStart, sql.indexOf(";", triggerStart));
    const when = /when \(([\s\S]*?)\)\s*execute function/.exec(trigger)?.[1] ?? "";
    expect(when).not.toBe("");
    for (const column of ["content", "version", "updated_at", "updated_by"]) {
      expect(when).not.toContain(column);
    }
    for (const column of ["title", "icon", "parent_id", "position", "favorite", "deleted_at"]) {
      expect(when).toContain(column);
    }
  });
});

describe("page body Realtime migration", () => {
  it("broadcasts body updates without adding the body to the payload", () => {
    const sql = canonicalSql(
      readMigration("20270106094000_page_broadcast_and_pull_request_notification_deduplication.sql")
    );
    expect(sql).toContain("drop trigger if exists pages_broadcast_update on public.pages");
    expect(sql).toContain("old.content is distinct from new.content");
    expect(sql).toContain("execute function public.broadcast_page_row()");
  });
});

describe("routine realtime", () => {
  it("refreshes the routine list after an external edit", () => {
    const keys = keysForProjectEvent(
      change("agent_routines", {
        operation: "UPDATE",
        record: { id: "routine-1", project_id: PROJECT },
      }),
      PROJECT,
    );

    expect(hasKey(keys, ["routines"])).toBe(true);
    expect(keys.find((key) => key.key[0] === "routines")?.refetch).toBe("active");
  });

  it("catches routine edits missed while the tab was disconnected", () => {
    expect(hasKey(projectScopeKeys(PROJECT).map((key) => ({ key })), ["routines"])).toBe(
      true,
    );
  });

  it("broadcasts identifiers without exposing the routine instruction", () => {
    const sql = canonicalSql(
      readMigration("20270106230000_agent_routines_realtime.sql"),
    );

    expect(sql).toContain("create trigger agent_routines_broadcast");
    expect(sql).toContain("after insert or update or delete on public.agent_routines");
    expect(sql).toContain("execute function public.broadcast_agent_routine_row()");
    expect(sql).not.toContain("to_jsonb(new)");
    expect(sql).not.toContain("new.prompt");
  });
});
