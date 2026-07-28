import { describe, expect, it } from "vitest";
import {
  contentChars,
  imageCount,
  stripImages,
  textOf,
  IMAGE_PART_CHARS,
  type AgentContentPart,
} from "./content";
import { estimateTokens, planCompaction, serializeForSummary, type CompactMessage } from "./compact";
import { pruneToolOutputs, capHistoryImages, IMAGE_ELIDED_NOTE, PRUNE_STUB } from "./prune";
import { markSystemPromptCache } from "./caching";

/**
 * MIN-111 : l'historique de l'agent n'est plus fait que de chaînes. Un résultat de
 * `read_attachment` peut porter une IMAGE, et cet historique EST le checkpoint —
 * il traverse l'estimation de tokens, la compaction, l'élagage et le cache de
 * prompt. Ce fichier vérifie que chacun de ces cinq passages le laisse entier, et
 * qu'aucun ne confond les octets d'une data URL avec un coût de contexte.
 */

/** Une data URL réaliste : longue (~1 Mo), sans rapport avec son coût en tokens. */
const dataUrl = `data:image/png;base64,${"A".repeat(1_000_000)}`;

const imagePart = (url = dataUrl): AgentContentPart => ({ type: "image_url", image_url: { url } });

/** Le résultat de `read_attachment` sur une maquette : métadonnées + image. */
const attachmentResult = (name: string): AgentContentPart[] => [
  { type: "text", text: JSON.stringify({ file_name: name, mime_type: "image/png" }) },
  imagePart(),
];

describe("helpers de contenu", () => {
  it("textOf lit les deux formes et ignore les images", () => {
    expect(textOf("plain")).toBe("plain");
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
    expect(textOf([{ type: "text", text: "a" }, imagePart(), { type: "text", text: "b" }])).toBe("a\nb");
  });

  it("imageCount compte les parties image", () => {
    expect(imageCount("plain")).toBe(0);
    expect(imageCount(attachmentResult("mock.png"))).toBe(1);
    expect(imageCount([imagePart(), imagePart()])).toBe(2);
  });

  it("contentChars facture l'image au proxy, PAS aux octets de sa base64", () => {
    const chars = contentChars(attachmentResult("mock.png"));
    // La data URL pèse 1 Mo ; le contenu ne vaut que le texte + un forfait.
    expect(chars).toBeLessThan(dataUrl.length / 100);
    expect(chars).toBe(
      JSON.stringify({ file_name: "mock.png", mime_type: "image/png" }).length + IMAGE_PART_CHARS,
    );
  });

  it("stripImages remplace les images par une note et garde le texte", () => {
    const out = stripImages(attachmentResult("mock.png"), "[gone]");
    expect(imageCount(out)).toBe(0);
    expect(textOf(out)).toContain("mock.png");
    expect(textOf(out)).toContain("[gone]");
  });

  it("stripImages rend le contenu INCHANGÉ quand il n'y a rien à retirer", () => {
    const text = "just text";
    expect(stripImages(text, "[gone]")).toBe(text);
  });
});

/**
 * Le test que le ticket réclamait : un historique porteur d'une image traverse les
 * cinq consommateurs sans exception ni contenu perdu.
 */
