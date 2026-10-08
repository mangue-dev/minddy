---
{
  "id": "integration-api-and-webhooks",
  "locale": "it",
  "title": "Creare ticket o feedback e ricevere webhook firmati",
  "summary": "Il proprietario crea un’integrazione dalle impostazioni del progetto.",
  "topic": "Concetti tecnici",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/it/integration-api-and-webhooks-flow.svg",
      "alt": "Schema: Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.",
      "caption": "Segui le fasi in questo ordine. Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.",
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
    "integration-api-and-webhooks-flow"
  ]
}
---

## Creare ticket o feedback e ricevere webhook firmati {#integration-api-and-webhooks}

Il proprietario crea un’integrazione dalle impostazioni del progetto. Un’integrazione issues invia lavoro al triage; un’integrazione feedback raccoglie esigenze con voti e stato pubblico. La chiave mdy_ viene mostrata una sola volta. Conservala solo sul server in MINDDY_API_KEY o MINDDY_FEEDBACK_KEY, mai nel browser, in Git o nei log. La revoca è permanente; una chiave sconosciuta o revocata restituisce 401 invalid_api_key. Ogni chiave appartiene a un progetto e a un tipo: usarla sull’endpoint sbagliato restituisce 403 wrong_key_kind.

![Schema: Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.](/documentation/it/integration-api-and-webhooks-flow.svg)

## Inviare i campi corretti {#send}

GET /api/v1/issues/options restituisce categorie, priorità ed effort disponibili. POST /api/v1/issues richiede un titolo non vuoto e accetta descrizione Markdown, priorità, effort e categorie opzionali. Il ticket entra sempre nel triage; dall’esterno non puoi scegliere stato, assegnatario o parent. I limiti sono 500 caratteri per il titolo, 65.536 per la descrizione e 50 identificatori di categoria. La risposta 201 contiene id, number, identifier e status. POST /api/v1/feedback richiede title e user.external_id e/o user.email; user.name e body sono opzionali. analyze è un booleano, true per impostazione predefinita. false disattiva insieme moderazione, assegnazione delle categorie e fusione, pubblicando il testo invariato. La stringa "false" viene rifiutata. Controlla review_state e valida l’identità dell’autore sul server.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Segnalazione di esempio","description":"Riprodurre con dati dimostrativi","priority":"low","effort":"s"}'
```

## Verificare e deduplicare eventi {#receive}

Le integrazioni issues possono inviare issue.created, issue.status_changed e issue.updated. Una nuova destinazione webhook deve essere scelta dal proprietario. Gli agenti possono regolare eventi e ambito di una destinazione esistente o disattivarla; non possono aprire un nuovo canale di uscita. L’ambito integration include solo i ticket creati con quella chiave; all include l’intero progetto. X-Minddy-Signature contiene il prefisso sha256= e un HMAC-SHA256 calcolato sui byte originali. La chiave HMAC è il digest SHA-256 della chiave API, rappresentato come stringa esadecimale minuscola. Confronta la firma in tempo costante prima di fidarti del payload, senza analizzarlo e riserializzarlo. X-Minddy-Delivery corrisponde a delivery_id: usa questo UUID per eliminare i duplicati.

## Gestire errori e limiti {#limits}

La consegna è best effort: il timeout è di cinque secondi, seguito da un solo nuovo tentativo immediato per errori di rete o risposte 5xx. Dopo il secondo fallimento l’evento viene scartato. Sono possibili duplicati e consegne fuori ordine. Salva il payload verificato, rispondi subito con 2xx e poi elaboralo. issue.updated raggruppa le modifiche; per description e plan riporta solo il nome del campo. Controlla quindi lo stato corrente. Per 429 rispetta Retry-After; gli errori di validazione restituiscono 422 e la quota definitiva restituisce 403 issue_limit_reached. Un timeout di creazione non prova un fallimento: verifica prima di riprovare. POST `/api/v1/feedback/<post_id>/vote` è idempotente per l’identità del votante.
