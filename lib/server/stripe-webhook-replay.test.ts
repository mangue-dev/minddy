import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — le webhook marquait l'événement TRAITÉ avant de le traiter.
 *
 * La ligne d'idempotence était écrite avec son `processed_at` dès l'arrivée. Une
 * panne transitoire au milieu du traitement (Stripe injoignable pour aller lire
 * l'abonnement, base indisponible une seconde) rendait un 500 ; Stripe rejouait,
 * tombait sur une ligne « déjà traitée » et n'appelait plus rien. L'activation
 * était perdue définitivement : un abonnement payé, un compte resté au plan Free,
 * et rien pour le dire.
 *
 * Ce que ces tests figent : la ligne est une RÉSERVATION, le tampon vient APRÈS
 * le succès, un doublon vraiment traité court-circuite, et une réservation
 * abandonnée finit par se reprendre.
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

    // Le rejeu immédiat voit une réservation fraîche : on lui dit de repasser.
    expect((await POST(request())).status).toBe(409);

    // Passé le délai d'abandon, la réservation se reprend — et cette fois ça passe.
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
