---
{
  "id": "storage-and-attachments",
  "locale": "it",
  "title": "Archiviazione e allegati",
  "summary": "Mantieni coerenti metadati e byte di Storage, verifica i download autorizzati e recupera gli allegati con i dati e le chiavi corrispondenti.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
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
      "docs/self-hosting.md",
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Mantenere Storage duraturo e diagnosticare allegati"
  ],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/it/storage-and-attachments-flow.svg",
      "alt": "Schema: Accesso file autorizzato. Metadati oggetto PostgreSQL. Byte grezzi su filesystem o S3. Configurazione e chiavi corrispondenti.",
      "caption": "Questi componenti hanno responsabilità distinte. Accesso file autorizzato. Metadati oggetto PostgreSQL. Byte grezzi su filesystem o S3. Configurazione e chiavi corrispondenti.",
      "revision": 2,
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
            "title": "Accesso file autorizzato"
          },
          {
            "title": "Metadati oggetto PostgreSQL"
          },
          {
            "title": "Byte grezzi su filesystem o S3"
          },
          {
            "title": "Configurazione e chiavi corrispondenti"
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

## Mantenere Storage duraturo e diagnosticare allegati {#storage-and-attachments}

PostgreSQL conserva metadati Storage e riferimenti agli oggetti; il backend Storage conserva i byte. Entrambi devono appartenere alla stessa istanza e allo stesso punto di backup. Il profilo full con backend filesystem persiste i file in docker/volumes/storage della distribuzione upstream fissata. Un backend compatibile S3 richiede uno snapshot grezzo separato. I file effimeri dei container non sono Storage duraturo. Controlla la capacità destinata a database, allegati e backup, tenendo le copie di backup fuori dal disco attivo.

![Schema: Accesso file autorizzato. Metadati oggetto PostgreSQL. Byte grezzi su filesystem o S3. Configurazione e chiavi corrispondenti.](/documentation/it/storage-and-attachments-flow.svg)

## Verificare l’accesso autorizzato {#access}

I file privati richiedono autorizzazione prima del download. Pubblicare una pagina espone soltanto i file inclusi tramite URL firmate, senza aprire bucket o route private. L’esistenza di un oggetto non dimostra che metadati, policy, chiavi e permessi siano corretti. Carica e scarica un file con un account demo e confronta lo SHA-256; ripeti dopo il ripristino per ciascun bucket.

## Recuperare dopo un errore {#recover}

Esegui la verifica Supabase, controlla che lo stack e la chiave service-role corrispondano e confronta record, byte e chiavi. Correggi servizio, policy o configurazione prima di riprovare. Non cancellare un bucket avatars non vuoto per eliminare un avviso. Ripristinare soltanto SQL non recupera i byte dei file. Su S3 ripristina lo snapshot grezzo, non tramite /storage/v1/s3, che crea metadati in conflitto.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Storage su filesystem con Docker Desktop {#docker-desktop}

Nel profilo macOS con Docker Desktop verificato, un bind mount della cartella host ha restituito ENOTSUP quando Storage ha scritto gli attributi estesi. Un nuovo volume Linux con nome ha evitato l’errore. Per una nuova installazione senza byte di oggetti, l’override persistente seguente sostituisce soltanto il mount di Storage. Conserva RESTORE_OVERRIDE nel contesto Compose installato. Non sostituire un mount già popolato con un volume vuoto e non sovrascrivere un override di ripristino esistente: interrompi le scritture e conserva prima i byte con le procedure di backup e ripristino.

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
