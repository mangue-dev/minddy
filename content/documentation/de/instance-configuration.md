---
{
  "id": "instance-configuration",
  "locale": "de",
  "title": "Instanzkonfiguration",
  "summary": "Konfigurieren Sie Origins, Geheimnisse und optionale Anbieter, stellen Sie die vorgesehenen Netzwerkendpunkte bereit und halten Sie geplante Jobs in Betrieb.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Origins, Geheimnisse und Funktionen der Instanz konfigurieren",
    "Optionale Anbieter bewusst einschalten",
    "Öffentliche Origins und geplante Aufgaben betreiben"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/de/optional-providers-flow.svg",
      "alt": "Diagramm: Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/de/proxy-network-and-jobs-flow.svg",
      "alt": "Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.",
      "revision": 2,
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
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

Die Instanzkonfiguration verbindet öffentliche Origins, geschützte Geheimnisse und optionale Anbieter mit Netzwerk und geplanten Jobs. Die folgenden Abschnitte erklären die Voraussetzungen und Prüfungen für diese Einstellungen sowie den Wartungsstopp der Jobs.

## Origins, Geheimnisse und Funktionen der Instanz konfigurieren {#instance-configuration}

MINDDY_PUBLIC_APP_URL muss ein einzelner absoluter Origin ohne Pfad oder abschließenden Schrägstrich sein. Öffentliche Installationen verwenden HTTPS; localhost und vertrauenswürdige private IPv4 dürfen HTTP verwenden. MINDDY_PUBLIC_SUPABASE_URL und MINDDY_PUBLIC_SUPABASE_ANON_KEY müssen denselben Supabase-Stack bezeichnen. Diese Werte erreichen den Browser. SUPABASE_SERVICE_ROLE_KEY bleibt ausschließlich serverseitig und ist in Produktion erforderlich. Er darf nie in öffentliche Variablen oder Clientbundles gelangen. Eine Datenbank-URL dient Werkzeugen und ersetzt nicht die API-Konfiguration.

### Geheimnisse erhalten {#secrets}

Der Installer ergänzt fehlende GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET und AGENT_RUNNER_SECRET. Der Inhaltswurzelschlüssel besteht aus genau 64 Hexadezimalzeichen. Bewahren Sie ihn außerhalb PostgreSQL mit geschützter Wiederherstellungskopie auf. Die gesamte Umgebung benötigt Modus 0600 und darf nicht in Git gelangen. Führen Sie sie nicht als Shell-Code aus und geben Sie sie nicht aus. Ein Installationswiederholungsversuch rotiert keine Geheimnisse. Schlüsselverlust kann vorhandene Daten unlesbar machen; absichtliche Rotation benötigt das passende Wiederherstellungsverfahren.

### Änderungen anwenden und prüfen {#capabilities}

MINDDY_PUBLIC_SITE_NAME und MINDDY_PUBLIC_CONTACT_EMAIL kennzeichnen Ihre Instanz. ADMIN_EMAILS enthält kommagetrennte Administratoradressen; privilegierter Zugriff verlangt zusätzlich MFA. OAUTH_ISSUER bleibt normalerweise leer, außer OAuth soll bewusst über einen anderen stabilen Origin angeboten werden. Lassen Sie verwaltete KI und Abrechnung beim Selbsthosting aus. Optionale Dienste benötigen ihre vollständige Konfiguration. Starten oder erstellen Sie die Anwendung nach Änderungen öffentlicher Laufzeitwerte neu; ein OCI-Neubuild ist unnötig. doctor unterscheidet unvollständige Funktionen von Kernfehlern. Testen Sie danach Kontolinks und Callbacks am vorgesehenen Origin.

## Optionale Anbieter bewusst einschalten {#optional-providers}

Der Kern benötigt weder Stripe, PostHog, Cloud-Konto noch einen von minddy verwalteten KI-Schlüssel. Externe Dienste bringen eigene Kosten, Rechte und Datenziele. Prüfen Sie Bedingungen vor Aktivierung. Diagnosen melden fehlende Werte statt eines Ersatzanbieters. Selbsthosting kann persönliche KI-Schlüssel oder erreichbare lokale KI-Endpunkte nutzen. Lassen Sie MINDDY_MANAGED_AI und MINDDY_MANAGED_BILLING aus; ein OpenRouter-Schlüssel allein wählt keine Cloud-Edition.


![Diagramm: Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.](/documentation/de/optional-providers-flow.svg)

### Vollständige Anbieterwerte setzen {#configure}

Anwendungsmail braucht EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM und INVITATION_EMAIL_FROM. console ist in Produktion unzulässig; Auth-SMTP bleibt getrennt. Web Push benötigt öffentliches/privates VAPID-Paar und VAPID_SUBJECT; bestehende Abonnements hängen von diesem Paar ab. Analytics braucht ein vollständiges PostHog-Schlüssel/Host-Paar; Fehlertracking zusätzlich MINDDY_PUBLIC_ERROR_TRACKING=1. Der Installer bietet application-email und web-push, externe Zugangsdaten liefern Sie. Nutzen Sie keine minddy-Absenderidentitäten oder nativen Release-Zugangsdaten auf fremden Instanzen.

### Git und Codeausführung verbinden {#git-and-code}

Unterstützt werden GitHub.com und GitLab.com, nicht Enterprise Server oder selbstverwaltetes GitLab. Benutzerinitiierte Verbindungen können den verwalteten Forge-Relay nutzen; deaktivieren Sie ihn mit --no-forge-relay oder MINDDY_FORGE_RELAY=0 und konfigurieren Sie eigene Apps. Bestehende Verbindungen behalten ihren Kanal bis zur Neuverbindung. Der Referenzserver enthält einen vertrauenswürdigen selbstgehosteten Docker-Runner. Vercel Sandbox ist eine ausdrückliche Alternative mit eigenen Zugangsdaten und gültigem MINDDY_DATA_ROOT_KEY auch ohne Inhaltsverschlüsselung. Lokale Desktop-Codeausführung wurde entfernt. Fehlende Konfiguration blockiert Delegation statt Code auf dem Benutzercomputer auszuführen.

Das veröffentlichte Anwendungsimage enthält Node.js und Git, entfernt jedoch bewusst npm, npx und Corepack. Das Referenz-Compose-Profil wählt dieses Image auch für Worker über AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Für einen neuen Code-Worker reicht das nicht aus: Der OpenCode-Bootstrap verwendet npm, um seine gepinnte Laufzeit und sein Plugin zu installieren, selbst bei einem Repository ohne Projektabhängigkeiten. Ohne npm endet die Ausführung beim Bootstrap; aus der Unterhaltung lassen sich weder Projektänderungen noch bestandene Tests ableiten. Verwenden Sie ein vom Betreiber erstelltes und geprüftes eigenes Worker-Image mit Node.js 24, npm, Git und den benötigten Projektwerkzeugen, indem Sie AGENT_RUNNER_SANDBOX_IMAGE im Runner-Dienst überschreiben. Behalten Sie die Isolationsvorgaben bei. Prüfen Sie Bootstrap, Klonen, tatsächliche Tests und den entstandenen Diff vor der Code-Delegation. Die Korrektur der Runner-Dateien allein stellt diese Worker-Werkzeuge nicht bereit.

## Öffentliche Origins und geplante Aufgaben betreiben {#proxy-network-and-jobs}

Öffentliche Installationen benötigen TLS-Proxy und HTTP-zu-HTTPS-Weiterleitung. Anwendungs- und Supabase-Origin, Auth-Weiterleitungen, OAuth-Callbacks und weitergereichte Header müssen übereinstimmen. PostgreSQL, Studio, interne Ports und Runner bleiben vom Internet getrennt. Im full-Profil verwendet die Anwendung intern http://kong:8000, Browser und erzeugte Links behalten den öffentlichen Supabase-Origin. Privates HTTP verlangt localhost oder vertrauenswürdige private IPv4 ohne Router-Portweiterleitungen.


![Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.](/documentation/de/proxy-network-and-jobs-flow.svg)

### Authentifizierte Zeitpläne bereitstellen {#schedules}

Referenz-Compose startet den Scheduler und erzeugt CRON_SECRET. Eigene Quellcodebereitstellungen brauchen einen gleichwertigen HTTP-Scheduler. Jede Anfrage sendet `Authorization: Bearer <CRON_SECRET>`; ein leeres oder falsches Geheimnis ergibt 401. Protokollieren Sie den Header nicht. Die folgenden Kandidatenzeitpläne verwenden UTC. Verwenden Sie den Satz der installierten Version, denn Pfade können sich ändern.


Der veröffentlichte Scheduler von v0.11.0 enthält numo-turns nicht. Im Kandidaten wurde der Scheduler um einen Aufruf pro Minute ergänzt. Die Tabelle beschreibt den korrigierten Kandidaten; nehmen Sie diesen Job bei einer unveränderten Installation von v0.11.0 nicht an.

| Endpunkt | Zeitplan (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Jobs während Wartung stoppen {#maintenance}

Stoppen Sie vor Backup oder Migration Scheduler, Anwendung, Worker und öffentlichen Supabase-Zugang. Das Stoppen allein der Webanwendung erlaubt weiterhin direkte API-Schreibzugriffe. Prüfen Sie Wartung bei geschlossenen Jobs und Zugängen und öffnen Sie erst nach Datenbank-, Auth-, Storage- und Anwendungstests. Prüfen Sie bei inaktiven Jobs Scheduler, kanonischen Origin und Geheimnis privat. Routinen benötigen den Serverscheduler, keine dauerhaft geöffnete Desktop-App.
