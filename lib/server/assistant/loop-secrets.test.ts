import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

/**
 * MIN-343 — UN IDENTIFIANT VIVANT NE S'ÉCRIT NULLE PART.
 *
 * Une clé `mdy_` fraîchement créée et le secret SSO d'un board sont les deux
 * seules valeurs qu'un tool de Numo rend et qui ouvrent quelque chose. Elles
 * étaient écrites telles quelles dans `assistant_messages.content` : rejouées au
 * fournisseur à chaque tour suivant, relisibles en base, et reparties dans
 * l'export de compte.
 *
 * Ce que ce test épingle est la frontière, pas la substitution (celle-ci a son
 * test dans `agent/redact.test.ts`) : le résultat COMPLET part au navigateur,
 * en direct, une fois — et tout ce qui reste après lui est substitué.
 *
 * On ne moque que ce qui SORT du process : le fournisseur et la base.
 */

const KEY = "mdy_QXBpS2V5U2VjcmV0MTIzNDU2Nzg5MA";

const executeTool = vi.fn();
vi.mock("./execute-tool", () => ({
  executeTool: (...args: unknown[]) => executeTool(...args),
}));

const fetchOpenRouter = vi.fn();
vi.mock("@/lib/server/model-config", () => ({
  fetchOpenRouterWithSuffixFallback: (...args: unknown[]) => fetchOpenRouter(...args),
}));

import type { ChatMessage } from "./loop";

const { processChat } = await import("./loop");

/** Un flux SSE OpenRouter, tel que la boucle le lit. */
function stream(chunks: Record<string, unknown>[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const TOOL_ROUND = [
  {
    id: "gen-1",
    model: "m",
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call-1",
              function: { name: "create_integration", arguments: '{"name":"App"}' },
            },
          ],
        },
      },
    ],
  },
];

const TEXT_ROUND = [
  {
    id: "gen-2",
    model: "m",
    choices: [{ delta: { content: "La clé est affichée ci-dessus." } }],
  },
];

function fakeService() {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: "msg-1" } }) }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  // `insert` est appelé tantôt avec `.select().single()`, tantôt seul (await
  // direct) : la forme ci-dessus est thenable-compatible via l'objet rendu.
  return { client, inserted };
}

/**
 * Le filet ne vaut que si le tool DÉCLARE ce qu'il rend de vivant. Lexical, comme
 * `redaction-invariant.test.ts` : les deux chemins demandent un fournisseur, une
 * base et un projet, et ce qu'on veut épingler tient dans une ligne de source.
 */
describe("les tools qui rendent un identifiant le déclarent", () => {
  const source = readFileSync(join(__dirname, "execute-tool.ts"), "utf8");

  it("la clé d'intégration", () => {
    expect(source).toContain("secrets: [result.key]");
  });

  it("le secret SSO du board", () => {
    expect(source).toContain(
      "secrets: result.sso_secret ? [result.sso_secret] : undefined"
    );
  });
});

describe("la clé fraîche ne survit qu'à l'écran", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    executeTool.mockResolvedValue({
      result: {
        integration: { id: "int-1", name: "App", kind: "issues" },
        key: KEY,
        usage: { note: `Authorization: Bearer ${KEY}` },
      },
      secrets: [KEY],
      success: true,
    });
    fetchOpenRouter
      .mockResolvedValueOnce({ response: stream(TOOL_ROUND), model: "m" })
      .mockResolvedValueOnce({ response: stream(TEXT_ROUND), model: "m" });
  });

  it("part au navigateur en clair, et nulle part ailleurs", async () => {
    const events: { type: string; payload: unknown }[] = [];
    const service = fakeService();
    const messages: ChatMessage[] = [{ role: "user", content: "crée une clé" }];

    await processChat(
      messages,
      [],
      { emit: (type: string, payload: unknown) => events.push({ type, payload }) } as never,
      {
        model: "m",
        conversationId: "conv-1",
        projectId: "p1",
        userId: "u1",
        supabase: service.client,
        service: service.client,
        locale: "fr",
      }
    );

    // 1. L'ÉCRAN : le résultat complet, la clé lisible, une fois.
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(JSON.stringify(toolResult?.payload)).toContain(KEY);

    // 2. LA BASE : rien. Ni dans le contenu du message, ni dans sa métadonnée.
    const persisted = JSON.stringify(service.inserted);
    expect(persisted).not.toContain(KEY);
    expect(persisted).toContain("[redacted]");

    // 3. LE MODÈLE : rien non plus — c'est ce qui empêche le rejeu à chaque
    //    tour suivant, et la recopie de la clé dans une réponse.
    expect(JSON.stringify(messages)).not.toContain(KEY);
    expect(JSON.stringify(messages)).toContain("[redacted]");
  });

  it("substitue partout dans le résultat, pas seulement au premier niveau", async () => {
    const events: { type: string; payload: unknown }[] = [];
    const service = fakeService();
    const messages: ChatMessage[] = [{ role: "user", content: "crée une clé" }];

    await processChat(
      messages,
      [],
      { emit: (type: string, payload: unknown) => events.push({ type, payload }) } as never,
      {
        model: "m",
        conversationId: "conv-1",
        projectId: "p1",
        userId: "u1",
        supabase: service.client,
        service: service.client,
        locale: "fr",
      }
    );

    // La clé apparaissait DEUX fois dans le résultat : nue, et au milieu de
    // l'entête d'exemple que le contrat d'intégration porte.
    const toolMessage = service.inserted.find((r) => r.role === "tool");
    expect(String(toolMessage?.content)).toContain(
      "Authorization: Bearer [redacted]"
    );
  });
});
