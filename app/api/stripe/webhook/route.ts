import { type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  applyStripeBillingEvent,
  findUserIdForStripeIdentifiers,
  syncSubscriptionToBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  coerceStripePlanId,
  fetchStripeSubscription,
  getStripeWebhookSecret,
  isStripeConfigured,
  verifyStripeWebhookSignature,
  type StripeCheckoutSession,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/server/stripe";
import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";
import type { ServerAnalyticsEventName } from "@/lib/analytics-events";

/**
 * POST /api/stripe/webhook (MIN-72) — verified signature (HMAC, tolerance
 * 300 s), idempotence by INSERT of `stripe_event_id` (PK): a duplicate violates the
 * constraint, and it is the `processed_at` of the line which says if the event has
 * REALLY been processed (MIN-344, cf. `claimStripeEvent`). The subscription status is written in
 * `billing_accounts` via `syncSubscriptionToBillingAccount` ; the net of
 * lazy re-sync (billing-accounts.ts) covers missed events.
 */

interface StripeInvoicePayload {
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string | undefined>;
}

/**
 * L'IDEMPOTENCE EN DEUX TEMPS (MIN-344).
 *
 * The line was written with its `processed_at` BEFORE the event was
 * handled: a transient breakdown in the middle (Stripe unreachable to go
 * search for the subscription, base unavailable for a second) returned a 500, Stripe
 * was playing again — and the replay fell on an "already processed" line and did not call
 * nothing more. The activation was lost FOREVER, without a trace that
 * say: a paid subscription, an account remaining on the Free plan.
 *
 * From now on the line is a RESERVATION (`processed_at` null) which we stamp
 * afterwards. Hence three outcomes when taking it:
 * • `fresh` — ours to deal with;
 * • `done` — a duplicate of an event already completed (Stripe replays
 *                   volontiers), on court-circuite ;
 * • `inflight` — another summon reserved it just now. We return a
 * error so that Stripe plays again later rather than
 * process twice in parallel.
 *
 * An ABANDONED reservation (summon killed in between) would otherwise remain
 * blocked for life: after `STALE_CLAIM_MS`, we take it back.
 */
const STALE_CLAIM_MS = 5 * 60 * 1000;

type ClaimOutcome = "fresh" | "done" | "inflight";

async function claimStripeEvent(event: StripeEvent): Promise<ClaimOutcome> {
  const service = getServiceClient();
  const { error } = await service.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: event,
    processed_at: null,
  });
  if (!error) return "fresh";
  if ((error as { code?: string }).code !== "23505") throw new Error(error.message);

  // Already a line: processed, or reserved by someone else.
  const { data } = await service
    .from("stripe_webhook_events")
    .select("processed_at, created_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  const row = data as { processed_at: string | null; created_at: string } | null;
  if (!row) return "fresh"; // Unlikely race (line erased): we do it again.
  if (row.processed_at) return "done";
  const age = Date.now() - new Date(row.created_at).getTime();
  return age > STALE_CLAIM_MS ? "fresh" : "inflight";
}

/** Final buffer: HE is the one who makes the event non-replayable. */
async function markStripeEventProcessed(eventId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", eventId);
  if (error) {
    // The treatment was successful. Do not raise: a 500 would replay a
    // event whose effect is already in base, without repairing anything.
    console.error("[stripe-webhook] mark processed failed:", error.message);
  }
}

async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  event: StripeEvent
): Promise<void> {
  const userId = session.metadata?.user_id ?? null;
  if (!userId) throw new Error("Checkout session is missing metadata.user_id.");

  await applyStripeBillingEvent(userId, event, {
    stripe_customer_id: session.customer ?? null,
    stripe_subscription_id: session.subscription ?? null,
    stripe_checkout_session_id: session.id,
    stripe_plan_id: coerceStripePlanId(session.metadata?.plan_id),
  });

  if (session.subscription) {
    const subscription = await fetchStripeSubscription(session.subscription);
    await syncSubscriptionToBillingAccount(subscription, event);
  }
}

