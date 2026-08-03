import { describe, expect, it, vi } from "vitest";

import {
  AI_REVIEW_MAX_INLINE_COMMENTS,
  commentableRanges,
  executePrTool,
  findReviewableFile,
  formatRanges,
  resolvePrCommentAnchor,
  signReviewBody,
  type PrToolContext,
  type ReviewableFile,
} from "./pr-tools";
import type { Forge } from "./forge";

/**
 * Les écritures de PR d'une session de relecture (MIN-168). Ce qui se teste ici
 * est ce qui décide de la QUALITÉ de la review, et que ni le prompt ni le modèle
 * ne garantissent :
 *  - une ancre hors diff ne part JAMAIS chez la forge, et l'erreur rendue est
 *    exploitable (elle nomme les lignes commentables) ;
 *  - le plafond des cinq tient sur le run, pas sur le tour ;
 *  - un fichier renommé se retrouve par ses DEUX noms, mais le commentaire part
 *    toujours sur le nom actuel ;
 *  - la synthèse est signée exactement une fois.
 */

// Un patch minimal : un hunk qui commence à la ligne 10 des deux côtés.
//   contexte 10/10, supprimée 11 (LEFT), ajoutée 11 (RIGHT), contexte 12/12
const PATCH = [
  "@@ -10,3 +10,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

const FILES: ReviewableFile[] = [
  { filename: "lib/demo.ts", status: "modified", additions: 1, deletions: 1, patch: PATCH },
  {
    filename: "lib/renamed.ts",
    previous_filename: "lib/old-name.ts",
    status: "renamed",
    additions: 1,
    deletions: 1,
    patch: PATCH,
  },
  { filename: "assets/logo.png", status: "modified", additions: 0, deletions: 0 },
];

function makeForge(overrides: Partial<Forge> = {}) {
  return {
    createPullRequestReviewComment: vi.fn(async () => ({
      id: 1,
      html_url: "https://example.test/c/1",
    })),
    createPullRequestComment: vi.fn(async () => ({
      id: 2,
      html_url: "https://example.test/c/2",
    })),
    replyToPullRequestReviewComment: vi.fn(async () => ({
      id: 3,
      html_url: "https://example.test/c/3",
    })),
    ...overrides,
  } as unknown as Forge & {
    createPullRequestReviewComment: ReturnType<typeof vi.fn>;
    createPullRequestComment: ReturnType<typeof vi.fn>;
    replyToPullRequestReviewComment: ReturnType<typeof vi.fn>;
  };
}

function makeCtx(over: { used?: number; forge?: ReturnType<typeof makeForge> } = {}) {
  const forge = over.forge ?? makeForge();
  const ctx: PrToolContext = {
    forge,
    call: { token: "t", repoFullName: "acme/app", number: 7 },
    files: async () => FILES,
    model: "openai/gpt-5.6",
    locale: "fr",
    inline: { used: over.used ?? 0 },
  };
  return { ctx, forge };
}

describe("resolvePrCommentAnchor", () => {
  it("accepte une ligne ajoutée du diff, côté RIGHT", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "lib/demo.ts",
      line: 11,
      side: "RIGHT",
    });
    expect(res).toEqual({ ok: true, path: "lib/demo.ts" });
  });

  it("accepte une ligne supprimée, côté LEFT", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "lib/demo.ts",
      line: 11,
      side: "LEFT",
    });
    expect(res).toEqual({ ok: true, path: "lib/demo.ts" });
  });

  it("refuse une ligne HORS du diff et rend les plages commentables", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "lib/demo.ts",
      line: 400,
      side: "RIGHT",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // L'erreur doit être ACTIONNABLE : elle nomme le fichier et les lignes
    // possibles, pour que le tour suivant vise juste au lieu de retenter au hasard.
    expect(res.error).toContain("lib/demo.ts");
    expect(res.error).toContain("10–12");
  });

  it("refuse un fichier absent du diff en listant ce qui a changé", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "lib/absent.ts",
      line: 3,
      side: "RIGHT",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("not part of this pull request's diff");
    expect(res.error).toContain("lib/demo.ts");
  });

  it("refuse un fichier sans diff lisible (binaire) sans prétendre à une ligne", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "assets/logo.png",
      line: 1,
      side: "RIGHT",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("no readable diff");
  });

  it("retrouve un fichier RENOMMÉ par ses deux noms, et retient l'actuel", () => {
    for (const name of ["lib/renamed.ts", "lib/old-name.ts"]) {
      for (const side of ["LEFT", "RIGHT"] as const) {
        const res = resolvePrCommentAnchor(FILES, { path: name, line: 11, side });
        // Le commentaire s'adresse au fichier tel qu'il est DANS la PR : une
        // ancre posée sur l'ancien nom se ferait refuser par la forge.
        expect(res).toEqual({ ok: true, path: "lib/renamed.ts" });
      }
    }
  });

  it("nettoie un chemin recopié avec l'en-tête du diff", () => {
    const res = resolvePrCommentAnchor(FILES, {
      path: "lib/demo.ts — modified · +1 −1",
      line: 11,
      side: "RIGHT",
    });
    expect(res).toEqual({ ok: true, path: "lib/demo.ts" });
  });
});

