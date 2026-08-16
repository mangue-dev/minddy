import "server-only";

import crypto from "node:crypto";
import { isManagedBillingEnabled } from "@/lib/managed-services";
import {
  coerceBillingPlanId,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Client Stripe minimal en fetch brut (pas de SDK), cloné d'AutoKap.
 * Périmètre v1 : checkout subscription mensuel (Go / Pro), portal, lecture
 * d'abonnement, vérification de signature webhook. Les price IDs viennent de
 * l'env (`STRIPE_PRICE_ID_GO` / `STRIPE_PRICE_ID_PRO`) — le prix facturé est
 * celui du price Stripe, les montants de lib/billing-plans.ts sont l'affichage.
 */

interface StripeList<T> {
  data: T[];
}

export interface StripeCustomer {
  id: string;
  email: string | null;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  metadata?: Record<string, string>;
}

export interface StripePortalSession {
  id: string;
  url: string;
}

export interface StripeSubscriptionItem {
  price: { id: string };
  /** Modèle « flexible » (API ≥ 2025-03-31) : la période courante est portée
   *  par l'item d'abonnement, plus par la racine. */
  current_period_start?: number;
  current_period_end?: number;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  /** Repli pour les anciennes versions d'API (période portée par la racine). */
  current_period_start?: number;
  current_period_end?: number;
  items: { data: StripeSubscriptionItem[] };
  metadata?: Record<string, string>;
}

/**
 * Une ligne du LEDGER Stripe (MIN-92) — tout ce qui a bougé d'argent sur le
 * compte. Meilleure source que les charges seules pour une page de finances :
 * les remboursements et les litiges s'y comptent tout seuls (lignes négatives,
 * `type: refund` / `adjustment`), et chaque ligne porte son `fee`, donc le `net`
 * réellement encaissé — une marge calculée sur le brut serait fausse.
 */
export interface StripeBalanceTransaction {
  id: string;
  /** `charge`, `refund`, `adjustment`, `payout`, `stripe_fee`… */
  type: string;
  /** Brut, en plus petite unité (centimes). Négatif pour un remboursement. */
  amount: number;
  /** Commission Stripe prélevée sur cette ligne. */
  fee: number;
  /** `amount - fee` : ce qui atterrit vraiment sur le compte. */
  net: number;
  currency: string;
  created: number;
  description: string | null;
  /** Id de l'objet à l'origine (charge, refund…). Non expandé. */
  source?: string | null;
}

export interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: T };
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return key;
}

export function isStripeConfigured(): boolean {
  return isManagedBillingEnabled();
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  return secret;
}

export function getStripePriceIdForPlan(
  planId: BillingPlanId,
  interval: BillingInterval = "month"
): string | null {
  const yearly = interval === "year";
  switch (planId) {
    case "go":
      return (
        (yearly ? process.env.STRIPE_PRICE_ID_GO_YEARLY : process.env.STRIPE_PRICE_ID_GO) ??
        null
      );
    case "pro":
      return (
        (yearly ? process.env.STRIPE_PRICE_ID_PRO_YEARLY : process.env.STRIPE_PRICE_ID_PRO) ??
        null
      );
    case "free":
      return null;
  }
}

/** Reconnaît les price IDs mensuels ET annuels d'un plan. */
export function getPlanIdForStripePrice(
  priceId: string | null | undefined
): BillingPlanId | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO ||
    priceId === process.env.STRIPE_PRICE_ID_GO_YEARLY
  ) {
    return "go";
  }
  if (
    priceId === process.env.STRIPE_PRICE_ID_PRO ||
    priceId === process.env.STRIPE_PRICE_ID_PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}

/**
 * La CADENCE d'un price configuré. Le pendant de `getPlanIdForStripePrice` :
 * l'un dit quel plan, l'autre à quel rythme il est facturé. Utilisé par la page
 * Finances, qui doit étaler un encaissement annuel sur douze mois et non sur un.
 * `null` pour un price inconnu (promo, ancien tarif) — l'appelant décide.
 */
export function getIntervalForStripePrice(
  priceId: string | null | undefined
): BillingInterval | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO_YEARLY ||
    priceId === process.env.STRIPE_PRICE_ID_PRO_YEARLY
  ) {
    return "year";
  }
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO ||
    priceId === process.env.STRIPE_PRICE_ID_PRO
  ) {
    return "month";
  }
  return null;
}

