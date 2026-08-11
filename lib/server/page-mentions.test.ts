import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MIN-278 — QUI a cité, tel que la ligne le dira.
 *
 * La règle de ce qui EST une citation vit à côté et se teste seule
 * (lib/pages-mentions.test.ts, logique pure). Ce qui se joue ici, c'est
 * l'IDENTITÉ posée sur la notification : une page peut être écrite par un
 * humain, par le chat Numo, ou par un agent tenant une clé MCP, et les trois ne
 * se nomment pas pareil. `actor_id` seul dirait toujours « Untel » — le compte
 * sous lequel l'écriture est passée —, y compris d'une phrase qu'Untel n'a
 * jamais tapée.
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

/** Un document d'un bloc, avec son ancre. */
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
    // Le chat et l'agent de code écrivent sous l'id du compte qui les a permis :
    // sans ce drapeau, Bob lirait « Clément vous a mentionné » d'une phrase que
    // Clément n'a pas écrite.
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
    // Là on connaît son nom : la ligne dit « Claude Code (mcp) », comme la
    // timeline d'un ticket écrit par le même agent. `via_assistant` ne doit PAS
    // s'y ajouter — l'inbox le teste d'abord et retomberait sur « Numo ».
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
