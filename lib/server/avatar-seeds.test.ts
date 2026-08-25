import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AvatarFileError,
  claimPendingAvatar,
  clearAvatarUploadToken,
  compressAvatarFile,
  fetchAvatarSeeds,
  MAX_AVATAR_UPLOAD_BYTES,
} from "./avatar-seeds";
import { uploadedAvatarUrl } from "@/lib/avatar-source";

const png = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 50, g: 120, b: 210, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

describe("compressAvatarFile", () => {
  it("center-crops a source image to a bounded square WebP", async () => {
    const output = await compressAvatarFile(await png(1200, 600));
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
    expect(output.byteLength).toBeLessThan(100 * 1024);
  });

  it("rejects unreadable and oversized files", async () => {
    await expect(compressAvatarFile(Buffer.from("not an image"))).rejects.toBeInstanceOf(
      AvatarFileError,
    );
    await expect(
      compressAvatarFile(Buffer.alloc(MAX_AVATAR_UPLOAD_BYTES + 1)),
    ).rejects.toMatchObject({ key: "tooLarge" });
  });
});

describe("claimPendingAvatar", () => {
  it("moves a staged signup image to the authenticated account and consumes it", async () => {
    const token = "123e4567-e89b-12d3-a456-426614174000";
    const userId = "123e4567-e89b-12d3-a456-426614174001";
    const downloads: string[] = [];
    const uploads: Array<{ path: string; bytes: Buffer }> = [];
    const removals: string[][] = [];
    const rows: Array<Record<string, unknown>> = [];
    const pending = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });

    const client = {
      storage: {
        from: () => ({
          download: async (path: string) => {
            downloads.push(path);
            return { data: pending, error: null };
          },
          upload: async (path: string, bytes: Buffer) => {
            uploads.push({ path, bytes });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            removals.push(paths);
            return { error: null };
          },
        }),
      },
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await expect(claimPendingAvatar(client, userId, token)).resolves.toBe(true);
    expect(downloads).toEqual([`pending/${token}.webp`]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path).toBe(`users/${userId}.webp`);
    expect(uploads[0]?.bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(rows[0]).toMatchObject({
      user_id: userId,
      image_path: `users/${userId}.webp`,
    });
    expect(removals).toEqual([[`pending/${token}.webp`]]);
  });

  it("treats a consumed or unknown token as a no-op", async () => {
    const client = {
      storage: {
        from: () => ({
          download: async () => ({ data: null, error: { message: "Not found" } }),
        }),
      },
    } as unknown as SupabaseClient;

    await expect(
      claimPendingAvatar(
        client,
        "123e4567-e89b-12d3-a456-426614174001",
        "123e4567-e89b-12d3-a456-426614174000",
      ),
    ).resolves.toBe(false);
  });
});

describe("fetchAvatarSeeds", () => {
  it("resolves an imported image through the legacy avatar source map", async () => {
    const userId = "123e4567-e89b-12d3-a456-426614174001";
    const client = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [
              {
                user_id: userId,
                seed: "lorelei-seed",
                image_path: `users/${userId}.webp`,
                updated_at: "2026-08-25T18:00:00.000Z",
              },
            ],
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const sources = await fetchAvatarSeeds(client, [userId]);
    expect(uploadedAvatarUrl(sources.get(userId))).toBe(
      `/api/avatars/${userId}?v=2026-08-25T18%3A00%3A00.000Z`,
    );
  });
});

describe("clearAvatarUploadToken", () => {
  it("removes only the consumed signup token from auth metadata", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const client = {
      auth: {
        admin: {
          updateUserById: async (_userId: string, attributes: Record<string, unknown>) => {
            writes.push(attributes);
            return { error: null };
          },
        },
      },
    } as unknown as SupabaseClient;

    await clearAvatarUploadToken(client, "user-id", {
      full_name: "Ada",
      avatar_seed: "seed",
      avatar_upload_token: "single-use",
    });

    expect(writes).toEqual([
      { user_metadata: { full_name: "Ada", avatar_seed: "seed" } },
    ]);
  });
});
