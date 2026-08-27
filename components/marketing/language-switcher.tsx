"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "mangue-ui/components/ui/select";
import { setLocaleCookie } from "@/lib/set-locale";
import { switchLocaleHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * The public footer language switcher.
 *
 * Taken out of the footer to be loaded LAZILY (MIN-100). A `Select`
 * Radix pulls the floating positioner (`react-popper` + `floating-ui`): measured
 * on the landing, **46 KB gzipped in the initial bundle** — the second post
 * after the framework — for a list of two languages, in the footer of page,
 * which only opens on click. See `marketing-footer.tsx` for mounting.
 */
export function LanguageSwitcher() {
  const tLang = useTranslations("Language");
  const locale = useLocale() as Locale;
  const [selected, setSelected] = useState<Locale>(locale);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // Change language CHANGE URL on the public site (MIN-88): `/pricing`
  // becomes `/fr/tarifs`. The cookie alone wasn't enough — it refreshed the
  // page in French leaving the URL announcing the English, what the canonical
  // and the hreflang immediately contradicted. On the internal app (no URL
  // localized), `switchLocaleHref` returns `null` and we just have the cookie.
  const handleLocaleChange = async (value: string) => {
    const next = value as Locale;
    setSelected(next);
    await setLocaleCookie(next);
    const target = switchLocaleHref(pathname, next);
    startTransition(() => (target ? router.push(target) : router.refresh()));
  };

  return (
    <Select value={selected} onValueChange={handleLocaleChange}>
      {/* `aria-label`: the Select trigger only returns the chosen
 value ("French"), so a screen reader announced a
 drop-down list without knowing what it sets — and the
 `button-name` audit failed on all public pages. */}
      <SelectTrigger
        aria-label={tLang("title")}
        className="h-8 w-auto self-start bg-transparent text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fr">Français</SelectItem>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="de">Deutsch</SelectItem>
        <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
        <SelectItem value="it">Italiano</SelectItem>
        <SelectItem value="es">Español</SelectItem>
      </SelectContent>
    </Select>
  );
}
