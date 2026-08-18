import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MIN-278 — WHO cited, as the line will tell.
 *
 * The rule of what IS a quote lives next door and is tested alone
 * (lib/pages-mentions.test.ts, pure logic). What is at stake here is
 * the IDENTITY placed on the notification: a page can be written by a
 * human, by the Numo cat, or by an agent holding an MCP key, and the three are not named the same. `actor_id` alone would always say “So-and-so” — the account
 * under which the entry was made —, including a sentence that So-and-so never typed.
 */

const H = vi.hoisted(() => ({
  insertNotifications: vi.fn<
    (service: unknown, rows: Array<Record<string, unknown>>) => Promise<void>
  >(async () => {}),
}));

vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: H.insertNotifications,
  projectMemberIds: async () => new Set(["u-bob", "u-clement"]),
}));

vi.mock("@/lib/server/auth-users", async (importActual) => ({
  ...(await importActual<typeof import("./auth-users")>()),
  fetchAuthUsersById: async (_service: unknown, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        {
          id,
          email: `${id}@minddy.app`,
          user_metadata: { display_name: id === "u-bob" ? "Bob" : "Clément" },
        },
      ])
    ),
}));

const { notifyPageMentions } = await import("./page-mentions");

const service = {} as SupabaseClient;

/** A one-block document, with its anchor. */
const doc = (text: string) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "b1" },
      content: [{ type: "text", text }],
    },
  ],
});

const rows = () => H.insertNotifications.mock.calls[0][1];

beforeEach(() => H.insertNotifications.mockClear());

describe("notifyPageMentions", () => {
  it("nomme l'humain qui a écrit — rien de plus sur la ligne", async () => {
    await notifyPageMentions(service, {
      projectId: "p1",
      pageId: "page-1",
      actorId: "u-clement",
      doc: doc("à @Bob de trancher"),
    });
    expect(rows()).toEqual([
      {
        user_id: "u-bob",
        project_id: "p1",
        type: "page_mention",
        issue_id: null,
        page_id: "page-1",
        block_id: "b1",
        actor_id: "u-clement",
      },
    ]);
  });

  it("nomme NUMO quand c'est l'agent qui a posé la citation", async () => {
    // The chat and the code agent write under the id of the account which authorized them:
    // without this flag, Bob would read “Clément mentioned you” from a sentence that
    // Clément did not write.
    await notifyPageMentions(service, {
      projectId: "p1",
      pageId: "page-1",
      actorId: "u-clement",
      doc: doc("à @Bob de trancher"),
      viaAssistant: true,
    });
    expect(rows()[0]).toMatchObject({ actor_id: "u-clement", via_assistant: true });
    expect(rows()[0]).not.toHaveProperty("via_mcp");
  });

  it("nomme l'agent de la CLÉ quand l'écriture vient du MCP", async () => {
    // There we know his name: the line says “Claude Code (mcp)”, like the
    // timeline of a ticket written by the same agent. `via_assistant` must NOT
    // add to it — the inbox tests it first and would fall back on “Numo”.
    await notifyPageMentions(service, {
      projectId: "p1",
      pageId: "page-1",
      actorId: "u-clement",
      doc: doc("à @Bob de trancher"),
      viaAssistant: true,
      mcpKeyId: "key-1",
    });
    expect(rows()[0]).toMatchObject({ via_mcp: true, api_key_id: "key-1" });
    expect(rows()[0]).not.toHaveProperty("via_assistant");
  });

  it("ne dit rien du tout sans arobase dans le document", async () => {
    await notifyPageMentions(service, {
      projectId: "p1",
      pageId: "page-1",
      actorId: "u-clement",
      doc: doc("un paragraphe sans personne"),
    });
    expect(H.insertNotifications).not.toHaveBeenCalled();
  });
});
