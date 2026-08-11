"use client";

import { SharePasswordForm } from "@/components/share-password-form";
import { unlockShare } from "./actions";

/** Password gate of a password-protected shared view (MIN-26). Le formulaire
    lui-même est partagé avec la page publiée (components/share-password-form) :
    ce qui change d'une route à l'autre est l'action, pas le champ. */
export function PasswordForm({ token }: { token: string }) {
  return <SharePasswordForm action={unlockShare.bind(null, token)} />;
}
