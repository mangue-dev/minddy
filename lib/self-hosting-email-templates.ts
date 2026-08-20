import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SELF_HOSTING_EMAIL_TEMPLATE_NAMES = ["confirm-signup", "reset-password"] as const;

export type SelfHostingEmailTemplateName = (typeof SELF_HOSTING_EMAIL_TEMPLATE_NAMES)[number];

export const SELF_HOSTING_EMAIL_SUBJECTS = {
  "confirm-signup": '{{ if eq (printf "%v" (index .Data "locale")) "fr" }}Confirmez votre adresse e-mail{{ else }}Confirm your email{{ end }}',
  "reset-password": '{{ if eq (printf "%v" (index .Data "locale")) "fr" }}Réinitialisez votre mot de passe{{ else }}Reset your password{{ end }}',
} satisfies Record<SelfHostingEmailTemplateName, string>;

export function isSelfHostingEmailTemplateName(value: string): value is SelfHostingEmailTemplateName {
  return SELF_HOSTING_EMAIL_TEMPLATE_NAMES.includes(value as SelfHostingEmailTemplateName);
}

export function readSelfHostingEmailTemplate(name: SelfHostingEmailTemplateName) {
  return readFile(join(process.cwd(), "supabase", "email-templates", `${name}.html`), "utf8");
}
