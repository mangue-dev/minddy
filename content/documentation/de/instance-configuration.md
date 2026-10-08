---
{
  "id": "instance-configuration",
  "locale": "de",
  "title": "Origins, Geheimnisse und Funktionen der Instanz konfigurieren",
  "summary": "MINDDY_PUBLIC_APP_URL muss ein einzelner absoluter Origin ohne Pfad oder abschließenden Schrägstrich sein.",
  "topic": "Instanz betreiben",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Origins, Geheimnisse und Funktionen der Instanz konfigurieren {#instance-configuration}

MINDDY_PUBLIC_APP_URL muss ein einzelner absoluter Origin ohne Pfad oder abschließenden Schrägstrich sein. Öffentliche Installationen verwenden HTTPS; localhost und vertrauenswürdige private IPv4 dürfen HTTP verwenden. MINDDY_PUBLIC_SUPABASE_URL und MINDDY_PUBLIC_SUPABASE_ANON_KEY müssen denselben Supabase-Stack bezeichnen. Diese Werte erreichen den Browser. SUPABASE_SERVICE_ROLE_KEY bleibt ausschließlich serverseitig und ist in Produktion erforderlich. Er darf nie in öffentliche Variablen oder Clientbundles gelangen. Eine Datenbank-URL dient Werkzeugen und ersetzt nicht die API-Konfiguration.

## Geheimnisse erhalten {#secrets}

Der Installer ergänzt fehlende GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET und AGENT_RUNNER_SECRET. Der Inhaltswurzelschlüssel besteht aus genau 64 Hexadezimalzeichen. Bewahren Sie ihn außerhalb PostgreSQL mit geschützter Wiederherstellungskopie auf. Die gesamte Umgebung benötigt Modus 0600 und darf nicht in Git gelangen. Führen Sie sie nicht als Shell-Code aus und geben Sie sie nicht aus. Ein Installationswiederholungsversuch rotiert keine Geheimnisse. Schlüsselverlust kann vorhandene Daten unlesbar machen; absichtliche Rotation benötigt das passende Wiederherstellungsverfahren.

## Änderungen anwenden und prüfen {#capabilities}

MINDDY_PUBLIC_SITE_NAME und MINDDY_PUBLIC_CONTACT_EMAIL kennzeichnen Ihre Instanz. ADMIN_EMAILS enthält kommagetrennte Administratoradressen; privilegierter Zugriff verlangt zusätzlich MFA. OAUTH_ISSUER bleibt normalerweise leer, außer OAuth soll bewusst über einen anderen stabilen Origin angeboten werden. Lassen Sie verwaltete KI und Abrechnung beim Selbsthosting aus. Optionale Dienste benötigen ihre vollständige Konfiguration. Starten oder erstellen Sie die Anwendung nach Änderungen öffentlicher Laufzeitwerte neu; ein OCI-Neubuild ist unnötig. doctor unterscheidet unvollständige Funktionen von Kernfehlern. Testen Sie danach Kontolinks und Callbacks am vorgesehenen Origin.
