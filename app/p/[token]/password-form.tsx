"use client";

import { useTranslations } from "next-intl";
import { SharePasswordForm } from "@/components/share-password-form";
import { unlockPageShare } from "./actions";

/** La porte d'une page publiée protégée par mot de passe (MIN-283). Le
    formulaire est celui de la vue partagée ; seul le libellé change, parce
    qu'il s'agit d'un document et pas d'un tableau. */
export function PagePasswordForm({ token }: { token: string }) {
  const t = useTranslations("PublicPage");
  return (
    <SharePasswordForm
      action={unlockPageShare.bind(null, token)}
      title={t("protectedTitle")}
    />
  );
}
