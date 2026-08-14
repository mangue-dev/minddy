import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Les deux e-mails d'authentification ne parlent QU'UNE langue par envoi.
 *
 * Ils vivent hors de tout code : ce sont des templates Go rendus par GoTrue,
 * dont la copie versionnée est `supabase/email-templates/`. Rien dans le dépôt
 * ne les exécute — donc rien ne dirait qu'une phrase est repassée hors de sa
 * branche, ou qu'une branche a perdu son `{{ end }}`. D'où ce test : il rend
 * les deux langues avec un évaluateur minuscule (le seul motif que ces fichiers
 * utilisent) et vérifie ce qui sort.
 */

const TEMPLATES = ["confirm-signup.html", "reset-password.html"] as const;

const FRENCH_MARKERS = [
  "Confirmez",
  "Confirmer",
  "Réinitialisez",
  "Choisir un nouveau",
  "Le bouton ne fonctionne pas",
  "Ignorez cet",
];
const ENGLISH_MARKERS = [
  "Confirm your email",
  "Confirm my email",
  "Reset your password",
  "Choose a new password",
  "Button not working",
  "Ignore this email",
  "ignore this email",
];

function read(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "supabase", "email-templates", name),
    "utf8"
  );
}

/** `{{ if $fr }}A{{ else }}B{{ end }}` → A ou B. Pas de branche imbriquée ici. */
function render(template: string, fr: boolean): string {
  return template.replace(
    /\{\{ if \$fr \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g,
    (_match, frBranch: string, enBranch: string) => (fr ? frBranch : enBranch)
  );
}

describe.each(TEMPLATES)("%s", (name) => {
  const template = read(name);
  // Le commentaire d'en-tête porte le sujet, lui aussi branché, et des exemples
  // de code — il n'a pas à passer les assertions de langue.
  const body = template.slice(template.indexOf("-->") + 3);

  it("branche sur la langue du compte, sans planter sur un compte sans langue", () => {
    // `printf "%v"` n'est pas cosmétique : `eq nil "fr"` fait ÉCHOUER le rendu
    // d'un template Go, donc l'e-mail entier, pour tout compte dont les
    // métadonnées n'ont pas encore ce champ.
    expect(template).toContain(
      '{{ $fr := eq (printf "%v" (index .Data "locale")) "fr" }}'
    );
    expect(body).not.toContain(".Data.locale");
  });

  it("ferme chaque branche", () => {
    const count = (needle: string) => body.split(needle).length - 1;
    expect(count("{{ if $fr }}")).toBeGreaterThan(0);
    expect(count("{{ else }}")).toBe(count("{{ if $fr }}"));
    expect(count("{{ end }}")).toBe(count("{{ if $fr }}"));
  });

  it("ne rend que du français en français", () => {
    const rendered = render(body, true);
    expect(rendered).not.toContain("{{ if $fr }}");
    expect(rendered).toContain('lang="fr"');
    for (const marker of ENGLISH_MARKERS) {
      expect(rendered).not.toContain(marker);
    }
    expect(FRENCH_MARKERS.some((m) => rendered.includes(m))).toBe(true);
  });

  it("ne rend que de l'anglais en anglais", () => {
    const rendered = render(body, false);
    expect(rendered).not.toContain("{{ if $fr }}");
    expect(rendered).toContain('lang="en"');
    for (const marker of FRENCH_MARKERS) {
      expect(rendered).not.toContain(marker);
    }
    expect(ENGLISH_MARKERS.some((m) => rendered.includes(m))).toBe(true);
  });

  // Le lien est la seule chose que l'e-mail ait à faire : il doit survivre à
  // la bascule de langue, à l'identique dans les deux rendus.
  it("garde le lien à jeton dans les deux langues", () => {
    for (const fr of [true, false]) {
      const rendered = render(body, fr);
      expect(rendered).toContain("token_hash={{ .TokenHash }}");
      expect(rendered).toContain(
        name === "reset-password.html"
          ? "type=recovery&next=/reset-password"
          : "type=signup&next=/auth/confirmed"
      );
      expect(rendered).not.toContain("{{ .ConfirmationURL }}");
    }
  });
});
