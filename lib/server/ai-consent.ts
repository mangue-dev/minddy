import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import {
  AI_CONSENT_COOKIE,
  AI_CONSENT_HEADER,
  AI_CONSENT_META_KEY,
  AI_CONSENT_REQUIRED_CODE,
  aiConsentMissing,
  parseAiConsent,
} from "@/lib/mobile/ai-consent";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * The server half of the mobile app's AI consent (MIN-907, guideline
 * 5.1.2(i); see `lib/mobile/ai-consent.ts`).
 *
 * Two layers. The routes that start AI work on request (Numo, dictation,
 * transcription, the home brief, the documentation's answers, Smart Assign's
 * backfill) refuse with `aiConsentRefusal()`, which the app answers by asking
 * again. Underneath, `fetchAiProvider`, the web search and `beginNumoTurn`
 * check `aiBlockedForAppRequest()`, so work a request from the app starts on
 * the side (Smart Fill on a new issue, semantic search, a Numo mention in a
 * comment) is skipped as if no provider were configured.
 *
 * Background work has no app to ask. The cron jobs that run AI for an account
 * (`runAsBackgroundAiWork`) read the account's last answer instead: an
 * account that declined gets no AI run on its behalf, one that allowed or was
 * never asked does (`aiDeclinedInBackground`). The places that pick the paying
 * account check it: `resolveAiRuntime`, `forcedToolCall`, the decision model,
 * `requestEmbeddings` and `beginNumoTurn`. A web request is never affected:
 * the person chose to use AI there.
 */

export class AiConsentRequiredError extends Error {
  readonly code = AI_CONSENT_REQUIRED_CODE;
  readonly status = 403;

  constructor() {
    super("AI features are not allowed in this app");
    this.name = "AiConsentRequiredError";
  }
}

/** True for a request from the mobile app whose person has not allowed AI. */
export async function aiBlockedForAppRequest(): Promise<boolean> {
  try {
    const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
    return aiConsentMissing(headerStore.get("user-agent"), cookieStore.get(AI_CONSENT_COOKIE)?.value);
  } catch {
    // No request scope: a cron job or a queue, never the app.
    return false;
  }
}

export async function assertAiConsent(): Promise<void> {
  if (await aiBlockedForAppRequest()) throw new AiConsentRequiredError();
}

/** The refusal a route returns before starting AI work, or `null`. */
export async function aiConsentRefusal(): Promise<Response | null> {
  if (!(await aiBlockedForAppRequest())) return null;
  return aiConsentRequiredResponse();
}

export async function aiConsentRequiredResponse(): Promise<Response> {
  const t = await getTranslations("AiConsent");
  return NextResponse.json(
    { error: t("refused"), code: AI_CONSENT_REQUIRED_CODE },
    { status: 403, headers: { [AI_CONSENT_HEADER]: "required" } },
  );
}

const backgroundAiWork = new AsyncLocalStorage<true>();

/** Runs a cron job's AI work under the accounts' own answers. */
export function runAsBackgroundAiWork<T>(work: () => Promise<T>): Promise<T> {
  return backgroundAiWork.run(true, work);
}

const ACCOUNT_CONSENT_TTL_MS = 5 * 60_000;
const accountConsentCache = new Map<string, { declined: boolean; at: number }>();

async function accountDeclinedAi(userId: string): Promise<boolean> {
  const cached = accountConsentCache.get(userId);
  if (cached && Date.now() - cached.at < ACCOUNT_CONSENT_TTL_MS) return cached.declined;
  const { data, error } = await getServiceClient().auth.admin.getUserById(userId);
  // An unreadable account keeps the rule for an unanswered one: AI runs.
  if (error) return false;
  const declined = parseAiConsent(String(data.user?.user_metadata?.[AI_CONSENT_META_KEY] ?? "")) === "declined";
  accountConsentCache.set(userId, { declined, at: Date.now() });
  return declined;
}

/** True when a cron job would run AI for an account that declined it in the app. */
export async function aiDeclinedInBackground(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !backgroundAiWork.getStore()) return false;
  return accountDeclinedAi(userId).catch(() => false);
}

export async function assertAiAllowedInBackground(userId: string | null | undefined): Promise<void> {
  if (await aiDeclinedInBackground(userId)) throw new AiConsentRequiredError();
}

/** Tests only: forget the accounts' answers read so far. */
export function resetAccountAiConsentCache(): void {
  accountConsentCache.clear();
}