describe("findReviewableFile", () => {
  it("ne confond pas deux fichiers dont l'un porte des parenthèses", () => {
    const files: ReviewableFile[] = [
      { filename: "app/(marketing)/page.tsx", status: "modified", patch: PATCH },
    ];
    expect(findReviewableFile(files, "app/(marketing)/page.tsx", "RIGHT")?.filename).toBe(
      "app/(marketing)/page.tsx",
    );
  });
});

describe("commentableRanges", () => {
  it("fusionne les lignes contiguës et distingue les deux côtés", () => {
    expect(formatRanges(commentableRanges(PATCH, "RIGHT"))).toBe("10–12");
    // Côté LEFT : contexte 10, supprimée 11, contexte 12 (l'ajoutée n'y est pas).
    expect(formatRanges(commentableRanges(PATCH, "LEFT"))).toBe("10–12");
  });
});

describe("signReviewBody", () => {
  it("ajoute la signature une fois", () => {
    const body = signReviewBody("Rien à redire.", "openai/gpt-5.6", "fr");
    expect(body).toContain("🤖 Relu par Numo (minddy) · openai/gpt-5.6");
    expect(body.match(/🤖/g)).toHaveLength(1);
  });

  it("ne la double pas quand le modèle l'a déjà écrite", () => {
    const once = signReviewBody("Rien à redire.", "openai/gpt-5.6", "fr");
    const twice = signReviewBody(once, "openai/gpt-5.6", "fr");
    expect(twice).toBe(once);
  });

  it("ne la double pas non plus si elle a été écrite dans l'autre langue", () => {
    const already = "Nothing to fix.\n\n---\n🤖 Reviewed by Numo (minddy) · anthropic/claude";
    expect(signReviewBody(already, "openai/gpt-5.6", "fr")).toBe(already);
  });

  it("suit la langue du lanceur", () => {
    expect(signReviewBody("ok", "m", "en")).toContain("🤖 Reviewed by Numo (minddy) · m");
  });
});

