"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { Lock } from "lucide-react";
import { IsoIcon } from "@/components/illustrations/iso-icon";

/** Clé du namespace PublicShare rendue sous le champ. */
export type ShareUnlockState = {
  error: "wrongPassword" | "tooManyAttempts";
} | null;

/**
 * La porte d'un partage protégé par mot de passe — une seule, pour la vue
 * partagée (MIN-26) comme pour la page publiée (MIN-283).
 *
 * Le formulaire ne sait RIEN de ce qu'il protège : c'est la moitié du sujet.
 * Un partage verrouillé ne doit révéler ni le nom de la vue, ni le titre de la
 * page, ni celui du projet — seulement qu'il est verrouillé, ce que le visiteur
 * voit déjà. L'action, elle, vient de la route : chacune connaît son chemin de
 * retour et le path de son cookie.
 *
 * Le cadenas est une SCÈNE isométrique, comme les états vides de l'application
 * (components/illustrations/iso-icon.tsx) : cet écran est souvent la première
 * chose qu'un client voit de minddy, et une pastille grise avec une icône de
 * 16 px y ressemble à une erreur. Le dessin est le même langage que le reste du
 * produit, sans un trait de SVG à écrire.
 */
export function SharePasswordForm({
  action,
  title,
}: {
  action: (prev: ShareUnlockState, formData: FormData) => Promise<ShareUnlockState>;
  /** Le libellé au-dessus du champ. Par défaut, celui de la vue partagée. */
  title?: string;
}) {
  const t = useTranslations("PublicShare");
  const [state, formAction, pending] = useActionState<ShareUnlockState, FormData>(
    action,
    null
  );

  return (
    <form
      action={formAction}
      className="flex w-full max-w-xs flex-col items-center gap-4"
    >
      <IsoIcon icon={Lock} className="w-28" />
      <p className="text-center text-sm font-medium">
        {title ?? t("protectedTitle")}
      </p>
      <Input
        type="password"
        name="password"
        placeholder={t("passwordPlaceholder")}
        autoComplete="current-password"
        autoFocus
        required
      />
      {state?.error && <p className="text-sm text-destructive">{t(state.error)}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t("unlock")}
      </Button>
    </form>
  );
}
