import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as Array<{ name: string;
  args: Record<string, unknown> }>, protectedByScope: true,
  row: { email_protected: false, admin_override_note_protected: true },
  rowReads: 0 }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      state.rowReads += 1;
      return { data: state.row, error: null };
    } }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      return { data: { user_id: args.p_user_id,
        email: "sealed:email", admin_override_note: "sealed:note" },
      error: null };
    },
  }),
}));
vi.mock("./billing-content", () => ({
  shouldProtectBillingIdentity: async () => state.protectedByScope,
  encodeBillingField: async (_user: string, field: string, value: string) =>
    `sealed:${field}:${value}`,
  decodeBillingAccount: async (_user: string, row: Record<string, unknown>) =>
    ({ ...row, email: "private@example.test",
      admin_override_note: "Private administrative reason" }),
}));

const { upsertBillingAccount, applyStripeBillingEvent } =
  await import("./billing-accounts");

describe("billing identity service adapters", () => {
  it("sends only present protected fields through the atomic patch RPC", async () => {
    const userId = randomUUID();
    await upsertBillingAccount(userId, {
      email: "private@example.test", stripe_customer_id: "cus_test",
    });
    expect(state.calls.at(-1)).toEqual({ name: "upsert_billing_account_patch",
      args: { p_user_id: userId, p_patch: {
        email: "sealed:email:private@example.test",
        stripe_customer_id: "cus_test",
      } } });
    await upsertBillingAccount(userId, { stripe_customer_id: null });
    expect(state.calls.at(-1)?.args.p_patch).toEqual({ stripe_customer_id: null });
  });

  it("decodes protected identity returned by the atomic Stripe RPC", async () => {
    const userId = randomUUID();
    const account = await applyStripeBillingEvent(userId,
      { id: "evt_test", created: 1_700_000_000 } as never,
      { stripe_customer_id: "cus_test" });
    expect(state.calls.at(-1)?.name).toBe("apply_stripe_billing_event");
    expect(account.email).toBe("private@example.test");
    expect(account.admin_override_note).toBe("Private administrative reason");
  });

  it("keeps a cleared note protected while allowing a legacy email during a flag pause", async () => {
    state.protectedByScope = false;
    try {
      const userId = randomUUID();
      await upsertBillingAccount(userId, { admin_override_note: null });
      expect(state.calls.at(-1)?.args.p_patch).toEqual({ admin_override_note: null });
      const readsAfterClear = state.rowReads;
      await upsertBillingAccount(userId, { email: "legacy@example.test",
        admin_override_note: "Replacement note" });
      expect(state.rowReads).toBe(readsAfterClear + 1);
      expect(state.calls.at(-1)?.args.p_patch).toEqual({
        email: "legacy@example.test",
        admin_override_note: "sealed:admin_override_note:Replacement note",
      });
    } finally {
      state.protectedByScope = true;
    }
  });
});
