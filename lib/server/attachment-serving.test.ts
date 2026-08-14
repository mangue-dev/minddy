import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const { signedAttachmentUrl, uploadAttachment } = await import("./attachments");

/**
 * MIN-340 — `signedAttachmentUrl` est le SEUL endroit où un fichier privé
 * devient une URL. C'est donc le seul endroit où se décide s'il sera affiché
 * ou téléchargé, et ce que ce test épingle est cette décision, pas la
 * signature.
 *
 * Ce qui est simulé ici : le storage, et lui seul. `createSignedUrl` note ce
 * qu'on lui demande — la présence d'un `download` EST la disposition « pièce
 * jointe », qui ne rend jamais rien et n'exécute donc jamais rien. `info`
 * rend l'entête que porte l'objet dans le bucket : pour une ressource de
 * ticket, qui monte directement du navigateur au storage, c'est la seule
 * vérité sur ce que le navigateur recevra — la ligne, elle, ne porte que ce
 * que le client a bien voulu déclarer.
 */

function fakeStorage(options: { contentType?: string; infoFails?: boolean } = {}) {
  const calls: { path: string; download: string | boolean | undefined }[] = [];
  const uploads: { path: string; contentType: string | undefined }[] = [];
  const rows: Record<string, unknown>[] = [];
  let infoCalls = 0;

  const client = {
    storage: {
      from: () => ({
        info: async () => {
          infoCalls += 1;
          if (options.infoFails) return { data: null, error: { message: "boom" } };
          return { data: { contentType: options.contentType ?? "" }, error: null };
        },
        createSignedUrl: async (
          path: string,
          _expiresIn: number,
          opts?: { download?: string | boolean }
        ) => {
          calls.push({ path, download: opts?.download });
          return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
        },
        upload: async (
          path: string,
          _body: unknown,
          opts?: { contentType?: string }
        ) => {
          uploads.push({ path, contentType: opts?.contentType });
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    // MIN-343 : l'enregistrement demande au storage qui a téléversé l'objet, et
    // le ménage demande aux tables qui le référence encore. Ici l'objet vient
    // d'être créé par le serveur (aucun téléverseur) et rien ne le référence.
    rpc: async () => ({ data: [], error: null }),
    from: () => ({
      insert: (batch: Record<string, unknown>[]) => {
        rows.push(...batch);
        return {
          select: async () => ({ data: batch.map((r) => ({ ...r, id: "row-1" })), error: null }),
        };
      },
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  } as unknown as SupabaseClient;

  return { client, calls, uploads, rows, infoCalls: () => infoCalls };
}

const PATH = "projects/11111111-1111-4111-8111-111111111111/abc/capture.png";

describe("signedAttachmentUrl — la disposition", () => {
  it("affiche un vrai PNG, sans rien ajouter", async () => {
    // Le risque de régression du sujet : la garde ne doit pas transformer
    // toutes les images de l'app en téléchargements.
    const storage = fakeStorage({ contentType: "image/png" });
    const url = await signedAttachmentUrl(storage.client, PATH);
    expect(url).toBe(`https://signed.test/${PATH}`);
    expect(storage.calls[0].download).toBeUndefined();
  });

  it("force la pièce jointe sur un objet servi en HTML", async () => {
    // Le fichier s'appelle `.png` et la ligne dira `image/png` ; l'entête que
    // le bucket porte, elle, dit `text/html`.
    const storage = fakeStorage({ contentType: "text/html" });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("force la pièce jointe sur un SVG", async () => {
    const storage = fakeStorage({ contentType: "image/svg+xml" });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("ferme la porte quand le type de l'objet est illisible", async () => {
    // Un fichier qui se télécharge au lieu de s'afficher est un désagrément ;
    // l'inverse est le sujet de ce ticket.
    const storage = fakeStorage({ infoFails: true });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("garde le nom de fichier demandé par l'appelant", async () => {
    const storage = fakeStorage({ contentType: "image/png" });
    await signedAttachmentUrl(storage.client, PATH, { download: "capture.png" });
    expect(storage.calls[0].download).toBe("capture.png");
    // Rien à demander au storage : la disposition est déjà décidée.
    expect(storage.infoCalls()).toBe(0);
  });

  it("croit l'appelant qui tient déjà un type de confiance", async () => {
    // Un fichier de page : son type a été déduit des OCTETS à l'envoi, la ligne
    // fait donc foi et l'aller-retour `info()` n'a rien à apprendre.
    const storage = fakeStorage({ contentType: "text/html" });
    await signedAttachmentUrl(storage.client, PATH, { mimeType: "image/png" });
    expect(storage.calls[0].download).toBeUndefined();
    expect(storage.infoCalls()).toBe(0);

    const risky = fakeStorage({ contentType: "image/png" });
    await signedAttachmentUrl(risky.client, PATH, { mimeType: "text/html" });
    expect(risky.calls[0].download).toBe(true);
  });
});

describe("uploadAttachment — le type rangé", () => {
  const args = {
    projectId: "11111111-1111-4111-8111-111111111111",
    issueId: "22222222-2222-4222-8222-222222222222",
    createdBy: "user-1",
    fileName: "capture.png",
  };

  it("range ce que les octets disent, pas ce que l'appelant annonce", async () => {
    const storage = fakeStorage();
    await uploadAttachment(storage.client, {
      ...args,
      mimeType: "image/png",
      data: Buffer.from("<!DOCTYPE html><script>alert(1)</script>"),
    });
    // L'entête posée sur l'OBJET compte autant que la ligne : c'est elle que le
    // bucket resservira, et c'est sur elle que se lit la garde de lecture.
    expect(storage.uploads[0].contentType).toBe("text/html");
    expect(storage.rows[0].mime_type).toBe("text/html");
  });

  it("laisse une vraie image passer pour ce qu'elle est", async () => {
    const storage = fakeStorage();
    await uploadAttachment(storage.client, {
      ...args,
      mimeType: "application/octet-stream",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    expect(storage.uploads[0].contentType).toBe("image/png");
    expect(storage.rows[0].mime_type).toBe("image/png");
  });
});
