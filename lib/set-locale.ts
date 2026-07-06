"use server";

import { cookies } from "next/headers";
import { locales, type Locale } from "@/i18n/config";

/** Persist the interface language in the NEXT_LOCALE cookie (source of truth
    for server-rendered strings). Called from the language switcher. */
export async function setLocaleCookie(locale: string) {
  if (!(locales as readonly string[]).includes(locale)) return;
  const store = await cookies();
  store.set("NEXT_LOCALE", locale as Locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
