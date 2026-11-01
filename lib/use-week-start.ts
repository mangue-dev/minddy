"use client";

import { useLocale } from "next-intl";
import { useAuthOptional } from "@/lib/auth-context";
import { resolveWeekStart, resolveWeekStartPreference, type WeekStartDay } from "@/lib/week-start";

/**
 * The weekday the signed-in account's weeks start on (MIN-881). Outside the
 * auth provider (public pages, isolated tests) it falls back to the interface
 * language, which is also what an account that never chose gets.
 */
export function useWeekStart(): WeekStartDay {
  const locale = useLocale();
  const user = useAuthOptional()?.user ?? null;
  return resolveWeekStart(resolveWeekStartPreference(user?.user_metadata), locale);
}