/**
 * Analytics event name for a Stripe event type (MIN-78).
 *
 * These events are the ONLY reliable source of income: the customer only sees
 * never a renewal, a payment failure or a termination made
 * from the Stripe portal. They therefore start from the webhook, which is also the only
 * place where the information is authenticated by signature.
 */
/** Emits the billing event, if the user could be resolved. */
function trackBilling(
  event: StripeEvent,
  userId: string | null,
  properties: Record<string, unknown>
): void {
  if (!userId) return;
  const name = billingEventName(
    event.type,
    typeof properties.status === "string" ? properties.status : null
  );
  if (!name) return;
  captureServerEvent({ distinctId: userId, event: name, properties });
  // The plan becomes the property of no one: all analyzes (retention,
  // funnels, use) can then be cut by plan without joints.
  if (typeof properties.plan_id === "string") {
    identifyServerUser(userId, { plan: properties.plan_id });
  } else if (name === "subscription_cancelled") {
    identifyServerUser(userId, { plan: "free" });
  }
}

function billingEventName(
  stripeType: string,
  status: string | null | undefined
): ServerAnalyticsEventName | null {
  switch (stripeType) {
    case "checkout.session.completed":
      return "subscription_activated";
    case "customer.subscription.created":
      return "subscription_activated";
    case "customer.subscription.deleted":
      return "subscription_cancelled";
    case "customer.subscription.paused":
      return "subscription_paused";
    case "customer.subscription.resumed":
      return "subscription_resumed";
    case "customer.subscription.updated":
      // Stripe sends `updated` for everything: change of plan, switching to
      // unpaid, scheduled termination. The status disambiguates.
      return status === "canceled" ? "subscription_cancelled" : "subscription_updated";
    case "invoice.payment_failed":
      return "subscription_payment_failed";
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  // A self-hosted instance does not have a Stripe webhook to process. Answer
  // without reading the body avoids creating a ledger line or a side effect
  // billable when an endpoint is simply exposed by Next.
  if (!isStripeConfigured()) {
    return Response.json({ error: "Managed billing is not configured" }, { status: 503 });
  }

  let event: StripeEvent;
  try {
    const payload = await request.text();
    event = verifyStripeWebhookSignature(
      payload,
      request.headers.get("stripe-signature"),
      getStripeWebhookSecret()
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const claim = await claimStripeEvent(event);
    if (claim === "done") {
      return Response.json({ received: true, duplicate: true });
    }
    if (claim === "inflight") {
      // 409: Stripe replays anything that isn't 2xx, and that's what we
      // wants — the current summon may end, but if it dies, the
      // replay will resume the expired reservation.
      return Response.json({ error: "Event already in flight" }, { status: 409 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;
        await handleCheckoutCompleted(session, event);
        trackBilling(event, session.metadata?.user_id ?? null, {
          plan_id: session.metadata?.plan_id ?? "unknown",
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as StripeSubscription;
        const userId = await syncSubscriptionToBillingAccount(subscription, event);
        trackBilling(event, userId, {
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoicePayload;
        if (invoice.subscription) {
          const subscription = await fetchStripeSubscription(invoice.subscription);
          const failedUserId = await syncSubscriptionToBillingAccount(subscription, event);
          trackBilling(event, failedUserId, { status: subscription.status });
          break;
        }
        const userId =
          invoice.metadata?.user_id ??
          (await findUserIdForStripeIdentifiers({
            customerId: invoice.customer ?? null,
          }));
        if (userId) {
          await applyStripeBillingEvent(userId, event, {
            stripe_subscription_status: "past_due",
          });
          trackBilling(event, userId, { status: "past_due" });
        }
        break;
      }

      default:
        break;
    }

    await markStripeEventProcessed(event.id);
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] failed:", (error as Error).message);
    // The reservation remains WITHOUT stamp: the Stripe replay will take it back
    // (immediately if it is expired, on the next try otherwise). Nothing is
    // deleted — the line keeps the payload, which is the trace of the incident.
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
