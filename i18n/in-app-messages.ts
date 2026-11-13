import type { AbstractIntlMessages } from "next-intl";

/**
 * The catalog the mobile app reads (MIN-907).
 *
 * Nothing is sold in the app (App Store guideline 3.1.1), so its messages may
 * not invite anyone to upgrade. The plan-limit errors are written on the
 * server, by many routes, from the `ApiErrors` namespace; for a request from
 * the app they read `InAppApiErrors` instead, the same messages without the
 * call to upgrade. Swapping the catalog here covers every route at once,
 * including the ones added later.
 */
export function inAppMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const overrides = messages.InAppApiErrors;
  const apiErrors = messages.ApiErrors;
  if (!isNamespace(overrides) || !isNamespace(apiErrors)) return messages;
  return { ...messages, ApiErrors: { ...apiErrors, ...overrides } };
}

function isNamespace(value: unknown): value is AbstractIntlMessages {
  return !!value && typeof value === "object";
}
