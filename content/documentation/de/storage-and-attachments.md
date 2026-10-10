---
{
  "id": "storage-and-attachments",
  "locale": "de",
  "title": "Speicher und Anhänge",
  "summary": "PostgreSQL speichert Storage-Objektmetadaten und Anwendungsreferenzen.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
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
      "docs/self-hosting.md",
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Storage dauerhaft betreiben und Anhänge prüfen"
  ],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/de/storage-and-attachments-flow.svg",
      "alt": "Diagramm: Autorisierter Anwendungsdateizugriff. PostgreSQL-Objektmetadaten. Rohbytes im Dateisystem oder S3. Passende Konfiguration und Schlüssel.",
      "caption": "Eine Wiederherstellung braucht zusammengehörige Metadaten, Dateiinhalte und die passende geschützte Konfiguration.",
      "revision": 4,
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
            "title": "Autorisierter Anwendungsdateizugriff"
          },
          {
            "title": "PostgreSQL-Objektmetadaten"
          },
          {
            "title": "Rohbytes im Dateisystem oder S3"
          },
          {
            "title": "Passende Konfiguration und Schlüssel"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "storage-and-attachments-flow"
  ]
}
---

## Storage dauerhaft betreiben und Anhänge prüfen {#storage-and-attachments}

PostgreSQL speichert Storage-Objektmetadaten und Anwendungsreferenzen. Das Storage-Backend enthält die Dateibytes. Beide gehören zu derselben Instanz und demselben Sicherungspunkt. Das full-Dateisystemprofil speichert Bytes unter `docker/volumes/storage` im festgelegten Upstream; S3-kompatibler Storage benötigt einen getrennten Rohdaten-Snapshot. Vergängliche Containerdateien sind kein dauerhafter Storage. Überwachen Sie Kapazität für Datenbank, Anhänge und Sicherungen und speichern Sie Backups außerhalb der aktiven Storage-Platte.


![Diagramm: Autorisierter Anwendungsdateizugriff. PostgreSQL-Objektmetadaten. Rohbytes im Dateisystem oder S3. Passende Konfiguration und Schlüssel.](/documentation/de/storage-and-attachments-flow.svg)

## Autorisierten Zugriff prüfen {#access}

Private Seiten- und Ticketdateien durchlaufen Anwendungsautorisierung vor erlaubtem Download. Eine veröffentlichte Seite stellt nur Dateien ihres veröffentlichten Satzes über signierte URLs bereit. Sie öffnet weder den privaten Bucket noch die authentifizierte Route. Eine vorhandene Datei beweist nicht korrekte Metadaten, Richtlinien, Schlüssel oder Berechtigungen. Laden Sie mit einem Demokonto eine Datei hoch und herunter und vergleichen Sie SHA-256. Wiederholen Sie dies nach Wiederherstellung für jeden verwendeten Bucket.

## Fehler beheben {#recover}

Führen Sie die Supabase-Prüfung aus, prüfen Sie richtigen Stack und Service-Role-Konfiguration und vergleichen Sie Objektdatensätze, Rohbytes und erhaltene Schlüssel. Beheben Sie Dienst-, Richtlinien- oder Konfigurationsfehler vor Wiederholung. Löschen Sie niemals einen nicht leeren `avatars`-Bucket wegen einer Warnung. SQL-Datensätze allein stellen keine Bytes wieder her. Stellen Sie bei S3 den Rohbackend-Snapshot wieder her, nicht über `/storage/v1/s3`, das widersprüchliche Metadaten erzeugen kann.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Dateisystem-Storage unter Docker Desktop {#docker-desktop}

Im getesteten macOS-Profil mit Docker Desktop lieferte ein Host-Bind-Mount `ENOTSUP`, als Storage erweiterte Attribute schrieb. Ein neues benanntes Linux-Volume verhinderte diesen Fehler. Bei einer neuen Installation ohne Objektbytes ersetzt der folgende dauerhafte Override nur den Storage-Mount. Behalten Sie `RESTORE_OVERRIDE` im installierten Compose-Kontext bei. Ersetzen Sie keinen bereits befüllten Mount durch ein leeres Volume und überschreiben Sie keinen vorhandenen Restore-Override: Stoppen Sie Schreibzugriffe und sichern Sie zuerst die Bytes mit den Sicherungs- und Wiederherstellungsverfahren.

```bash
: "${RESTORE_OVERRIDE:=/etc/minddy/storage-volume.yml}"
export RESTORE_OVERRIDE
test ! -e "$RESTORE_OVERRIDE"
export STORAGE_VOLUME=minddy-filesystem-storage
if docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "Refusing to replace an existing Storage volume." >&2
  exit 1
fi
cat > "$RESTORE_OVERRIDE" <<EOF
services:
  storage:
    volumes:
      - $STORAGE_VOLUME:/var/lib/storage
volumes:
  $STORAGE_VOLUME:
EOF
# Apply this overlay with the installed Compose context before the first start.
```
