import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two authentication emails only speak ONE language per sending.
 *
 * They live outside of any code: they are Go templates rendered by GoTrue,
 * whose versioned copy is `supabase/email-templates/`. Nothing in the
 * repository executes them — so nothing would say that a sentence has moved out of its
 * branch, or that a branch has lost its `{{ end }}`. Hence this test: it renders
 * both languages ​​with a lowercase evaluator (the only pattern these files
 * use) and checks what comes out.
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

/** `{{ if $fr }}A{{ else }}B{{ end }}` → A or B. No nested branch here. */
function render(template: string, fr: boolean): string {
  return template.replace(
    /\{\{ if \$fr \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g,
    (_match, frBranch: string, enBranch: string) => (fr ? frBranch : enBranch)
  );
}

describe.each(TEMPLATES)("%s", (name) => {
  const template = read(name);
  // The header comment carries the subject, also connected, and examples
  // code — it doesn't have to pass language assertions.
  const body = template.slice(template.indexOf("-->") + 3);

  it("branche sur la langue du compte, sans planter sur un compte sans langue", () => {
    // `printf "%v"` is not cosmetic: `eq nil "fr"` causes rendering to FAIL
    // a Go template, therefore the entire email, for any account whose
    // metadata does not have this field yet.
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

  // The link is the only thing the email has to do: it must survive
  // the language switch, identical in both renderings.
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
