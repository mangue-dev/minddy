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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Auth-Origin und Weiterleitungen. Eigenes SMTP und versionierte Vorlagen. Bestätigung und Passwortanmeldung. TOTP, Wiederherstellung, alte Passwortprüfung.",
      "revision": 2,
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

Auth-E-Mails gehören zu Supabase/GoTrue. Resend-Anwendungsbenachrichtigungen konfigurieren weder Bestätigung noch Passwortwiederherstellung. Behalten Sie bei full das minddy-Overlay in jedem Compose-Aufruf. Setzen Sie SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL und ADDITIONAL_REDIRECT_URLS auf Ihre Origins. Konfigurieren Sie SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS und SMTP_SENDER_NAME mit Ihrem Anbieter. Lassen Sie Bestätigung eingeschaltet und starten Sie Auth im installierten Compose-Kontext neu.


Definieren Sie vor den folgenden compose-Befehlen die Funktion für das installierte full-Profil aus [dem Referenzkontext für Compose](/de/dokumentation/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Diagramm: Auth-Origin und Weiterleitungen. Eigenes SMTP und versionierte Vorlagen. Bestätigung und Passwortanmeldung. TOTP, Wiederherstellung, alte Passwortprüfung.](/documentation/de/authentication-and-email-flow.svg)

## Managed Supabase konfigurieren {#managed}

Setzen Sie in Authentication Ihres eigenen Projekts Site URL und genau `<app-origin>/auth/callback` als Weiterleitung. Konfigurieren Sie eigenes SMTP und beide versionierten Bestätigungs-/Wiederherstellungsvorlagen. Bestätigung verwendet token_hash und type=signup. Verlangen Sie mindestens acht Zeichen mit Kleinbuchstaben, Großbuchstaben und Ziffern und aktivieren Sie TOTP-Einrichtung und -Prüfung. Aktivieren Sie kompromittierte Passwortprüfung, soweit unterstützt, und dokumentieren Sie Anbietergrenzen. Das full-Overlay verweigert bei Prüfungsfehlern den Zugriff und benötigt ausgehenden Zugang zu api.pwnedpasswords.com. Erfassen Sie Sitzungsdauer, Refresh-Token-Rotation, Widerruf und Auth-Ratenlimits; SQL-Bootstrap setzt diese Plattformwerte nicht.

## Ergebnis überprüfen {#verify}

Verwenden Sie eine kontrollierte Wegwerfadresse. Prüfen Sie Zustellung, Öffnung auf dieser Instanz und erforderliche Bestätigungsgeste. Richten Sie TOTP in der Kontosicherheit ein und verwahren Sie Wiederherstellungscodes außerhalb des Browsers. Melden Sie sich ab und mit Passwort plus TOTP erneut an. Fordern Sie Passwortwiederherstellung an und prüfen Sie, dass das alte Passwort danach scheitert. Prüfen Sie Administratorzugriff für ADMIN_EMAILS erst nach MFA. Erfassen Sie Versionen, Datum und bereinigte Ergebnisse. Containerzustand belegt weder Zustellung noch Kontosicherheit. Keine E-Mail-Tokens, Passwörter, Sitzungen, TOTP-Geheimnisse oder Wiederherstellungscodes gehören ins Protokoll.