describe("un historique multimodal traverse tout le harness", () => {
  const history = (): CompactMessage[] => [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Implement the mockup on the ticket." },
    {
      role: "assistant",
      content: "Opening the attachment.",
      tool_calls: [
        { id: "a1", type: "function", function: { name: "read_attachment", arguments: "{}" } },
      ],
    },
    { role: "tool", tool_call_id: "a1", content: attachmentResult("mockup.png") },
    { role: "assistant", content: "I can see a two-column layout." },
  ];

  it("estimateTokens reste dans l'ordre de grandeur du texte (pas de la base64)", () => {
    const withImage = estimateTokens(history());
    const withoutImage = estimateTokens(
      history().map((m) =>
        m.role === "tool" ? { ...m, content: textOf(m.content) } : m,
      ),
    );
    // Une image ajoute un forfait, pas 250 000 tokens : sans ça, la compaction
    // partirait à chaque round dès la première maquette ouverte.
    expect(withImage - withoutImage).toBe(IMAGE_PART_CHARS / 4);
  });

  it("planCompaction préserve l'image dans la queue, sans jamais la sérialiser", () => {
    const messages = history();
    // Budget de queue large → tout part en queue, rien à résumer.
    expect(planCompaction(messages, { keepRecentBytes: 100_000 })).toBeNull();
    // Budget minuscule → la queue démarre après le bloc résumé, jamais sur un `tool`.
    const plan = planCompaction(
      [...messages, ...messages.slice(2), ...messages.slice(2)],
      { keepRecentBytes: 10 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.tail[0].role).not.toBe("tool");
  });

  it("serializeForSummary rend un marqueur, jamais les octets de l'image", () => {
    const out = serializeForSummary(history());
    expect(out).not.toContain("AAAA");
    expect(out).toContain("mockup.png"); // le nom survit, via le texte du résultat
    expect(out).toContain("1 image attached");
    expect(out).toContain("ASSISTANT: I can see a two-column layout.");
  });

  it("pruneToolOutputs ne touche PAS un résultat multipart", () => {
    // Assez de texte ailleurs pour que l'élagage se déclenche vraiment.
    const messages: CompactMessage[] = [
      ...history(),
      { role: "tool", tool_call_id: "a2", content: "y".repeat(30_000) },
      { role: "tool", tool_call_id: "a3", content: "z".repeat(60_000) },
    ];
    const reclaimed = pruneToolOutputs(messages);
    expect(reclaimed).toBeGreaterThan(0);
    // L'image est intacte…
    expect(imageCount(messages[3].content)).toBe(1);
    expect(textOf(messages[3].content)).toContain("mockup.png");
    // …et le vieux résultat texte, lui, a bien été élagué.
    expect(messages[5].content).toBe(PRUNE_STUB);
  });

  it("markSystemPromptCache marque le seed et laisse les parties image telles quelles", () => {
    const out = markSystemPromptCache(history()) as Array<Record<string, unknown>>;
    expect(out[0].content).toEqual([
      { type: "text", text: "You are numo.", cache_control: { type: "ephemeral" } },
    ]);
    expect(out[1].content).toEqual([
      {
        type: "text",
        text: "Implement the mockup on the ticket.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(out[3].content).toEqual(attachmentResult("mockup.png"));
  });
});

/**
 * L'historique EST le checkpoint, et il est sérialisé en JSON à chaque mise au
 * repos : au-delà de `MAX_CHECKPOINT_BYTES` (8 Mo, execute.ts), le run s'arrête sur
 * « budget épuisé ». Une data URL pèse lourd sans rien coûter en tokens — c'est le
 * seul endroit du harness où une maquette peut faire des dégâts. Ce test fixe la
 * borne : cap par image (750 Ko source, ~1 Mo en base64, issue-tools.ts) ×
 * `MAX_HISTORY_IMAGES` retenues.
 */
describe("borne du checkpoint", () => {
  const MAX_CHECKPOINT_BYTES = 8_000_000; // cf. execute.ts
  /** Une image au cap : 750 Ko source → base64 4/3. */
  const maxImage = (): AgentContentPart => ({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${"B".repeat(Math.ceil((750 * 1024 * 4) / 3))}` },
  });

  it("un tour à 2 images pèse une fraction du checkpoint", () => {
    const turn: CompactMessage[] = [
      { role: "tool", tool_call_id: "t1", content: [{ type: "text", text: "{}" }, maxImage()] },
      { role: "tool", tool_call_id: "t2", content: [{ type: "text", text: "{}" }, maxImage()] },
    ];
    const bytes = JSON.stringify(turn).length;
    expect(bytes).toBeLessThan(MAX_CHECKPOINT_BYTES / 3);
  });

  it("une conversation qui ouvre des maquettes tour après tour reste bornée", () => {
    // 10 tours × 2 images au cap = 20 Mo si rien ne les élague.
    const messages: CompactMessage[] = [{ role: "system", content: "sys" }];
    for (let turn = 0; turn < 10; turn++) {
      for (const n of [0, 1]) {
        messages.push({
          role: "tool",
          tool_call_id: `t${turn}-${n}`,
          content: [{ type: "text", text: "{}" }, maxImage()],
        });
      }
      capHistoryImages(messages); // appelé à chaque frontière de round
    }
    expect(JSON.stringify(messages).length).toBeLessThan(MAX_CHECKPOINT_BYTES / 2);
    expect(messages.reduce((n, m) => n + imageCount(m.content), 0)).toBe(3);
  });
});

describe("capHistoryImages", () => {
  const toolImage = (id: string): CompactMessage => ({
    role: "tool",
    tool_call_id: id,
    content: attachmentResult(`${id}.png`),
  });

  it("garde les N plus récentes et élague les plus anciennes", () => {
    const messages: CompactMessage[] = [
      { role: "system", content: "sys" },
      toolImage("t1"),
      toolImage("t2"),
      toolImage("t3"),
      toolImage("t4"),
    ];
    expect(capHistoryImages(messages, 2)).toBe(2);
    expect(imageCount(messages[1].content)).toBe(0);
    expect(imageCount(messages[2].content)).toBe(0);
    expect(imageCount(messages[3].content)).toBe(1);
    expect(imageCount(messages[4].content)).toBe(1);
    // L'élagué reste lisible : nom du fichier + comment le récupérer.
    expect(textOf(messages[1].content)).toContain("t1.png");
    expect(textOf(messages[1].content)).toContain(IMAGE_ELIDED_NOTE);
    // Et le tool_call_id — donc l'appariement — n'a pas bougé.
    expect(messages[1].tool_call_id).toBe("t1");
  });

  it("est idempotent et ne touche rien sous le plafond", () => {
    const messages: CompactMessage[] = [toolImage("t1"), toolImage("t2")];
    const snapshot = structuredClone(messages);
    expect(capHistoryImages(messages, 3)).toBe(0);
    expect(messages).toEqual(snapshot);
    expect(capHistoryImages(messages, 3)).toBe(0);
  });

  it("ne réécrit jamais un message non-`tool`", () => {
    const messages: CompactMessage[] = [
      { role: "user", content: [{ type: "text", text: "look" }, imagePart()] },
      toolImage("t1"),
      toolImage("t2"),
    ];
    capHistoryImages(messages, 1);
    expect(imageCount(messages[0].content)).toBe(1); // l'utilisateur garde la sienne
    expect(imageCount(messages[1].content)).toBe(0);
    expect(imageCount(messages[2].content)).toBe(1);
  });
});
