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
 * Le sélecteur de langue du pied de page public.
 *
 * Sorti du pied de page pour être chargé PARESSEUSEMENT (MIN-100). Un `Select`
 * Radix tire le positionneur flottant (`react-popper` + `floating-ui`) : mesuré
 * sur la landing, **46 Ko gzippés dans le bundle initial** — le deuxième poste
 * après le framework — pour une liste de deux langues, dans le pied de page,
 * qui ne s'ouvre qu'au clic. Voir `marketing-footer.tsx` pour le montage.
 */
export function LanguageSwitcher() {
  const tLang = useTranslations("Language");
  const locale = useLocale() as Locale;
  const [selected, setSelected] = useState<Locale>(locale);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // Changer de langue CHANGE D'URL sur le site public (MIN-88) : `/pricing`
  // devient `/fr/tarifs`. Le cookie seul ne suffisait pas — il rafraîchissait la
  // page en français en laissant l'URL annoncer l'anglais, ce que le canonical
  // et le hreflang contredisaient aussitôt. Sur l'app interne (aucune URL
  // localisée), `switchLocaleHref` renvoie `null` et on se contente du cookie.
  const handleLocaleChange = async (value: string) => {
    const next = value as Locale;
    setSelected(next);
    await setLocaleCookie(next);
    const target = switchLocaleHref(pathname, next);
    startTransition(() => (target ? router.push(target) : router.refresh()));
  };

  return (
    <Select value={selected} onValueChange={handleLocaleChange}>
      {/* `aria-label` : le déclencheur d'un Select ne rend que la valeur
          choisie (« Français »), donc un lecteur d'écran annonçait une
          liste déroulante sans savoir ce qu'elle règle — et l'audit
          `button-name` échouait sur toutes les pages publiques. */}
      <SelectTrigger
        aria-label={tLang("title")}
        className="h-8 w-auto self-start bg-transparent text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fr">Français</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
