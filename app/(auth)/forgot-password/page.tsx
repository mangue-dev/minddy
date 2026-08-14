import { Suspense } from "react";
import { Spinner } from "mangue-ui";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

/**
 * « Mot de passe oublié » (MIN-297). Page publique — on y arrive précisément
 * parce qu'on ne peut pas se connecter. Le `Suspense` est celui de ses
 * voisines : le formulaire lit `useSearchParams` (l'adresse déjà tapée sur
 * l'écran de connexion), ce qui exige une frontière de rendu.
 */
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
