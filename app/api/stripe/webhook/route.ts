import { type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  findUserIdForStripeIdentifiers,
  syncSubscriptionToBillingAccount,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  coerceStripePlanId,
  fetchStripeSubscription,
  getStripeWebhookSecret,
  stripeUnixToIso,
  verifyStripeWebhookSignature,
  type StripeCheckoutSession,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/server/stripe";

/**
 * POST /api/stripe/webhook (MIN-72) — signature vérifiée (HMAC, tolérance
 * 300 s), idempotence par INSERT du `stripe_event_id` (PK) : un doublon viole
 * la contrainte et court-circuite. L'état d'abonnement est écrit dans
 * `billing_accounts` via `syncSubscriptionToBillingAccount` ; le filet du
 * re-sync paresseux (billing-accounts.ts) couvre les events manqués.
 */

interface StripeInvoicePayload {
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string | undefined>;
}

/** true = event nouveau ; false = déjà traité (unique violation 23505). */
async function tryRecordStripeEvent(event: StripeEvent): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: event,
    processed_at: new Date().toISOString(),
  });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(error.message);
}

async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  event: StripeEvent
): Promise<void> {
  const userId = session.metadata?.user_id ?? null;
  if (!userId) throw new Error("Checkout session is missing metadata.user_id.");

  await upsertBillingAccount(userId, {
    stripe_customer_id: session.customer ?? null,
    stripe_subscription_id: session.subscription ?? null,
    stripe_checkout_session_id: session.id,
    stripe_plan_id: coerceStripePlanId(session.metadata?.plan_id),
    stripe_last_event_id: event.id,
    stripe_last_event_created: stripeUnixToIso(event.created),
  });

  if (session.subscription) {
    const subscription = await fetchStripeSubscription(session.subscription);
    await syncSubscriptionToBillingAccount(subscription, event);
  }
}

export async function POST(request: NextRequest) {
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
    if (!(await tryRecordStripeEvent(event))) {
      return Response.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as StripeCheckoutSession,
          event
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscriptionToBillingAccount(
          event.data.object as StripeSubscription,
          event
        );
        break;

      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoicePayload;
        if (invoice.subscription) {
          const subscription = await fetchStripeSubscription(invoice.subscription);
          await syncSubscriptionToBillingAccount(subscription, event);
          break;
        }
        const userId =
          invoice.metadata?.user_id ??
          (await findUserIdForStripeIdentifiers({
            customerId: invoice.customer ?? null,
          }));
        if (userId) {
          await upsertBillingAccount(userId, {
            stripe_subscription_status: "past_due",
            stripe_last_event_id: event.id,
            stripe_last_event_created: stripeUnixToIso(event.created),
          });
        }
        break;
      }

      default:
        break;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] failed:", (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
