---
{
  "id": "authentication-and-email",
  "locale": "de",
  "title": "Authentifizierung und E-Mail",
  "summary": "Auth-E-Mails gehören zu Supabase/GoTrue.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Kontomails, MFA und Wiederherstellung konfigurieren"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/de/authentication-and-email-flow.svg",
      "alt": "Diagramm: Auth-Origin und Weiterleitungen. Eigenes SMTP und versionierte Vorlagen. Bestätigung und Passwortanmeldung. TOTP, Wiederherstellung, alte Passwortprüfung.",
      "caption": "Lies die Schritte in dieser Reihenfolge. Auth-Origin und Weiterleitungen. Eigenes SMTP und versionierte Vorlagen. Bestätigung und Passwortanmeldung. TOTP, Wiederherstellung, alte Passwortprüfung.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Auth-Origin und Weiterleitungen"
          },
          {
            "title": "Eigenes SMTP und versionierte Vorlagen"
          },
          {
            "title": "Bestätigung und Passwortanmeldung"
          },
          {
            "title": "TOTP, Wiederherstellung, alte Passwortprüfung"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Kontomails, MFA und Wiederherstellung konfigurieren {#authentication-and-email}

Auth-E-Mails gehören zu Supabase/GoTrue. Resend-Anwendungsbenachrichtigungen konfigurieren weder Bestätigung noch Passwortwiederherstellung. Behalte bei full das minddy-Overlay in jedem Compose-Aufruf. Setze `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` und `ADDITIONAL_REDIRECT_URLS` auf deine Origins. Konfiguriere `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` und `SMTP_SENDER_NAME` mit deinem Anbieter. Das Overlay setzt auch die Sitzungsgrenzen: `GOTRUE_SESSIONS_TIMEBOX` ist `8760h` (ein Jahr) und `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` ist `720h` (30 Tage). Lass Bestätigung eingeschaltet und starte Auth im installierten Compose-Kontext neu.


Definiere vor den folgenden `compose`-Befehlen die Funktion für das installierte full-Profil aus [dem Referenzkontext für Compose](/de/dokumentation/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Diagramm: Auth-Origin und Weiterleitungen. Eigenes SMTP und versionierte Vorlagen. Bestätigung und Passwortanmeldung. TOTP, Wiederherstellung, alte Passwortprüfung.](/documentation/de/authentication-and-email-flow.svg)

## Managed Supabase konfigurieren {#managed}

Setze in Authentication deines eigenen Projekts Site URL und genau `<app-origin>/auth/callback` als Weiterleitung. Konfiguriere eigenes SMTP und beide versionierten Bestätigungs-/Wiederherstellungsvorlagen. Bestätigung verwendet `token_hash` und `type=signup`. Verlange mindestens acht Zeichen mit Kleinbuchstaben, Großbuchstaben und Ziffern und aktiviere TOTP-Einrichtung und -Prüfung. Aktiviere kompromittierte Passwortprüfung, soweit unterstützt, und dokumentiere Anbietergrenzen. Das full-Overlay verweigert bei Prüfungsfehlern den Zugriff und benötigt ausgehenden Zugang zu `api.pwnedpasswords.com`. Setze die maximale Sitzungsdauer auf 8760 Stunden (ein Jahr) und das Inaktivitäts-Timeout auf 720 Stunden (30 Tage). Die Datenbank weist Sitzungen jenseits genau dieser Grenzen ab; eine deaktivierte oder längere Auth-Grenze erneuert daher weiter Sitzungen, die anschließend jede API ablehnt. Erfasse Sitzungsdauer, Refresh-Token-Rotation, Widerruf und Auth-Ratenlimits; SQL-Bootstrap setzt diese Plattformwerte nicht.

## Ergebnis überprüfen {#verify}

Verwende eine kontrollierte Wegwerfadresse. Prüfe Zustellung, Öffnung auf dieser Instanz und erforderliche Bestätigungsgeste. Richte TOTP in der Kontosicherheit ein und verwahre Wiederherstellungscodes außerhalb des Browsers. Melde dich ab und mit Passwort plus TOTP erneut an. Fordere Passwortwiederherstellung an und prüfe, dass das alte Passwort danach scheitert. Prüfe Administratorzugriff für `ADMIN_EMAILS` erst nach MFA. Erfasse Versionen, Datum und bereinigte Ergebnisse. Containerzustand belegt weder Zustellung noch Kontosicherheit. Keine E-Mail-Tokens, Passwörter, Sitzungen, TOTP-Geheimnisse oder Wiederherstellungscodes gehören ins Protokoll.
