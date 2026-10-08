---
{
  "id": "optional-providers",
  "locale": "de",
  "title": "Optionale Anbieter bewusst einschalten",
  "summary": "Der Kern benötigt weder Stripe, PostHog, Cloud-Konto noch einen von Minddy verwalteten KI-Schlüssel.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/de/optional-providers-flow.svg",
      "alt": "Diagramm: Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "optional-providers-flow"
  ]
}
---

## Optionale Anbieter bewusst einschalten {#optional-providers}

Der Kern benötigt weder Stripe, PostHog, Cloud-Konto noch einen von Minddy verwalteten KI-Schlüssel. Externe Dienste bringen eigene Kosten, Rechte und Datenziele. Prüfen Sie Bedingungen vor Aktivierung. Diagnosen melden fehlende Werte statt eines Ersatzanbieters. Selbsthosting kann persönliche KI-Schlüssel oder erreichbare lokale KI-Endpunkte nutzen. Lassen Sie MINDDY_MANAGED_AI und MINDDY_MANAGED_BILLING aus; ein OpenRouter-Schlüssel allein wählt keine Cloud-Edition.


![Diagramm: Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.](/documentation/de/optional-providers-flow.svg)

## Vollständige Anbieterwerte setzen {#configure}

Anwendungsmail braucht EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM und INVITATION_EMAIL_FROM. console ist in Produktion unzulässig; Auth-SMTP bleibt getrennt. Web Push benötigt öffentliches/privates VAPID-Paar und VAPID_SUBJECT; bestehende Abonnements hängen von diesem Paar ab. Analytics braucht ein vollständiges PostHog-Schlüssel/Host-Paar; Fehlertracking zusätzlich MINDDY_PUBLIC_ERROR_TRACKING=1. Der Installer bietet application-email und web-push, externe Zugangsdaten liefern Sie. Nutzen Sie keine Minddy-Absenderidentitäten oder nativen Release-Zugangsdaten auf fremden Instanzen.

## Git und Codeausführung verbinden {#git-and-code}

Unterstützt werden GitHub.com und GitLab.com, nicht Enterprise Server oder selbstverwaltetes GitLab. Benutzerinitiierte Verbindungen können den verwalteten Forge-Relay nutzen; deaktivieren Sie ihn mit --no-forge-relay oder MINDDY_FORGE_RELAY=0 und konfigurieren Sie eigene Apps. Bestehende Verbindungen behalten ihren Kanal bis zur Neuverbindung. Der Referenzserver enthält einen vertrauenswürdigen selbstgehosteten Docker-Runner. Vercel Sandbox ist eine ausdrückliche Alternative mit eigenen Zugangsdaten und gültigem MINDDY_DATA_ROOT_KEY auch ohne Inhaltsverschlüsselung. Lokale Desktop-Codeausführung wurde entfernt. Fehlende Konfiguration blockiert Delegation statt Code auf dem Benutzercomputer auszuführen.

Das veröffentlichte Anwendungsimage enthält Node.js und Git, entfernt jedoch bewusst npm, npx und Corepack. Das Referenz-Compose-Profil wählt dieses Image auch für Worker über AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Für einen neuen Code-Worker reicht das nicht aus: Der OpenCode-Bootstrap verwendet npm, um seine gepinnte Laufzeit und sein Plugin zu installieren, selbst bei einem Repository ohne Projektabhängigkeiten. Ohne npm endet die Ausführung beim Bootstrap; aus der Unterhaltung lassen sich weder Projektänderungen noch bestandene Tests ableiten. Verwenden Sie ein vom Betreiber erstelltes und geprüftes eigenes Worker-Image mit Node.js 24, npm, Git und den benötigten Projektwerkzeugen, indem Sie AGENT_RUNNER_SANDBOX_IMAGE im Runner-Dienst überschreiben. Behalten Sie die Isolationsvorgaben bei. Prüfen Sie Bootstrap, Klonen, tatsächliche Tests und den entstandenen Diff vor der Code-Delegation. Die Korrektur der Runner-Dateien allein stellt diese Worker-Werkzeuge nicht bereit.
