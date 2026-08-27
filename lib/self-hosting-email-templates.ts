import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SELF_HOSTING_EMAIL_TEMPLATE_NAMES = ["confirm-signup", "reset-password"] as const;

export type SelfHostingEmailTemplateName = (typeof SELF_HOSTING_EMAIL_TEMPLATE_NAMES)[number];

export const SELF_HOSTING_EMAIL_SUBJECTS = {
  "confirm-signup": '{{ $locale := printf "%v" (index .Data "locale") }}{{ if eq $locale "fr" }}Confirmez votre adresse e-mail{{ else if eq $locale "de" }}Bestätige deine E-Mail-Adresse{{ else if eq $locale "pt-BR" }}Confirme seu endereço de e-mail{{ else if eq $locale "it" }}Conferma il tuo indirizzo email{{ else if eq $locale "es" }}Confirma tu dirección de correo{{ else }}Confirm your email{{ end }}',
  "reset-password": '{{ $locale := printf "%v" (index .Data "locale") }}{{ if eq $locale "fr" }}Réinitialisez votre mot de passe{{ else if eq $locale "de" }}Setze dein Passwort zurück{{ else if eq $locale "pt-BR" }}Redefina sua senha{{ else if eq $locale "it" }}Reimposta la password{{ else if eq $locale "es" }}Restablece tu contraseña{{ else }}Reset your password{{ end }}',
} satisfies Record<SelfHostingEmailTemplateName, string>;

export function isSelfHostingEmailTemplateName(value: string): value is SelfHostingEmailTemplateName {
  return SELF_HOSTING_EMAIL_TEMPLATE_NAMES.includes(value as SelfHostingEmailTemplateName);
}

export function readSelfHostingEmailTemplate(name: SelfHostingEmailTemplateName) {
  return readFile(join(process.cwd(), "supabase", "email-templates", `${name}.html`), "utf8");
}
