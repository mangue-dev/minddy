---
{
  "id": "instance-administration",
  "locale": "de",
  "title": "Die Administrationskonsole einer Instanz verwenden",
  "summary": "Instanzadministration ist von Projekteigentum getrennt.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
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
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-overview.png",
      "alt": "Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.",
      "caption": "Übersicht zeigt zusammengefasste Kennzahlen der Instanz. Finanzen fehlt in diesem Demoprofil, weil kein verwalteter OpenRouter-Schlüssel eingerichtet ist.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-users",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-users.png",
      "alt": "Kontosupport mit Suche nach der genauen E-Mail-Adresse ohne Verzeichnis privater Inhalte.",
      "caption": "Benutzer öffnet ein bestimmtes Konto für Support oder Abrechnung; die Startansicht listet weder private Aktivitäten noch persönliche Inhalte auf.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-models.png",
      "alt": "KI-Modell- und Reasoning-Einstellungen der Instanz.",
      "caption": "Modelle legt Standardwerte und besondere Verwendungszwecke fest. Die Aufnahme zeigt die vorhandene Konfiguration; keine Modell- oder Anbietereinstellung wurde geändert.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Die Administrationskonsole einer Instanz verwenden {#instance-administration}

Instanzadministration ist von Projekteigentum getrennt. ADMIN_EMAILS im Server enthält bestätigte autorisierte Kontoadressen. Serverseitig signiertes app_metadata.role=admin ist eine weitere zulässige Rollenzuweisung. Sitzungen verlangen zusätzlich aal2, verifizierte MFA und aktuelle Liveprüfungen von Konto und Sitzung. Schlagen diese fehl, bleibt Zugriff gesperrt. Melden Sie sich an, bestätigen Sie TOTP und öffnen Sie /admin. Ändern Sie keine Datenbankrollen zur Umgehung der MFA-Einrichtung. Konsole und private APIs bleiben noindex.


![Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.](/documentation/de/instance-administration-overview.png)

![Kontosupport mit Suche nach der genauen E-Mail-Adresse ohne Verzeichnis privater Inhalte.](/documentation/de/instance-administration-users.png)

![KI-Modell- und Reasoning-Einstellungen der Instanz.](/documentation/de/instance-administration-models.png)

## Vorhandene Funktionen verwenden {#panels}

Die Konsole enthält Übersicht, Benutzer, Modelle und bedingt Finanzen. Finanzen fehlt ohne konfigurierte verwaltete OpenRouter-Funktion; Planvergabe hängt von eingerichteter Abrechnung oder bestehendem Override ab. Selbsthosting ohne kommerzielle Anbieter erhält durch Öffnen der Konsole keine Cloud-Abrechnung. Prüfen Sie Modelle, Standardwerte und Nutzer-/Quotenkontrollen in der tatsächlich installierten Version vor Änderungen. Administration betrifft die Instanz, nicht ein einzelnes Projekt. Testen Sie mit Demokonten.

## Betreiberpflichten erfüllen {#responsibilities}

Sie verantworten weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfen Sie bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
