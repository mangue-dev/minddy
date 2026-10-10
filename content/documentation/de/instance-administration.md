---
{
  "id": "instance-administration",
  "locale": "de",
  "title": "Instanzverwaltung",
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
  "revision": 4,
  "sourceRevision": 4,
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Die Administrationskonsole einer Instanz verwenden"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-overview.png",
      "alt": "Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.",
      "caption": "Übersicht zeigt zusammengefasste Kennzahlen der Instanz. Finanzen fehlt in diesem Demoprofil, weil kein verwalteter OpenRouter-Schlüssel eingerichtet ist.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-models.png",
      "alt": "KI-Modell- und Reasoning-Einstellungen der Instanz.",
      "caption": "Modelle legt Standardwerte und besondere Verwendungszwecke fest. Die Aufnahme zeigt die vorhandene Konfiguration; keine Modell- oder Anbietereinstellung wurde geändert.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Die Administrationskonsole einer Instanz verwenden {#instance-administration}

Instanzadministration ist von Projekteigentum getrennt. `ADMIN_EMAILS` im Server enthält bestätigte autorisierte Kontoadressen. Serverseitig signiertes `app_metadata.role=admin` ist eine weitere zulässige Rollenzuweisung. Sitzungen verlangen zusätzlich `aal2`, verifizierte MFA und aktuelle Liveprüfungen von Konto und Sitzung. Schlagen diese fehl, bleibt Zugriff gesperrt. Melden Sie sich an, bestätigen Sie TOTP und öffnen Sie `/admin`. Ändern Sie keine Datenbankrollen zur Umgehung der MFA-Einrichtung. Konsole und private APIs bleiben `noindex`.


![Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.](/documentation/de/instance-administration-overview.png)

![KI-Modell- und Reasoning-Einstellungen der Instanz.](/documentation/de/instance-administration-models.png)

## Vorhandene Funktionen verwenden {#panels}

Die Konsole enthält Übersicht, Benutzer, Modelle und bedingt Finanzen. Finanzen fehlt ohne konfigurierte verwaltete OpenRouter-Funktion; Planvergabe hängt von eingerichteter Abrechnung oder bestehendem Override ab. Selbsthosting ohne kommerzielle Anbieter erhält durch Öffnen der Konsole keine Cloud-Abrechnung. Prüfen Sie Modelle, Standardwerte und Nutzer-/Quotenkontrollen in der tatsächlich installierten Version vor Änderungen. Administration betrifft die Instanz, nicht ein einzelnes Projekt. Testen Sie mit Demokonten.

## Betreiberpflichten erfüllen {#responsibilities}

Sie verantworten weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfen Sie bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
