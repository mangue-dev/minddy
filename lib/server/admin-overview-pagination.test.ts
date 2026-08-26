import { beforeEach, describe, expect, it, vi } from "vitest";

const DATASET_SIZE = 5_001;

const users = Array.from({ length: DATASET_SIZE }, (_, index) => ({
  user_id: `user-${index}`,
  total_count: DATASET_SIZE,
}));
const billingAccounts = users.map(({ user_id }) => ({ user_id }));
const byokRows = users.map(({ user_id }) => ({ user_id }));

const rpc = vi.fn(async (_name: string, params: { p_limit: number; p_offset: number }) => ({
  data: users.slice(params.p_offset, params.p_offset + params.p_limit),
  error: null,
}));

const ranges: Record<string, Array<[number, number]>> = {};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc,
    from: (table: string) => ({
      select: () => ({
        range: async (from: number, to: number) => {
          (ranges[table] ??= []).push([from, to]);
          const source = table === "billing_accounts" ? billingAccounts : byokRows;
          return {
            data: source.slice(from, to + 1),
            error: null,
            count: source.length,
          };
        },
      }),
    }),
  }),
}));

const { fetchAllAdminUsers, fetchByokUserIds } = await import("./admin-users");
const { fetchAllBillingAccountsForAdmin } = await import("./billing-accounts");

beforeEach(() => {
  rpc.mockClear();
  for (const key of Object.keys(ranges)) delete ranges[key];
});

describe("admin overview pagination", () => {
  it("reads every admin user beyond the former 5,000-account ceiling", async () => {
    const result = await fetchAllAdminUsers();

    expect(result).toHaveLength(DATASET_SIZE);
    expect(rpc).toHaveBeenCalledTimes(11);
    expect(rpc.mock.calls[0]?.[1].p_offset).toBe(0);
    expect(rpc.mock.calls.at(-1)?.[1].p_offset).toBe(5_000);
  });

  it("reads all billing and BYOK rows across PostgREST response pages", async () => {
    await expect(fetchAllBillingAccountsForAdmin()).resolves.toHaveLength(DATASET_SIZE);
    await expect(fetchByokUserIds()).resolves.toHaveProperty("size", DATASET_SIZE);

    expect(ranges.billing_accounts).toHaveLength(11);
    expect(ranges.billing_accounts[0]).toEqual([0, 499]);
    expect(ranges.billing_accounts.at(-1)).toEqual([5_000, 5_499]);
    expect(ranges.user_ai_keys).toEqual(ranges.billing_accounts);
  });
});
