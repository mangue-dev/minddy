import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { removeUnretainedResources } from "./attachments";

describe("unretained comment resources", () => {
  it("removes each unreferenced file object exactly once and ignores non-files", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const client = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      }),
      storage: {
        from: () => ({ remove }),
      },
    } as unknown as SupabaseClient;
    const file = {
      storage_path: "projects/project-1/upload/reply.png",
      file_name: "reply.png",
      mime_type: "image/png",
      size_bytes: 12,
    };

    await removeUnretainedResources(client, [
      file,
      file,
      { kind: "link", url: "https://example.com", file_name: "Example" },
      { kind: "page", page_id: "page-1", file_name: "Page" },
    ]);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([file.storage_path]);
  });
});
