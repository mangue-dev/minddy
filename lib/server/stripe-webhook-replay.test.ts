import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — the webhook marked the event PROCESSED before processing it.
 *
 * The idempotence line was written with its `processed_at` upon arrival. A
 * transient failure in the middle of processing (Stripe unreachable to read
 * the subscription, base unavailable for a second) returned a 500; Stripe replayed,
 * came across an "already processed" line and called nothing more. The activation
 * was permanently lost: a paid subscription, an account remaining on the Free plan,
 * and nothing to say so.
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
const upsertBillingAccount = vi.fn(async (..._args: unknown[]) => {});
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
  upsertBillingAccount: (...args: unknown[]) => upsertBillingAccount(...args),
  findUserIdForStripeIdentifiers: async () => null,
  syncSubscriptionToBillingAccount: async () => {
    if (syncThrows) throw new Error("Stripe injoignable");
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
  syncThrows = false;
  upsertBillingAccount.mockClear();
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
  it("tamponne l'événement APRÈS l'avoir traité", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(upsertBillingAccount).toHaveBeenCalledTimes(1);
    expect(rows[0].processed_at).toBeTruthy();
  });

  it("un rejeu d'un événement traité ne refait rien", async () => {
    await POST(request());
    upsertBillingAccount.mockClear();
    const res = await POST(request());
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(upsertBillingAccount).not.toHaveBeenCalled();
  });

  it("un échec de traitement laisse l'événement REJOUABLE", async () => {
    syncThrows = true;
    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(rows[0].processed_at).toBeNull();

    // The immediate replay sees a fresh reservation: he is told to play again.
    expect((await POST(request())).status).toBe(409);

    // After the abandonment period, the reservation is resumed — and this time it goes through.
    rows[0].created_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    syncThrows = false;
    const retried = await POST(request());
    expect(retried.status).toBe(200);
    expect(rows[0].processed_at).toBeTruthy();
  });

  it("refuse une session de checkout sans user_id plutôt que de deviner", async () => {
    (event.data as { object: Record<string, unknown> }).object.metadata = {};
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(upsertBillingAccount).not.toHaveBeenCalled();
    expect(rows[0].processed_at).toBeNull();
  });
});
