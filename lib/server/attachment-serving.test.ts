import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const { signedAttachmentUrl, uploadAttachment } = await import("./attachments");

/**
 * MIN-340 — `signedAttachmentUrl` is the ONLY place where a private
 * file becomes a URL. This is therefore the only place where it is decided whether it will be displayed
 * or downloaded, and what this test pinpoints is this decision, not the
 * signature.
 *
 * What is simulated here: storage, and it alone. `createSignedUrl` notes what
 * is being asked for — the presence of a `download` IS the provision "exhibit
 * attached", which never renders anything and therefore never executes anything. `info`
 * returns the header that the object carries in the bucket: for a resource of
 * ticket, which goes directly from the browser to the storage, it is the only
 * truth about what the browser will receive — the line only carries this
 * that the client has requested declare.
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
    // MIN-343: the registration asks the storage which uploaded the object, and
    // housekeeping asks the tables who still references it. Here the object comes
    // to be created by the server (no uploader) and nothing references it.
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
    // The risk of regression of the subject: custody must not transform
    // all images in the app for downloads.
    const storage = fakeStorage({ contentType: "image/png" });
    const url = await signedAttachmentUrl(storage.client, PATH);
    expect(url).toBe(`https://signed.test/${PATH}`);
    expect(storage.calls[0].download).toBeUndefined();
  });

  it("force la pièce jointe sur un objet servi en HTML", async () => {
    // The file is called `.png` and the line will say `image/png`; the header that
    // the bucket carries, it says `text/html`.
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
    // A file that downloads instead of displaying is an inconvenience;
    // the opposite is the subject of this ticket.
    const storage = fakeStorage({ infoFails: true });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("garde le nom de fichier demandé par l'appelant", async () => {
    const storage = fakeStorage({ contentType: "image/png" });
    await signedAttachmentUrl(storage.client, PATH, { download: "capture.png" });
    expect(storage.calls[0].download).toBe("capture.png");
    // Nothing to ask for storage: the arrangement has already been decided.
    expect(storage.infoCalls()).toBe(0);
  });

  it("croit l'appelant qui tient déjà un type de confiance", async () => {
    // A page file: its type was deduced from the BYTES when sending, the line
    // is therefore authentic and the `info()` round trip has nothing to learn.
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
    // The header placed on the OBJECT counts as much as the line: it is this that the
    // bucket will be used again, and it is on it that the reading guard is read.
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
