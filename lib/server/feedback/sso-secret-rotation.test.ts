import { beforeEach, describe, expect, it, vi } from "vitest";

let storedSecret: string | null = null;
const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
  if (!args.p_only_if_absent || storedSecret === null) {
    storedSecret = args.p_sso_secret as string | null;
  }
  return { data: storedSecret, error: null };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc }),
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("@/lib/server/feedback/sso-crypto", () => ({
  encryptBoardSsoSecret: (plain: string) => `sealed:${plain}`,
  isSsoCryptoConfigured: () => true,
  readBoardSsoSecret: (stored: string | null) => ({
    plain: stored?.replace(/^sealed:/, "") ?? null,
    legacy: false,
  }),
}));

const { getOrCreateSsoSecret, rotateSsoSecret } = await import(
  "@/lib/server/feedback/boards"
);

beforeEach(() => {
  storedSecret = null;
  rpc.mockClear();
});

describe("feedback SSO secret writes", () => {
  it("makes parallel initialization calls converge on one stored secret", async () => {
    const [first, second] = await Promise.all([
      getOrCreateSsoSecret("project-1"),
      getOrCreateSsoSecret("project-1"),
    ]);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every(([, args]) => args.p_only_if_absent === true)).toBe(true);
  });

  it("routes explicit rotation through the serialized database writer", async () => {
    const initial = await getOrCreateSsoSecret("project-1");
    const rotated = await rotateSsoSecret("project-1");

    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(initial);
    expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({
      p_project_id: "project-1",
      p_only_if_absent: false,
    });
  });
});
