import { ResetPasswordForm } from "@/components/auth/reset-password-form";

/**
 * La définition du nouveau mot de passe (MIN-297).
 *
 * La page n'est PAS dans `lib/protected-prefixes.ts`, et c'est délibéré : le
 * proxy y renverrait vers `/login` quiconque arrive sans session — c'est-à-dire
 * avec un lien périmé —, et la personne perdrait de vue ce qu'elle était venue
 * faire. L'écran, lui, sait dire « ce lien n'est plus actif » et propose d'en
 * demander un autre. Il n'y a rien à protéger ici : sans session, le
 * `updateUser` qu'il porte échoue de toute façon côté GoTrue.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
