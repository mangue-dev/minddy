import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildAttachmentParts,
  groupPromptAttachments,
  type PromptAttachment,
} from "./attachment-parts";

/**
 * Les parts d'un prompt @Numo — une ressource SANS OCTETS ne descend pas dans
 * le stockage.
 *
 * Vu en prod : `[numo-comment] failed: TypeError: Cannot read properties of null
 * (reading 'replace')` dans `getFinalPath` de supabase-js. Un lien porte le MIME
 * `text/uri-list`, donc la branche « texte » l'attrapait et l'envoyait au
 * `download()` avec le `storage_path` nul qu'un lien a toujours (MIN-184, et une
 * page citée depuis MIN-275). Ça ne dégradait pas la réponse : ça la faisait
 * tomber ENTIÈRE, sur le simple fait qu'un lien pendait au ticket.
 */

/** Client dont le stockage LÈVE comme le vrai sur un chemin nul, et qui note ce
    qu'on lui a demandé. */
function fakeService(): SupabaseClient & { asked: unknown[] } {
  const asked: unknown[] = [];
  const client = {
    asked,
    storage: {
      from: () => ({
        download: async (path: unknown) => {
          asked.push(path);
          if (typeof path !== "string") {
            throw new TypeError("Cannot read properties of null (reading 'replace')");
          }
          return { data: new Blob([Buffer.from("col_a,col_b\n1,2\n")]), error: null };
        },
        createSignedUrl: async (path: unknown) => {
          asked.push(path);
          if (typeof path !== "string") {
            throw new TypeError("Cannot read properties of null (reading 'replace')");
          }
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient & { asked: unknown[] };
}

const ALL_MODALITIES = new Set(["text", "image", "file"]);

const link: PromptAttachment = {
  kind: "link",
  storage_path: null,
  url: "https://linear.app/docs",
  page_id: null,
  file_name: "Linear docs",
  mime_type: "text/uri-list",
  size_bytes: 0,
};

const page: PromptAttachment = {
  kind: "page",
  storage_path: null,
  url: null,
  page_id: "page-42",
  file_name: "Spec des cycles",
  mime_type: "application/vnd.minddy.page",
  size_bytes: 0,
};

const csv: PromptAttachment = {
  kind: "file",
  storage_path: "issues/1/export.csv",
  file_name: "export.csv",
  mime_type: "text/csv",
  size_bytes: 32,
};

describe("buildAttachmentParts", () => {
  it("rend un lien en texte, sans toucher au stockage", async () => {
    const service = fakeService();
    const parts = await buildAttachmentParts(service, [link], {
      modalities: ALL_MODALITIES,
      includeHeavy: true,
    });

    expect(service.asked).toEqual([]);
    expect(parts).toEqual([
      { type: "text", text: "[Link: Linear docs — https://linear.app/docs]" },
    ]);
  });

  it("rend une page citée avec son id, pour que get_page la lise", async () => {
    const service = fakeService();
    const parts = await buildAttachmentParts(service, [page], {
      modalities: ALL_MODALITIES,
      includeHeavy: true,
    });

    expect(service.asked).toEqual([]);
    expect(parts).toHaveLength(1);
    const text = (parts[0] as { text: string }).text;
    expect(text).toContain("Spec des cycles");
    expect(text).toContain("page-42");
    expect(text).toContain("get_page");
  });

  it("un lien n'empêche pas les vrais fichiers du même lot", async () => {
    const service = fakeService();
    const parts = await buildAttachmentParts(service, [link, page, csv], {
      modalities: ALL_MODALITIES,
      includeHeavy: true,
    });

    expect(service.asked).toEqual(["issues/1/export.csv"]);
    expect(parts).toHaveLength(3);
    expect((parts[2] as { text: string }).text).toContain("col_a,col_b");
  });

  it("un fichier dont le chemin manque devient une note, pas une exception", async () => {
    const service = fakeService();
    const parts = await buildAttachmentParts(
      service,
      [{ ...csv, storage_path: null }, { ...csv, storage_path: "" }],
      { modalities: ALL_MODALITIES, includeHeavy: true }
    );

    expect(service.asked).toEqual([]);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect((part as { text: string }).text).toContain("export.csv");
      expect((part as { text: string }).text).toContain("not included");
    }
  });

  it("une image passe par une URL signée, comme avant", async () => {
    const service = fakeService();
    const parts = await buildAttachmentParts(
      service,
      [
        {
          kind: "file",
          storage_path: "issues/1/shot.png",
          file_name: "shot.png",
          mime_type: "image/png",
          size_bytes: 2048,
        },
      ],
      { modalities: ALL_MODALITIES, includeHeavy: false }
    );

    expect(parts).toEqual([
      {
        type: "image_url",
        image_url: { url: "https://signed.example/issues/1/shot.png" },
      },
    ]);
  });
});

describe("groupPromptAttachments", () => {
  it("groupe par commentaire et garde kind, url et page_id", () => {
    const byComment = groupPromptAttachments([
      { comment_id: "c1", ...link },
      { comment_id: null, ...page },
      { comment_id: "c1", ...csv, url: null, page_id: null },
    ]);

    expect(byComment.get("c1")).toEqual([
      expect.objectContaining({ kind: "link", url: "https://linear.app/docs" }),
      expect.objectContaining({ kind: "file", storage_path: "issues/1/export.csv" }),
    ]);
    expect(byComment.get(null)).toEqual([
      expect.objectContaining({ kind: "page", page_id: "page-42" }),
    ]);
  });

  it("tolère l'absence de lot", () => {
    expect(groupPromptAttachments(null).size).toBe(0);
    expect(groupPromptAttachments(undefined).size).toBe(0);
  });
});
