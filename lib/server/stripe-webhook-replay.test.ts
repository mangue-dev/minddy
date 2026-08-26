import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — the webhook used to mark an event processed before handling it.
 *
 * The idempotence line was written with its `processed_at` upon arrival. A
 * transient failure in the middle of processing returned a 500; Stripe replayed,
 * found an "already processed" row, and did nothing. The activation was
 * permanently lost while the paid account remained on the Free plan.
 *
 * What these tests freeze: the line is a RESERVATION, the buffer comes AFTER
 * success, a truly processed duplicate short-circuits, and an abandoned reservation
 * ends up being resumed.
 */

interface EventRow {
  stripe_event_id: string;
  processed_at: string | null;
  created_at: string;
}

let rows: EventRow[] = [];
let event: Record<string, unknown>;
let billingAccount: Record<string, unknown> | null = null;
const applyStripeBillingEvent = vi.fn(
  async (
    _userId: string,
    stripeEvent: { id: string; created: number },
    updates: Record<string, unknown>,
  ) => {
    const currentCreated = Number(billingAccount?.stripe_last_event_created ?? -1);
    const currentId = String(billingAccount?.stripe_last_event_id ?? "");
    if (
      stripeEvent.created > currentCreated ||
      (stripeEvent.created === currentCreated && stripeEvent.id >= currentId)
    ) {
      billingAccount = {
        ...billingAccount,
        ...updates,
        stripe_last_event_id: stripeEvent.id,
        stripe_last_event_created: stripeEvent.created,
      };
    }
    return billingAccount;
  },
);
let syncThrows = false;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table !== "stripe_webhook_events") throw new Error(`table : ${table}`);
      return {
        insert: async (row: EventRow) => {
          if (rows.some((r) => r.stripe_event_id === row.stripe_event_id)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          rows.push({ ...row, created_at: new Date().toISOString() });
          return { error: null };
        },
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({
              data: rows.find((r) => r.stripe_event_id === id) ?? null,
            }),
          }),
        }),
        update: (patch: Partial<EventRow>) => ({
          eq: async (_column: string, id: string) => {
            const row = rows.find((r) => r.stripe_event_id === id);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
  }),
}));
vi.mock("@/lib/server/billing-accounts", () => ({
  applyStripeBillingEvent: (...args: Parameters<typeof applyStripeBillingEvent>) =>
    applyStripeBillingEvent(...args),
  findUserIdForStripeIdentifiers: async () => null,
  syncSubscriptionToBillingAccount: async (
    subscription: Record<string, unknown>,
    stripeEvent: { id: string; created: number },
  ) => {
    if (syncThrows) throw new Error("Stripe unavailable");
    await applyStripeBillingEvent("user-1", stripeEvent, {
      stripe_plan_id: subscription.plan_id ?? null,
      stripe_subscription_status: subscription.status ?? null,
    });
    return "user-1";
  },
}));
vi.mock("@/lib/server/stripe", () => ({
  isStripeConfigured: () => true,
  verifyStripeWebhookSignature: () => event,
  getStripeWebhookSecret: () => "whsec_test",
  coerceStripePlanId: (id: string) => id,
  fetchStripeSubscription: async () => ({ status: "active" }),
  stripeUnixToIso: () => "2026-08-14T00:00:00.000Z",
}));
vi.mock("@/lib/server/posthog", () => ({
  captureServerEvent: () => {},
  identifyServerUser: () => {},
}));

const { POST } = await import("@/app/api/stripe/webhook/route");

function request() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=x" },
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  rows = [];
  billingAccount = null;
  syncThrows = false;
  applyStripeBillingEvent.mockClear();
  event = {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    created: 1_760_000_000,
    data: {
      object: {
        id: "cs_1",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { user_id: "user-1", plan_id: "pro" },
      },
    },
  };
});

describe("POST /api/stripe/webhook", () => {
  it("routes Stripe-owned writes through the atomic event-ordering boundary", () => {
    const billingSource = readFileSync(
      join(process.cwd(), "lib/server/billing-accounts.ts"),
      "utf8",
    );
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20270106360000_fail_open_operational_correctness.sql",
      ),
      "utf8",
    );

    expect(billingSource).toContain('.rpc("apply_stripe_billing_event"');
    expect(migration).toContain(
      "billing_accounts.stripe_last_event_created < excluded.stripe_last_event_created",
    );
    expect(migration).toContain(
      "coalesce(billing_accounts.stripe_last_event_id, '') <= excluded.stripe_last_event_id",
    );
    expect(migration).toContain("to service_role;");
  });

  it("marks the event processed after handling it", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(applyStripeBillingEvent).toHaveBeenCalledTimes(2);
    expect(rows[0].processed_at).toBeTruthy();
  });

  it("does not process an already completed event twice", async () => {
    await POST(request());
    applyStripeBillingEvent.mockClear();
    const res = await POST(request());
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(applyStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("leaves a failed event replayable", async () => {
    syncThrows = true;
    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(rows[0].processed_at).toBeNull();

    // An immediate replay sees a fresh reservation and is told to retry later.
    expect((await POST(request())).status).toBe(409);

    // After the abandonment period, the reservation is resumed — and this time it goes through.
    rows[0].created_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    syncThrows = false;
    const retried = await POST(request());
    expect(retried.status).toBe(200);
    expect(rows[0].processed_at).toBeTruthy();
  });

  it("rejects a checkout session without user_id instead of guessing", async () => {
    (event.data as { object: Record<string, unknown> }).object.metadata = {};
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(applyStripeBillingEvent).not.toHaveBeenCalled();
    expect(rows[0].processed_at).toBeNull();
  });

  it("keeps entitlement state monotonic when Stripe events arrive out of order", async () => {
    event = {
      id: "evt_newer",
      type: "customer.subscription.updated",
      livemode: false,
      created: 200,
      data: { object: { status: "active", plan_id: "pro" } },
    };
    expect((await POST(request())).status).toBe(200);

    event = {
      id: "evt_older",
      type: "customer.subscription.deleted",
      livemode: false,
      created: 100,
      data: { object: { status: "canceled", plan_id: "pro" } },
    };
    expect((await POST(request())).status).toBe(200);

    expect(billingAccount).toMatchObject({
      stripe_plan_id: "pro",
      stripe_subscription_status: "active",
      stripe_last_event_id: "evt_newer",
      stripe_last_event_created: 200,
    });
  });
});
