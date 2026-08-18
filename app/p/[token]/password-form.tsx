"use client";

import { useTranslations } from "next-intl";
import { SharePasswordForm } from "@/components/share-password-form";
import { unlockPageShare } from "./actions";

/** The door to a password-protected published page (MIN-283). THE
 form is that of the shared view; only the wording changes, because it is a document and not a table. */
export function PagePasswordForm({ token }: { token: string }) {
  const t = useTranslations("PublicPage");
  return (
    <SharePasswordForm
      action={unlockPageShare.bind(null, token)}
      title={t("protectedTitle")}
    />
  );
}
