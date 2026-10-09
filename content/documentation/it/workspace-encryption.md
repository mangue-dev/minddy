---
{
  "id": "workspace-encryption",
  "locale": "it",
  "title": "Crittografia dello spazio di lavoro",
  "summary": "Verifica la cifratura della tua versione e conserva le chiavi di recupero delle credenziali e dei contenuti dello spazio di lavoro.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "scripts/self-hosting-encryption.mjs",
      "lib/server/encryption/data-policy.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Configurare cifratura e conservare le chiavi"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/it/workspace-encryption-flow.svg",
      "alt": "Schema: Radice dedicata fuori PostgreSQL. Chiavi progetto, utente e sistema avvolte. Decifratura autorizzata sul server. Restore database + Storage + stesse chiavi.",
      "caption": "Questi componenti hanno responsabilità distinte. Radice dedicata fuori PostgreSQL. Chiavi progetto, utente e sistema avvolte. Decifratura autorizzata sul server. Restore database + Storage + stesse chiavi.",
      "revision": 3,
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
            "title": "Radice dedicata fuori PostgreSQL"
          },
          {
            "title": "Chiavi progetto, utente e sistema avvolte"
          },
          {
            "title": "Decifratura autorizzata sul server"
          },
          {
            "title": "Restore database + Storage + stesse chiavi"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "workspace-encryption-flow"
  ]
}
---

## Configurare cifratura e conservare le chiavi {#workspace-encryption}

Le opzioni --encryption del programma di installazione e del bootstrap descritte qui appartengono agli strumenti del candidato 0.11.1 identificato. I programmi pubblicati con v0.11.0 non le accettano. Il runtime di quella versione riconosce MINDDY_CONTENT_ENCRYPTION_ENABLED; il servizio Compose di riferimento carica il file protetto tramite env_file. Dopo una modifica esplicita del flag devi quindi ricreare il servizio dell’applicazione con lo stesso ambiente e verificare lo schema e il comportamento effettivo. Una chiave MINDDY_DATA_ROOT_KEY generata non dimostra che il contenuto dello spazio sia cifrato. Usa strumenti e configurazione corrispondenti, verificati esplicitamente per la versione scelta, prima di accogliere utenti o modificare un’istanza esistente.

Le nuove installazioni locali e server attivano la cifratura per impostazione predefinita e generano una MINDDY_DATA_ROOT_KEY dedicata. Un server nuovo può scegliere --encryption enabled o --encryption disabled. Entrambe le scelte conservano la cifratura delle credenziali e generano una radice indipendente: l’opzione riguarda i contenuti. Per il desktop locale, prepara la configurazione con il comando seguente prima di aprire il clone. La radice casuale di 32 byte è rappresentata da esattamente 64 caratteri esadecimali e resta fuori da PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Schema: Radice dedicata fuori PostgreSQL. Chiavi progetto, utente e sistema avvolte. Decifratura autorizzata sul server. Restore database + Storage + stesse chiavi.](/documentation/it/workspace-encryption-flow.svg)

## Gestire dati esistenti e ripetizioni {#existing-data}

Una configurazione esistente senza il flag rimane disattivata fino a una scelta deliberata. Ripetere l’installer conserva flag e radice; una scelta contraddittoria viene rifiutata. Non rigenerare la chiave per riparare un’istanza cifrata: recupera l’originale. Applica lo schema e la verifica prima di importare dati. La manutenzione a lotti converte i contenuti storici e ruota le chiavi; il flag non prova che tutte le copie siano state convertite. Disattivarlo non decifra i dati e non permette nuove scritture in chiaro negli ambiti protetti.

## Preservare il recupero {#recovery}

Il server decifra per utenti e IA autorizzati: si tratta di protezione a riposo, non di un segreto end-to-end rispetto all’operatore. Email di login e metadati rimangono leggibili; esportazioni e provider richiedono protezione propria. Conserva le radici attuali e storiche necessarie ai backup. Cifra e limita l’accesso alle copie che contengono ambiente e dati. Prova il ripristino di database e Storage con le chiavi corrispondenti. Cambiare la radice richiede il riavvolgimento offline delle chiavi con le applicazioni ferme; sostituirla semplicemente rende i dati illeggibili.