describe("comment_pr_line", () => {
  it("poste sur une ancre valide et décompte le plafond", async () => {
    const { ctx, forge } = makeCtx();
    const out = await executePrTool(ctx, "comment_pr_line", {
      path: "lib/demo.ts",
      line: 11,
      side: "RIGHT",
      body: "Ce cas n'est pas couvert.",
    });
    expect(out.success).toBe(true);
    expect(forge.createPullRequestReviewComment).toHaveBeenCalledTimes(1);
    expect(ctx.inline.used).toBe(1);
    expect(out.result).toMatchObject({
      path: "lib/demo.ts",
      remaining: AI_REVIEW_MAX_INLINE_COMMENTS - 1,
    });
  });

  it("n'appelle PAS la forge quand l'ancre ne résout pas", async () => {
    const { ctx, forge } = makeCtx();
    const out = await executePrTool(ctx, "comment_pr_line", {
      path: "lib/demo.ts",
      line: 999,
      side: "RIGHT",
      body: "…",
    });
    expect(out.success).toBe(false);
    expect(forge.createPullRequestReviewComment).not.toHaveBeenCalled();
    expect(ctx.inline.used).toBe(0);
  });

  it("refuse au-delà du plafond, sans appeler la forge", async () => {
    // Le compteur vient du checkpoint : c'est le cas d'un run REPRIS qui a déjà
    // posé ses cinq ancres au tour précédent.
    const { ctx, forge } = makeCtx({ used: AI_REVIEW_MAX_INLINE_COMMENTS });
    const out = await executePrTool(ctx, "comment_pr_line", {
      path: "lib/demo.ts",
      line: 11,
      side: "RIGHT",
      body: "un sixième point",
    });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toContain("comment_pr");
    expect(forge.createPullRequestReviewComment).not.toHaveBeenCalled();
  });

  it("s'arrête exactement au plafond sur une série d'appels", async () => {
    const { ctx, forge } = makeCtx();
    for (let i = 0; i < AI_REVIEW_MAX_INLINE_COMMENTS + 2; i++) {
      await executePrTool(ctx, "comment_pr_line", {
        path: "lib/demo.ts",
        line: 11,
        side: "RIGHT",
        body: `point ${i}`,
      });
    }
    expect(forge.createPullRequestReviewComment).toHaveBeenCalledTimes(
      AI_REVIEW_MAX_INLINE_COMMENTS,
    );
    expect(ctx.inline.used).toBe(AI_REVIEW_MAX_INLINE_COMMENTS);
  });

  it("ne consomme pas le plafond quand la forge refuse l'ancre", async () => {
    const { GithubApiError } = await import("./pr");
    const forge = makeForge({
      createPullRequestReviewComment: vi.fn(async () => {
        throw new GithubApiError("line must be part of the diff", 422);
      }),
    } as unknown as Partial<Forge>);
    const { ctx } = makeCtx({ forge });
    const out = await executePrTool(ctx, "comment_pr_line", {
      path: "lib/demo.ts",
      line: 11,
      side: "RIGHT",
      body: "…",
    });
    expect(out.success).toBe(false);
    expect(ctx.inline.used).toBe(0);
    expect(String((out.result as { error: string }).error)).toContain("422");
  });

  it("refuse les arguments mal formés avant tout appel", async () => {
    const { ctx, forge } = makeCtx();
    for (const args of [
      { path: "lib/demo.ts", line: 11, body: "" },
      { path: "", line: 11, body: "x" },
      { path: "lib/demo.ts", line: 0, body: "x" },
    ]) {
      const out = await executePrTool(ctx, "comment_pr_line", args);
      expect(out.success).toBe(false);
    }
    expect(forge.createPullRequestReviewComment).not.toHaveBeenCalled();
  });
});

describe("comment_pr et reply_pr_thread", () => {
  it("signe la synthèse côté harnais", async () => {
    const { ctx, forge } = makeCtx();
    const out = await executePrTool(ctx, "comment_pr", { body: "Trois remarques." });
    expect(out.success).toBe(true);
    const body = forge.createPullRequestComment.mock.calls[0][0].body as string;
    expect(body).toContain("Trois remarques.");
    expect(body).toContain("🤖 Relu par Numo (minddy) · openai/gpt-5.6");
  });

  it("laisse une SECONDE synthèse partir — une review est une conversation", async () => {
    const { ctx, forge } = makeCtx();
    await executePrTool(ctx, "comment_pr", { body: "Première réponse." });
    await executePrTool(ctx, "comment_pr", { body: "Après ta question : …" });
    expect(forge.createPullRequestComment).toHaveBeenCalledTimes(2);
  });

  it("répond dans un fil de review", async () => {
    const { ctx, forge } = makeCtx();
    const out = await executePrTool(ctx, "reply_pr_thread", {
      comment_id: 42,
      body: "C'est traité.",
    });
    expect(out.success).toBe(true);
    expect(forge.replyToPullRequestReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 42, body: "C'est traité." }),
    );
  });

  it("refuse un id de fil non numérique sans appeler la forge", async () => {
    const { ctx, forge } = makeCtx();
    const out = await executePrTool(ctx, "reply_pr_thread", {
      comment_id: "abc",
      body: "…",
    });
    expect(out.success).toBe(false);
    expect(forge.replyToPullRequestReviewComment).not.toHaveBeenCalled();
  });
});
