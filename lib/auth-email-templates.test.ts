import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales, type Locale } from "@/i18n/config";
import { SELF_HOSTING_EMAIL_SUBJECTS } from "@/lib/self-hosting-email-templates";

/**
 * GoTrue renders these templates outside the application, so this test executes
 * the restricted locale branch shape used by both versioned HTML files.
 */

const TEMPLATES = ["confirm-signup.html", "reset-password.html"] as const;

const MARKERS: Record<(typeof TEMPLATES)[number], Record<Locale, string>> = {
  "confirm-signup.html": {
    en: "Confirm my email",
    fr: "Confirmer mon e-mail",
    de: "E-Mail-Adresse bestätigen",
    "pt-BR": "Confirmar meu e-mail",
    it: "Conferma la mia email",
    es: "Confirmar mi correo",
  },
  "reset-password.html": {
    en: "Choose a new password",
    fr: "Choisir un nouveau mot de passe",
    de: "Neues Passwort festlegen",
    "pt-BR": "Escolher uma nova senha",
    it: "Scegli una nuova password",
    es: "Elegir una nueva contraseña",
  },
};

const LOCALE_BRANCH =
  /\{\{ if eq \$locale "fr" \}\}([\s\S]*?)\{\{ else if eq \$locale "de" \}\}([\s\S]*?)\{\{ else if eq \$locale "pt-BR" \}\}([\s\S]*?)\{\{ else if eq \$locale "it" \}\}([\s\S]*?)\{\{ else if eq \$locale "es" \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g;

const BRANCH_INDEX: Record<Locale, number> = {
  fr: 1,
  de: 2,
  "pt-BR": 3,
  it: 4,
  es: 5,
  en: 6,
};

function read(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "supabase", "email-templates", name),
    "utf8",
  );
}

function render(template: string, locale: Locale): string {
  return template.replace(
    LOCALE_BRANCH,
    (_match, ...groups: string[]) => groups[BRANCH_INDEX[locale] - 1],
  );
}

describe.each(TEMPLATES)("%s", (name) => {
  const template = read(name);
  const body = template.slice(template.indexOf("-->") + 3);

  it("reads a missing metadata locale safely", () => {
    expect(template).toContain(
      '{{ $locale := printf "%v" (index .Data "locale") }}',
    );
    expect(body).not.toContain(".Data.locale");
  });

  it("contains the same complete branch contract at every copy site", () => {
    const branchCount = body.split('{{ if eq $locale "fr" }}').length - 1;
    expect(branchCount).toBeGreaterThan(0);
    for (const locale of ["de", "pt-BR", "it", "es"] as const) {
      expect(body.split(`{{ else if eq $locale "${locale}" }}`).length - 1).toBe(
        branchCount,
      );
    }
    expect(body.split("{{ else }}").length - 1).toBe(branchCount);
    expect(body.split("{{ end }}").length - 1).toBe(branchCount);
  });

  it.each(locales)("renders only the %s copy", (locale) => {
    const rendered = render(body, locale);
    expect(rendered).not.toContain("{{ if eq $locale");
    expect(rendered).toContain(`lang="${locale}"`);
    expect(rendered).toContain(MARKERS[name][locale]);
    for (const other of locales.filter((candidate) => candidate !== locale)) {
      expect(rendered).not.toContain(MARKERS[name][other]);
    }
  });

  it("keeps the token link in every locale", () => {
    for (const locale of locales) {
      const rendered = render(body, locale);
      expect(rendered).toContain("token_hash={{ .TokenHash }}");
      expect(rendered).toContain(
        name === "reset-password.html"
          ? "type=recovery&next=/reset-password"
          : "type=signup&next=/auth/confirmed",
      );
      expect(rendered).not.toContain("{{ .ConfirmationURL }}");
    }
  });
});

describe("self-hosting email subjects", () => {
  it("contains a branch for every non-default locale", () => {
    for (const subject of Object.values(SELF_HOSTING_EMAIL_SUBJECTS)) {
      for (const locale of locales.filter((candidate) => candidate !== "en")) {
        expect(subject).toContain(`$locale "${locale}"`);
      }
    }

    const localConfig = readFileSync(
      path.join(__dirname, "..", "supabase", "config.toml"),
      "utf8",
    );
    for (const locale of locales.filter((candidate) => candidate !== "en")) {
      expect(localConfig.split(`$locale "${locale}"`).length - 1).toBe(2);
    }
  });
});
