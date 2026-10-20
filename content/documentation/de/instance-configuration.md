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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs",
      "app/api/cron/issue-index/route.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "caption": "Prüfen Sie vor der Aktivierung einer Integration, wohin sie Daten sendet und welche laufenden Kosten sie verursacht.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Betreiber wählt optionale Funktion"
          },
          {
            "title": "Vollständige Zugangsdaten und Bedingungen"
          },
          {
            "title": "Ausdrückliches externes Datenziel"
          },
          {
            "title": "Verhalten prüfen und Kosten beobachten"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/de/proxy-network-and-jobs-flow.svg",
      "alt": "Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.",
      "caption": "Öffentlicher Zugriff und interne Dienste bleiben getrennt; geplante Arbeit wird authentifiziert und während der Wartung gestoppt.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Öffentlicher HTTPS-Proxy"
          },
          {
            "title": "App und öffentlicher Supabase-Origin"
          },
          {
            "title": "Private Datenbank- und interne Ports"
          },
          {
            "title": "Authentifizierte Jobs; Wartungsstopp"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

Die Instanzkonfiguration legt öffentliche Origins, Geheimnisse und verfügbare Dienste fest. Sichern Sie vorhandene Zugangsdaten, bevor Sie die geschützte Umgebung ändern. Konfigurieren Sie jeden optionalen Anbieter vollständig und prüfen Sie danach die Netzwerkfreigaben und authentifizierten geplanten Jobs.

## Origins, Geheimnisse und Funktionen der Instanz konfigurieren {#instance-configuration}

`MINDDY_PUBLIC_APP_URL` muss ein einzelner absoluter Origin ohne Pfad oder abschließenden Schrägstrich sein. Öffentliche Installationen verwenden HTTPS; `localhost` und vertrauenswürdige private IPv4 dürfen HTTP verwenden. `MINDDY_PUBLIC_SUPABASE_URL` und `MINDDY_PUBLIC_SUPABASE_ANON_KEY` müssen denselben Supabase-Stack bezeichnen. Diese Werte erreichen den Browser. `SUPABASE_SERVICE_ROLE_KEY` bleibt ausschließlich serverseitig und ist in Produktion erforderlich. Er darf nie in öffentliche Variablen oder Clientbundles gelangen. Eine Datenbank-URL dient Werkzeugen und ersetzt nicht die API-Konfiguration.

### Geheimnisse erhalten {#secrets}

Der Installer ergänzt fehlende `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY` und `CRON_SECRET`. Der Inhaltswurzelschlüssel besteht aus genau 64 Hexadezimalzeichen. Bewahren Sie ihn außerhalb PostgreSQL mit geschützter Wiederherstellungskopie auf. Die gesamte Umgebung benötigt Modus `0600` und darf nicht in Git gelangen. Führen Sie sie nicht als Shell-Code aus und geben Sie sie nicht aus. Ein Installationswiederholungsversuch rotiert keine Geheimnisse. Schlüsselverlust kann vorhandene Daten unlesbar machen; absichtliche Rotation benötigt das passende Wiederherstellungsverfahren.

### Änderungen anwenden und prüfen {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` und `MINDDY_PUBLIC_CONTACT_EMAIL` kennzeichnen Ihre Instanz. `ADMIN_EMAILS` enthält kommagetrennte Administratoradressen; privilegierter Zugriff verlangt zusätzlich MFA. `OAUTH_ISSUER` bleibt normalerweise leer, außer OAuth soll bewusst über einen anderen stabilen Origin angeboten werden. Lassen Sie verwaltete KI und Abrechnung beim Selbsthosting aus. Optionale Dienste benötigen ihre vollständige Konfiguration. Starten oder erstellen Sie die Anwendung nach Änderungen öffentlicher Laufzeitwerte neu; ein OCI-Neubuild ist unnötig. doctor unterscheidet unvollständige Funktionen von Kernfehlern. Testen Sie danach Kontolinks und Callbacks am vorgesehenen Origin.

### Feedback und Dokumentationsmeldungen konfigurieren {#product-feedback}

Setzen Sie `MINDDY_FEEDBACK_KEY` auf einen Feedback-Integrationsschlüssel, um die Feedback-Funktion in der App zu aktivieren. Erstellen Sie für Dokumentationsmeldungen eine eigene Feedback-Integration im empfangenden Projekt, wählen Sie Documentation als Standardziel und speichern Sie den Schlüssel als `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Beide Schlüssel bleiben auf dem Server. Meldungen werden an `/api/v1/feedback` unter dem mit `MINDDY_PUBLIC_APP_URL` festgelegten Ursprung gesendet. Starten Sie die Anwendung nach Änderungen dieser Werte neu.

Um über einen Artikel einen Fehler zu melden, ist ein angemeldetes Konto erforderlich. Nach der Anmeldung kehrt der Leser zum selben Artikel zurück; der Feedback-Dialog ist geöffnet. Titel und Beschreibung sind zunächst leer. Nach dem Absenden ergänzt der Server die Artikel-ID, Sprache, Revision und öffentliche URL. Diese Angaben sind keine bearbeitbaren Formularfelder. Die Dokumentationsintegration verknüpft das Feedback automatisch mit dem ausgewählten Ziel. Ohne `MINDDY_DOCUMENTATION_FEEDBACK_KEY` ist die Schaltfläche zum Melden von Fehlern deaktiviert und zeigt eine Erklärung an.

## Optionale Anbieter bewusst einschalten {#optional-providers}

Der Kern benötigt weder Stripe, PostHog, Cloud-Konto noch einen von minddy verwalteten KI-Schlüssel. Externe Dienste bringen eigene Kosten, Rechte und Datenziele. Prüfen Sie Bedingungen vor Aktivierung. Diagnosen melden fehlende Werte statt eines Ersatzanbieters. Selbsthosting kann persönliche KI-Schlüssel oder erreichbare lokale KI-Endpunkte nutzen. Lassen Sie `MINDDY_MANAGED_AI` und `MINDDY_MANAGED_BILLING` aus; ein OpenRouter-Schlüssel allein wählt keine Cloud-Edition.


![Diagramm: Betreiber wählt optionale Funktion. Vollständige Zugangsdaten und Bedingungen. Ausdrückliches externes Datenziel. Verhalten prüfen und Kosten beobachten.](/documentation/de/optional-providers-flow.svg)

### Vollständige Anbieterwerte setzen {#configure}

Anwendungsmail braucht `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` und `INVITATION_EMAIL_FROM`. `console` ist in Produktion unzulässig; Auth-SMTP bleibt getrennt. Web Push benötigt öffentliches/privates VAPID-Paar und `VAPID_SUBJECT`; bestehende Abonnements hängen von diesem Paar ab. Analytics braucht ein vollständiges PostHog-Schlüssel/Host-Paar; Fehlertracking zusätzlich `MINDDY_PUBLIC_ERROR_TRACKING=1`. Der Installer bietet `application-email` und `web-push`, externe Zugangsdaten liefern Sie. Nutzen Sie keine minddy-Absenderidentitäten oder nativen Release-Zugangsdaten auf fremden Instanzen.

### Git und Codeausführung verbinden {#git-and-code}

Unterstützt werden GitHub.com und GitLab.com, nicht Enterprise Server oder selbstverwaltetes GitLab. Benutzerinitiierte Verbindungen können den verwalteten Forge-Relay nutzen; deaktivieren Sie ihn mit `--no-forge-relay` oder `MINDDY_FORGE_RELAY=0` und konfigurieren Sie eigene Apps. Bestehende Verbindungen behalten ihren Kanal bis zur Neuverbindung. Numo führt keinen Code aus. Der Referenzserver benötigt daher weder Code-Runner noch Sandbox, und kein Dienst erhält den Docker-Socket. Einstellungen aus einer früheren Release, etwa `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` und die Zugangsdaten für Vercel Sandbox, werden ignoriert; entfernen Sie sie aus der geschützten Umgebung.

## Öffentliche Origins und geplante Aufgaben betreiben {#proxy-network-and-jobs}

Öffentliche Installationen benötigen TLS-Proxy und HTTP-zu-HTTPS-Weiterleitung. Anwendungs- und Supabase-Origin, Auth-Weiterleitungen, OAuth-Callbacks und weitergereichte Header müssen übereinstimmen. PostgreSQL, Studio und interne Ports bleiben vom Internet getrennt. Im full-Profil verwendet die Anwendung intern `http://kong:8000`, Browser und erzeugte Links behalten den öffentlichen Supabase-Origin. Privates HTTP verlangt `localhost` oder vertrauenswürdige private IPv4 ohne Router-Portweiterleitungen.


![Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.](/documentation/de/proxy-network-and-jobs-flow.svg)

### Authentifizierte Zeitpläne bereitstellen {#schedules}

Referenz-Compose startet den Scheduler und erzeugt `CRON_SECRET`. Eigene Quellcodebereitstellungen brauchen einen gleichwertigen HTTP-Scheduler. Jede Anfrage sendet `Authorization: Bearer <CRON_SECRET>`; ein leeres oder falsches Geheimnis ergibt 401. Protokollieren Sie den Header nicht. Die folgenden Zeitpläne verwenden UTC und gehören zu dieser Version. Verwenden Sie den Satz der installierten Version, denn Pfade können sich ändern.


Gegenüber dem Scheduler von v0.11.0 fügt diese Version `numo-turns`, `forge-relay-maintenance`, `page-materialization` und `issue-index` hinzu und ruft `/api/cron/agent-drain` und `/api/cron/automations` nicht mehr auf; beide wurden mit Numos Codearbeit und den Projektautomatisierungen entfernt. Ein aus v0.11.0 kopierter eigener Scheduler muss an diese Tabelle angepasst werden.

| Endpunkt | Zeitplan (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Jobs während Wartung stoppen {#maintenance}

Stoppen Sie vor Backup oder Migration Scheduler, Anwendung, Worker und öffentlichen Supabase-Zugang. Das Stoppen allein der Webanwendung erlaubt weiterhin direkte API-Schreibzugriffe. Prüfen Sie Wartung bei geschlossenen Jobs und Zugängen und öffnen Sie erst nach Datenbank-, Auth-, Storage- und Anwendungstests. Prüfen Sie bei inaktiven Jobs Scheduler, kanonischen Origin und Geheimnis privat. Routinen benötigen den Serverscheduler, keine dauerhaft geöffnete Desktop-App.