export function coerceStripePlanId(value: unknown): BillingPlanId | null {
  return coerceBillingPlanId(value);
}

/**
 * Une erreur de Stripe, avec ce que Stripe en dit — pas seulement sa phrase.
 *
 * Le message seul ne se relit pas : `code` et `param` sont ce qui permet de
 * distinguer « ce client n'existe pas » d'une panne, et de réparer plutôt que
 * de rendre un 500. Cf. `isMissingCustomerError`.
 */
export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly param: string | null,
    readonly status: number
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

/**
 * L'identifiant de client qu'on garde ne désigne-t-il plus rien ?
 *
 * **Ça arrive pour de vrai, et pas seulement en développement.** Un client
 * supprimé depuis le tableau de bord Stripe, une clé qui change de compte
 * Stripe (test → autre test, test → live) : l'identifiant reste écrit chez nous
 * et ne vaut plus rien chez eux. Vu en local avec un `cus_…` d'un ancien compte
 * de test — la page de facturation rendait un 500 sur un simple clic « passer
 * au plan supérieur », alors que le geste juste est de refaire un client.
 */
export function isMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof StripeApiError &&
    error.code === "resource_missing" &&
    (error.param === "customer" || /No such customer/i.test(error.message))
  );
}

async function stripeRequest<T>(
  path: string,
  body?: URLSearchParams,
  /** Forcé seulement là où le verbe ne se déduit pas du corps (DELETE). */
  method?: "GET" | "POST" | "DELETE"
): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
  });

  const data = (await response.json()) as T & {
    error?: { message?: string; code?: string; param?: string };
  };
  if (!response.ok) {
    throw new StripeApiError(
      data.error?.message || `Stripe request failed: ${path}`,
      data.error?.code ?? null,
      data.error?.param ?? null,
      response.status
    );
  }
  return data as T;
}

export async function createStripeCustomer(params: {
  email?: string | null;
  userId: string;
}): Promise<StripeCustomer> {
  const body = new URLSearchParams();
  if (params.email) body.set("email", params.email);
  body.set("metadata[user_id]", params.userId);
  return stripeRequest<StripeCustomer>("/v1/customers", body);
}

/*
 * Il y avait ici un `findStripeCustomerByEmail`, dont le checkout se servait pour
 * « retrouver » le client d'un compte sans référence enregistrée. Retiré par
 * MIN-344, et pas seulement de son appelant : une adresse n'identifie personne
 * chez Stripe, et rattacher un compte minddy au premier client qui porte la même
 * lui ouvrait l'abonnement, les factures et le portail d'un autre. Le seul lien
 * qui fasse foi est `billing_accounts.stripe_customer_id`, écrit par nous.
 */

export async function createStripeCheckoutSession(params: {
  customerId: string;
  planId: BillingPlanId;
  interval?: BillingInterval;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  const priceId = getStripePriceIdForPlan(params.planId, params.interval ?? "month");
  if (!priceId) {
    throw new Error(`Missing Stripe price for plan ${params.planId}`);
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", params.customerId);
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("allow_promotion_codes", "true");
  body.set("client_reference_id", params.userId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  // metadata.user_id sur la session ET l'abonnement : c'est ce qui permet au
  // webhook de rattacher l'événement au compte minddy sans lookup fragile.
  body.set("metadata[user_id]", params.userId);
  body.set("metadata[plan_id]", params.planId);
  body.set("subscription_data[metadata][user_id]", params.userId);
  body.set("subscription_data[metadata][plan_id]", params.planId);

  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", body);
}

export async function createStripePortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);
  return stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", body);
}

export async function fetchStripeSubscription(
  subscriptionId: string
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`
  );
}

/**
 * Résiliation IMMÉDIATE d'un abonnement (MIN-119) — pas `cancel_at_period_end`.
 *
 * Appelée quand quelqu'un supprime son compte : on ne peut pas laisser courir un
 * abonnement dont le titulaire n'existe plus, ni continuer à prélever une
 * personne qui est partie. La perte du reliquat de période est assumée, c'est
 * l'utilisateur qui choisit le moment.
 *
 * Stripe conserve de son côté les pièces de facturation le temps de l'obligation
 * comptable : la résiliation arrête le prélèvement, elle n'efface pas l'histoire.
 */
export async function cancelStripeSubscription(
  subscriptionId: string
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`,
    undefined,
    "DELETE"
  );
}

