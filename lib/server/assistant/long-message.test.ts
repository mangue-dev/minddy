import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LONG_MESSAGE_EXCERPT_CHARS, longMessageAttachment } from "./long-message";
import { MAX_INLINE_MESSAGE_CHARS } from "./sanitize";

const h = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/server/attachments", async (original) => ({
  ...await original<typeof import("@/lib/server/attachments")>(),
  uploadPrivateAttachmentObject: h.upload,
}));

const USER = "11111111-1111-4111-8111-111111111111";
const LABELS = { fileName: "Pasted text 2026-11-06 21.30.txt", note: "Full text attached as a file: Pasted text 2026-11-06 21.30.txt" };
const service = { rpc: h.rpc } as unknown as SupabaseClient;

beforeEach(() => {
  h.upload.mockReset().mockResolvedValue(undefined);
  h.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

describe("longMessageAttachment (MIN-916)", () => {
  it("leaves a message that fits inline alone", async () => {
    expect(await longMessageAttachment(service, USER, "short", LABELS)).toBeNull();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("stores the whole text as a chat file and keeps an excerpt with a note", async () => {
    const logs = Array.from({ length: 2_000 }, (_, i) => `2026-11-06\tINFO\trequest ${i}`).join("\r\n");
    expect(logs.length).toBeGreaterThan(MAX_INLINE_MESSAGE_CHARS);
    const result = await longMessageAttachment(service, USER, logs, LABELS);

    expect(result?.attachment).toMatchObject({ file_name: LABELS.fileName, mime_type: "text/plain" });
    expect(result?.attachment.storage_path.startsWith(`chat/${USER}/`)).toBe(true);
    const [, path, bytes, mime] = h.upload.mock.calls[0];
    expect(path).toBe(result?.attachment.storage_path);
    expect(mime).toBe("text/plain");
    // The file keeps every line and its tabs; only the line endings are unified.
    const stored = new TextDecoder().decode(bytes as Uint8Array);
    expect(stored).toBe(logs.replace(/\r\n/g, "\n"));
    expect(result?.attachment.size_bytes).toBe((bytes as Uint8Array).byteLength);

    expect(result!.content.length).toBeLessThan(LONG_MESSAGE_EXCERPT_CHARS + 200);
    expect(result!.content.startsWith("2026-11-06 INFO request 0")).toBe(true);
    expect(result!.content.endsWith(LABELS.note)).toBe(true);
  });

  it("returns null without storing anything when the quota is exhausted", async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect(await longMessageAttachment(service, USER, "x".repeat(20_000), LABELS)).toBeNull();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("returns null when the upload fails, so the caller keeps the marked excerpt", async () => {
    h.upload.mockRejectedValue(new Error("storage down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await longMessageAttachment(service, USER, "x".repeat(20_000), LABELS)).toBeNull();
  });
});
