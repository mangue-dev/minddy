import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { projectStorageAllowed } from "./storage-quota";

const rpc = vi.fn();
const service = { rpc } as unknown as SupabaseClient;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("projectStorageAllowed", () => {
  it("asks the service-only quota function about the complete pending payload", async () => {
    await expect(
      projectStorageAllowed(service, "project-1", 12_345),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("project_storage_quota_allows", {
      p_project: "project-1",
      p_additional_bytes: 12_345,
    });
  });

  it("fails closed on invalid byte counts, database errors, and ambiguous results", async () => {
    await expect(
      projectStorageAllowed(service, "project-1", -1),
    ).resolves.toBe(false);
    await expect(
      projectStorageAllowed(service, "project-1", Number.MAX_SAFE_INTEGER + 1),
    ).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(
      projectStorageAllowed(service, "project-1", 1),
    ).resolves.toBe(false);

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      projectStorageAllowed(service, "project-1", 1),
    ).resolves.toBe(false);
  });
});
