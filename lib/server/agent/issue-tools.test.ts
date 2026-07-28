import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-111, au point d'entrée : `read_attachment` sur une maquette doit RENVOYER
 * l'image, en data URL (l'URL signée expire en 10 min ; le checkpoint est rejoué
 * bien plus tard). Et il doit se comporter exactement comme avant dès que l'une des
 * trois conditions manque : modèle texte, format non montrable, fichier trop lourd.
 */

const attachmentRow = {
  id: "att-1",
  storage_path: "proj/issue/mockup.png",
  file_name: "mockup.png",
  mime_type: "image/png",
  size_bytes: 120 * 1024,
  comment_id: null,
};

let row: Record<string, unknown> | null = attachmentRow;
let downloaded: Buffer | null = Buffer.from("PNGBYTES");

vi.mock("@/lib/supabase-service", () => {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.maybeSingle = async () => ({ data: row });
  return { getServiceClient: () => ({ from: () => query }) };
});

vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: async () => "https://signed.example/mockup.png",
  downloadAttachment: async () => downloaded,
}));

import { executeIssueTool, type IssueToolContext } from "./issue-tools";

const ctx = (imageInput: boolean): IssueToolContext => ({
  issueId: "issue-1",
  projectId: "proj-1",
  projectKey: "MIN",
  actorId: "user-1",
  imageInput,
});

const read = (imageInput: boolean) =>
  executeIssueTool(ctx(imageInput), "read_attachment", { attachment_id: "att-1" });

beforeEach(() => {
  row = { ...attachmentRow };
  downloaded = Buffer.from("PNGBYTES");
});

describe("read_attachment sur une image", () => {
  it("renvoie l'image en data URL quand le modèle la voit", async () => {
    const out = await read(true);
    expect(out.success).toBe(true);
    expect(out.images).toHaveLength(1);
    expect(out.images![0].url).toBe(`data:image/png;base64,${Buffer.from("PNGBYTES").toString("base64")}`);
    expect(out.images![0].name).toBe("mockup.png");
    // Les octets NE sont PAS dans `result` : il part en JSON dans l'event et le message.
    expect(JSON.stringify(out.result)).not.toContain("base64");
    expect(JSON.stringify(out.result)).toContain("mockup.png");
  });

  it("ne change RIEN sur un run non multimodal", async () => {
    const out = await read(false);
    expect(out.images).toBeUndefined();
    expect(out.result).toMatchObject({ file_name: "mockup.png" });
    expect(JSON.stringify(out.result)).toContain("content_omitted");
    expect(JSON.stringify(out.result)).toContain("download_url");
  });

  it("refuse une image trop lourde, en le disant, et donne l'URL de repli", async () => {
    row = { ...attachmentRow, size_bytes: 5 * 1024 * 1024 };
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(JSON.stringify(out.result)).toContain("image_omitted");
    expect(JSON.stringify(out.result)).toContain("download_url");
  });

  it("retombe sur l'URL signée quand le téléchargement échoue", async () => {
    downloaded = null;
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(JSON.stringify(out.result)).toContain("content_omitted");
  });

  it("laisse les formats non montrables au chemin binaire", async () => {
    for (const mime of ["image/heic", "image/tiff", "application/pdf"]) {
      row = { ...attachmentRow, mime_type: mime, file_name: `f.${mime.split("/")[1]}` };
      const out = await read(true);
      expect(out.images).toBeUndefined();
      expect(JSON.stringify(out.result)).toContain("content_omitted");
    }
  });

  it("garde la lecture inline du texte intacte", async () => {
    row = { ...attachmentRow, mime_type: "text/markdown", file_name: "spec.md", size_bytes: 8 };
    downloaded = Buffer.from("# Spec");
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(out.result).toMatchObject({ content: "# Spec" });
  });

  it("refuse une pièce jointe absente du ticket", async () => {
    row = null;
    const out = await read(true);
    expect(out.success).toBe(false);
    expect(out.images).toBeUndefined();
  });
});
