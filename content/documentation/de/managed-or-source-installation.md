---
{
  "id": "managed-or-source-installation",
  "locale": "de",
  "title": "Mit verwaltetem Supabase oder aus Quellcode installieren",
  "summary": "Managed Supabase beschreibt den Betrieb des Backends.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
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
      "docs/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/de/managed-or-source-installation-flow.svg",
      "alt": "Diagramm: Ihr verwaltetes Supabase-Projekt. PostgreSQL, Auth, Storage, Realtime. OCI-Profil ODER Anwendung aus Quelltag. Jobs und Sicherung passend zum Profil.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Ihr verwaltetes Supabase-Projekt. PostgreSQL, Auth, Storage, Realtime. OCI-Profil ODER Anwendung aus Quelltag. Jobs und Sicherung passend zum Profil.",
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
    "managed-or-source-installation-flow"
  ]
}
---

## Mit verwaltetem Supabase oder aus Quellcode installieren {#managed-or-source-installation}

Managed Supabase beschreibt den Betrieb des Backends. Es kann mit dem offiziellen OCI-Anwendungsprofil oder einer aus Quellcode betriebenen Anwendung kombiniert werden. Unterscheiden Sie diese Bereitstellungen in Installations- und Abnahmeprotokollen. Das Backend benötigt PostgreSQL, Auth, Storage und Realtime. Das geführte OCI-Profil managed benötigt ein Projekt auf supabase.com, öffentliche URL, Anon- und Service-Role-Schlüssel sowie eine für Bootstrap-Werkzeuge erreichbare PostgreSQL-Verbindung. Verwenden Sie Ihr eigenes Projekt. Minddy-Cloud-Zugangsdaten sind keine Installationsparameter.


![Diagramm: Ihr verwaltetes Supabase-Projekt. PostgreSQL, Auth, Storage, Realtime. OCI-Profil ODER Anwendung aus Quelltag. Jobs und Sicherung passend zum Profil.](/documentation/de/managed-or-source-installation-flow.svg)

## Managed Supabase konfigurieren {#managed}

Führen Sie den folgenden Befehl im geprüften Release-Verzeichnis aus. IMAGE ist der geprüfte Digest aus dem Kompatibilitätsartikel. Werte mit ... sind unbrauchbare Beispiele. Beschaffen Sie echte Werte privat und vermeiden Sie Geheimnisse in Shell-Verlauf oder geteilten Logs. Der Installer erhält die geschützte Umgebung, enthält Scheduler und Runner und aktiviert optionale Dienste erst nach Konfiguration. Auth-SMTP und genaue Weiterleitungen konfigurieren Sie separat im eigenen Supabase-Projekt.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Quellcodebereitstellung abschließen {#source}

Für Quellcodebereitstellung installieren Sie eingefrorene Abhängigkeiten des Tags, setzen Anwendungs- und Supabase-Umgebung, führen Bootstrap und Build aus und starten den Produktionsserver hinter Ihrem Proxy. Setzen Sie MINDDY_PUBLIC_* vor dem Start. Sie benötigen einen dauerhaft laufenden Scheduler mit den authentifizierten Aufrufen des Netzwerkartikels; ein Build allein führt keine Jobs aus. Prüfen Sie Migrationen und Storage, anschließend Auth, Ticketerstellung, Dateibytes und Realtime. Sichern Sie diese Instanz mit dem logischen beziehungsweise Anbieter-Verfahren. Ersetzen Sie zur Abnahme einer OCI-Installation diese nicht durch einen Quellcodeserver.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