/**
 * Résiliation à la FIN DE PÉRIODE, et son annulation (MIN-296).
 *
 * C'est la résiliation ordinaire, celle qu'on déclenche depuis l'app : la
 * période déjà payée est due, on ne la reprend pas — on arrête le renouvellement.
 * Son inverse (`resume: true`) remet l'abonnement en marche tant que la date
 * n'est pas passée, et c'est la moitié qui rend le geste sans danger : une
 * résiliation qu'on ne peut pas défaire ailleurs que chez Stripe n'est pas un
 * geste réversible.
 *
 * À ne pas confondre avec `cancelStripeSubscription`, qui coupe SUR-LE-CHAMP —
 * celle-là n'est appelée qu'à la suppression du compte, où il n'y a plus
 * personne à qui laisser la fin de sa période.
 */
export async function setStripeCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean
): Promise<StripeSubscription> {
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", cancel ? "true" : "false");
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`,
    body
  );
}

/** Au-delà, on arrête de paginer. Cf. le commentaire de la fonction. */
const BALANCE_TX_MAX_PAGES = 10;
const BALANCE_TX_PAGE_SIZE = 100;

/**
 * Le ledger depuis une date (MIN-92). Chaque ligne porte son `net` et son jour :
 * c'est tout ce dont la page Finances a besoin, puisqu'un encaissement est
 * affiché entier au jour où il tombe. (Pas d'`expand[]=data.source` : il ne
 * servait qu'à retrouver le client pour étaler la somme sur sa période.)
 *
 * Pagination bornée à 1 000 lignes. Ce n'est pas une limite gênante aujourd'hui
 * (le compte en a deux) mais c'est un garde-fou explicite : le jour où le
 * volume la touche, c'est précisément le signal qu'il faut une table miroir
 * plutôt que de rejouer tout l'historique à chaque chargement de page.
 */
export async function listStripeBalanceTransactions(params: {
  since: Date;
}): Promise<{ transactions: StripeBalanceTransaction[]; truncated: boolean }> {
  const transactions: StripeBalanceTransaction[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < BALANCE_TX_MAX_PAGES; page++) {
    const query = new URLSearchParams();
    query.set("limit", String(BALANCE_TX_PAGE_SIZE));
    query.set("created[gte]", String(Math.floor(params.since.getTime() / 1000)));
    if (startingAfter) query.set("starting_after", startingAfter);

    const result: StripeList<StripeBalanceTransaction> & { has_more?: boolean } =
      await stripeRequest<StripeList<StripeBalanceTransaction> & { has_more?: boolean }>(
        `/v1/balance_transactions?${query.toString()}`
      );

    transactions.push(...result.data);
    if (!result.has_more || result.data.length === 0) {
      return { transactions, truncated: false };
    }
    startingAfter = result.data[result.data.length - 1].id;
  }

  return { transactions, truncated: true };
}

export function stripeUnixToIso(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

/**
 * Période de facturation courante d'un abonnement. Depuis l'API 2025-03-31
 * (billing « flexible »), `current_period_*` est porté par l'item, plus par la
 * racine — on lit l'item d'abord, la racine en repli pour les vieux comptes.
 */
export function getStripeSubscriptionPeriod(subscription: StripeSubscription): {
  start: number | null;
  end: number | null;
} {
  const item = subscription.items.data[0];
  return {
    start: item?.current_period_start ?? subscription.current_period_start ?? null,
    end: item?.current_period_end ?? subscription.current_period_end ?? null,
  };
}

function parseStripeSignature(header: string): {
  timestamp: string | null;
  signatures: string[];
} {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? null;
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  return { timestamp, signatures };
}

/** Vérifie la signature `Stripe-Signature` (HMAC-SHA256, tolérance 300 s). */
export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): StripeEvent {
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe-Signature header");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const isValid = signatures.some((signature) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  });
  if (!isValid) throw new Error("Invalid Stripe webhook signature");

  return JSON.parse(payload) as StripeEvent;
}
