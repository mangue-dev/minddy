import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const { signedAttachmentUrl, uploadAttachment } = await import("./attachments");

/**
 * MIN-340 — `signedAttachmentUrl` is the only place where a private file
 * becomes a URL. It decides whether the browser displays or downloads the
 * object; these tests cover that disposition decision rather than signing.
 *
 * Only Storage is simulated. `createSignedUrl` records whether the caller asks
 * for a download, which prevents the browser from rendering active content.
 * `info` returns the content type stored on the object. Direct browser uploads
 * make that header the authoritative type served to the browser.
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
    // MIN-343: registration asks Storage who uploaded the object, and cleanup
    // asks which rows still reference it. Server-created objects have no
    // uploader in this fixture. The service upload quota check is allowed.
    rpc: async (name: string) => ({
      data: name === "project_storage_quota_allows" ? true : [],
      error: null,
    }),
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

describe("signedAttachmentUrl disposition", () => {
  it("displays a real PNG without forcing a download", async () => {
    // The serving guard must not turn every image into a download.
    const storage = fakeStorage({ contentType: "image/png" });
    const url = await signedAttachmentUrl(storage.client, PATH);
    expect(url).toBe(`https://signed.test/${PATH}`);
    expect(storage.calls[0].download).toBeUndefined();
  });

  it("forces a download for an object served as HTML", async () => {
    // The filename and resource row claim PNG, but the bucket header says HTML.
    const storage = fakeStorage({ contentType: "text/html" });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("forces a download for SVG", async () => {
    const storage = fakeStorage({ contentType: "image/svg+xml" });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("fails closed when the stored object type cannot be read", async () => {
    // Downloading a safe file is preferable to rendering unreadable metadata.
    const storage = fakeStorage({ infoFails: true });
    await signedAttachmentUrl(storage.client, PATH);
    expect(storage.calls[0].download).toBe(true);
  });

  it("preserves the filename requested by the caller", async () => {
    const storage = fakeStorage({ contentType: "image/png" });
    await signedAttachmentUrl(storage.client, PATH, { download: "capture.png" });
    expect(storage.calls[0].download).toBe("capture.png");
    // The caller already chose the disposition, so no Storage lookup is needed.
    expect(storage.infoCalls()).toBe(0);
  });

  it("uses a trusted type supplied by the caller", async () => {
    // A page file's type was derived from its bytes during upload, so the
    // resource row is authoritative and an `info()` round trip adds nothing.
    const storage = fakeStorage({ contentType: "text/html" });
    await signedAttachmentUrl(storage.client, PATH, { mimeType: "image/png" });
    expect(storage.calls[0].download).toBeUndefined();
    expect(storage.infoCalls()).toBe(0);

    const risky = fakeStorage({ contentType: "image/png" });
    await signedAttachmentUrl(risky.client, PATH, { mimeType: "text/html" });
    expect(risky.calls[0].download).toBe(true);
  });
});

describe("uploadAttachment stored type", () => {
  const args = {
    projectId: "11111111-1111-4111-8111-111111111111",
    issueId: "22222222-2222-4222-8222-222222222222",
    createdBy: "user-1",
    fileName: "capture.png",
  };

  it("stores the type detected from bytes instead of the caller claim", async () => {
    const storage = fakeStorage();
    await uploadAttachment(storage.client, {
      ...args,
      mimeType: "image/png",
      data: Buffer.from("<!DOCTYPE html><script>alert(1)</script>"),
    });
    // The object header and resource row must agree because the serving guard
    // reads the header again before issuing a signed URL.
    expect(storage.uploads[0].contentType).toBe("text/html");
    expect(storage.rows[0].mime_type).toBe("text/html");
  });

  it("stores a real image with its detected image type", async () => {
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
