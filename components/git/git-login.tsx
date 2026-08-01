"use client";

import { useTranslations } from "next-intl";
import { Badge, cn } from "mangue-ui";
import { parseForgeLogin } from "@/lib/repo-providers";

/**
 * Un login de forge, rendu comme GitHub le rend : le nom, et — si le compte est
 * une App — une petite pastille « bot » au lieu du `[bot]` en toutes lettres.
 * Le suffixe dit un TYPE de compte, pas un nom ; l'écrire brut le fait lire
 * comme une faute de recopie, et allonge une ligne déjà serrée.
 *
 * Le login BRUT reste porté par `title` : c'est lui qu'on cherche pour retrouver
 * le compte chez la forge, et la pastille ne doit pas le rendre introuvable.
 *
 * Un seul endroit pour cette règle, parce qu'un login de forge s'affiche dans
 * cinq vues (fil de la PR, commentaires de ligne, liste des PR, son filtre
 * d'auteur, historique du ticket) et qu'elles n'ont pas à s'accorder à la main.
 */
export function GitLogin({
  login,
  className,
}: {
  /** Absent = auteur inconnu (la forge ne le donne pas toujours) : « — ». */
  login: string | null | undefined;
  /** Styles du NOM (taille, graisse) — la pastille garde les siens. */
  className?: string;
}) {
  const parsed = login ? parseForgeLogin(login) : null;

  // Un seul gabarit pour les deux cas : ces logins vivent tous dans une ligne
  // serrée, et c'est le nom — jamais la pastille — qui doit céder la place.
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={login ?? undefined}>
      <span className={cn("min-w-0 truncate", className)}>{parsed?.name ?? "—"}</span>
      {parsed?.isBot ? <BotBadge /> : null}
    </span>
  );
}

/**
 * La pastille seule, pour les endroits où le login est enchâssé dans une phrase
 * traduite (« Ouverte par {login} ») et ne peut pas passer par `GitLogin`.
 */
export function BotBadge({ className }: { className?: string }) {
  const t = useTranslations("Common");
  return (
    <Badge
      variant="secondary"
      // Teinte plus claire que le `secondary` plein : la pastille marque un type
      // de compte, elle ne doit pas peser autant que le nom qu'elle suit.
      className={cn(
        "h-5 shrink-0 border-border/60 bg-muted/40 px-2 text-[11px] font-medium tracking-wide",
        className,
      )}
    >
      {t("botAccount")}
    </Badge>
  );
}
