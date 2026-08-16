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
  isStripeConfigured,
  stripeUnixToIso,
  verifyStripeWebhookSignature,
  type StripeCheckoutSession,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/server/stripe";
import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";

/**
 * POST /api/stripe/webhook (MIN-72) — signature vérifiée (HMAC, tolérance
 * 300 s), idempotence par INSERT du `stripe_event_id` (PK) : un doublon viole la
 * contrainte, et c'est le `processed_at` de la ligne qui dit si l'événement a
 * VRAIMENT été traité (MIN-344, cf. `claimStripeEvent`). L'état d'abonnement est écrit dans
 * `billing_accounts` via `syncSubscriptionToBillingAccount` ; le filet du
 * re-sync paresseux (billing-accounts.ts) couvre les events manqués.
 */

interface StripeInvoicePayload {
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string | undefined>;
}

/**
 * L'IDEMPOTENCE EN DEUX TEMPS (MIN-344).
 *
 * La ligne était écrite avec son `processed_at` AVANT que l'événement soit
 * traité : une panne transitoire au milieu (Stripe injoignable pour aller
 * chercher l'abonnement, base indisponible une seconde) rendait un 500, Stripe
 * rejouait — et le rejeu tombait sur une ligne « déjà traitée » et n'appelait
 * plus rien. L'activation était perdue POUR TOUJOURS, sans une trace qui le
 * dise : un abonnement payé, un compte resté au plan Free.
 *
 * Désormais la ligne est une RÉSERVATION (`processed_at` null) qu'on tamponne
 * après coup. D'où trois issues au moment de la prendre :
 *   • `fresh`     — à nous de traiter ;
 *   • `done`      — un doublon d'un événement déjà mené à bien (Stripe rejoue
 *                   volontiers), on court-circuite ;
 *   • `inflight`  — une autre invocation l'a réservé à l'instant. On rend une
 *                   erreur pour que Stripe rejoue plus tard plutôt que de
 *                   traiter deux fois en parallèle.
 *
 * Une réservation ABANDONNÉE (invocation tuée entre les deux) resterait sinon
 * bloquante à vie : passé `STALE_CLAIM_MS`, on la reprend.
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

  // Déjà une ligne : traitée, ou réservée par quelqu'un d'autre.
  const { data } = await service
    .from("stripe_webhook_events")
    .select("processed_at, created_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  const row = data as { processed_at: string | null; created_at: string } | null;
  if (!row) return "fresh"; // Course improbable (ligne effacée) : on refait.
  if (row.processed_at) return "done";
  const age = Date.now() - new Date(row.created_at).getTime();
  return age > STALE_CLAIM_MS ? "fresh" : "inflight";
}

/** Tampon final : c'est LUI qui rend l'événement non rejouable. */
async function markStripeEventProcessed(eventId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", eventId);
  if (error) {
    // Le traitement, lui, a réussi. Ne pas lever : un 500 ferait rejouer un
    // événement dont l'effet est déjà en base, sans rien réparer.
    console.error("[stripe-webhook] mark processed failed:", error.message);
  }
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

/**
 * Nom d'événement analytics pour un type d'événement Stripe (MIN-78).
 *
 * Ces événements sont la SEULE source fiable du revenu : le client ne voit
 * jamais un renouvellement, un échec de paiement ni une résiliation faite
 * depuis le portail Stripe. Ils partent donc du webhook, qui est aussi le seul
 * endroit où l'information est authentifiée par signature.
 */
/** Émet l'événement de facturation, si l'utilisateur a pu être résolu. */
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
  // Le plan devient une propriété de personne : toutes les analyses (rétention,
  // entonnoirs, usage) peuvent alors se découper par plan sans jointure.
  if (typeof properties.plan_id === "string") {
    identifyServerUser(userId, { plan: properties.plan_id });
  } else if (name === "subscription_cancelled") {
    identifyServerUser(userId, { plan: "free" });
  }
}

function billingEventName(
  stripeType: string,
  status: string | null | undefined
): string | null {
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
      // Stripe envoie `updated` pour tout : changement de plan, passage en
      // impayé, résiliation programmée. Le statut désambiguïse.
      return status === "canceled" ? "subscription_cancelled" : "subscription_updated";
    case "invoice.payment_failed":
      return "subscription_payment_failed";
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  // Une instance auto-hébergée n'a pas de webhook Stripe à traiter. Répondre
  // sans lire le corps évite de créer une ligne de ledger ou un effet secondaire
  // facturable lorsqu'un endpoint est simplement exposé par Next.
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
      // 409 : Stripe rejoue sur tout ce qui n'est pas 2xx, et c'est ce qu'on
      // veut — l'invocation en cours finira peut-être, mais si elle meurt, le
      // rejeu reprendra la réservation périmée.
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
          await upsertBillingAccount(userId, {
            stripe_subscription_status: "past_due",
            stripe_last_event_id: event.id,
            stripe_last_event_created: stripeUnixToIso(event.created),
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
    // La réservation reste SANS tampon : le rejeu de Stripe la reprendra
    // (immédiatement si elle est périmée, au prochain essai sinon). Rien n'est
    // effacé — la ligne garde le payload, qui est la trace de l'incident.
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
