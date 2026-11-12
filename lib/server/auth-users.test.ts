import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchAuthUsersById } = await import("./auth-users");

function serviceWithNames(names: string[]) {
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { id, user_metadata: { display_name: names.shift() } } },
    error: null,
  }));
  return { service: { auth: { admin: { getUserById } } } as never, getUserById };
}

describe("fetchAuthUsersById", () => {
  it("serves a cached identity, except for the ids asked fresh", async () => {
    // MIN-964: the reader renames themselves through Supabase Auth in the
    // browser; their own mention must not keep the cached name.
    const { service, getUserById } = serviceWithNames(["verify-bot", "Titeuf", "Titeuf"]);
    const first = await fetchAuthUsersById(service, ["reader-cache-test"]);
    expect(first.get("reader-cache-test")?.user_metadata.display_name).toBe("verify-bot");

    const cached = await fetchAuthUsersById(service, ["reader-cache-test"]);
    expect(cached.get("reader-cache-test")?.user_metadata.display_name).toBe("verify-bot");
    expect(getUserById).toHaveBeenCalledTimes(1);

    const fresh = await fetchAuthUsersById(service, ["reader-cache-test"], ["reader-cache-test"]);
    expect(fresh.get("reader-cache-test")?.user_metadata.display_name).toBe("Titeuf");
    expect(getUserById).toHaveBeenCalledTimes(2);
  });
});
