---
{
  "id": "api-and-webhooks",
  "locale": "it",
  "title": "API, webhook e SSO del feedback",
  "summary": "Crea ticket o feedback tramite l’API di integrazione, verifica i webhook firmati e autentica i visitatori del feedback con SSO.",
  "topic": "Concetti tecnici",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Creare ticket o feedback e ricevere webhook firmati",
    "Collegare la raccolta di feedback e il SSO",
    "Collegare acquisizione feedback e SSO"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/it/integration-api-and-webhooks-flow.svg",
      "alt": "Schema: Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.",
      "caption": "Segui le fasi in questo ordine. Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Server conserva chiave integrazione"
          },
          {
            "title": "POST ticket o feedback con tipo corretto"
          },
          {
            "title": "Proprietario sceglie destinazione webhook"
          },
          {
            "title": "Ricevente verifica HMAC grezzo e UUID"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/it/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Sequenze distinte di acquisizione backend e SSO browser con segreti diversi.",
      "caption": "La chiave di acquisizione autentica le chiamate server. Il segreto SSO della bacheca firma un token visitatore breve e monouso.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Due flussi di feedback separati",
        "columns": [
          {
            "title": "Acquisizione dal server",
            "items": [
              "Il backend conserva la chiave feedback",
              "POST /api/v1/feedback con chiave Bearer e identità stabile",
              "HTTP 201: post salvato nella casella team; la bacheca può essere disattivata"
            ]
          },
          {
            "title": "SSO del visitatore nel browser",
            "items": [
              "Il backend conserva il segreto SSO separato della bacheca",
              "Firmare JWT HS256: sub, exp, jti unico; validità ≤ 600 s",
              "Reindirizzare il browser a /f/<board-token>?sso=<jwt>",
              "Token monouso crea sessione; aprire Il mio feedback"
            ]
          }
        ],
        "note": "Mai inviare chiave di acquisizione o segreto SSO al browser. Tolleranza orologio: 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

L’API di integrazione riceve ticket e feedback tramite chiavi di progetto; i webhook notificano gli eventi con una firma da verificare. Il proprietario configura chiavi e destinazioni. Il SSO identifica i visitatori della bacheca di feedback tramite il tuo backend, senza esporre segreti al browser.

## Creare ticket o feedback e ricevere webhook firmati {#integration-api-and-webhooks}

Il proprietario crea un’integrazione dalle impostazioni del progetto. Un’integrazione issues invia lavoro al triage; un’integrazione feedback raccoglie esigenze con voti e stato pubblico. La chiave mdy_ viene mostrata una sola volta. Conservala solo sul server in MINDDY_API_KEY o MINDDY_FEEDBACK_KEY, mai nel browser, in Git o nei log. La revoca è permanente; una chiave sconosciuta o revocata restituisce 401 invalid_api_key. Ogni chiave appartiene a un progetto e a un tipo: usarla sull’endpoint sbagliato restituisce 403 wrong_key_kind.

![Schema: Server conserva chiave integrazione. POST ticket o feedback con tipo corretto. Proprietario sceglie destinazione webhook. Ricevente verifica HMAC grezzo e UUID.](/documentation/it/integration-api-and-webhooks-flow.svg)

### Inviare i campi corretti {#send}

GET /api/v1/issues/options restituisce categorie, priorità ed effort disponibili. POST /api/v1/issues richiede un titolo non vuoto e accetta descrizione Markdown, priorità, effort e categorie opzionali.

| Campo | Limite |
| --- | --- |
| Titolo | 500 caratteri |
| Descrizione | 65.536 caratteri |
| Categorie | 50 identificatori |

Il ticket entra sempre nel triage; dall’esterno non puoi scegliere stato, assegnatario o parent. La risposta 201 contiene id, number, identifier e status. Per i campi del feedback, l’identità dell’autore e la moderazione, segui la [procedura di raccolta dei feedback](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Segnalazione di esempio","description":"Riprodurre con dati dimostrativi","priority":"low","effort":"s"}'
```

### Verificare e deduplicare eventi {#receive}

Le integrazioni issues possono inviare issue.created, issue.status_changed e issue.updated. Una nuova destinazione webhook deve essere scelta dal proprietario. Gli agenti possono regolare eventi e ambito di una destinazione esistente o disattivarla; non possono aprire un nuovo canale di uscita. L’ambito integration include solo i ticket creati con quella chiave; all include l’intero progetto.

X-minddy-Signature contiene il prefisso sha256= e un HMAC-SHA256 calcolato sui byte originali. La chiave HMAC è il digest SHA-256 della chiave API, rappresentato come stringa esadecimale minuscola. Confronta la firma in tempo costante prima di fidarti del payload, senza analizzarlo e riserializzarlo. X-minddy-Delivery corrisponde a delivery_id: usa questo UUID per eliminare i duplicati.

### Gestire errori e limiti {#limits}

La consegna è best effort: il timeout è di cinque secondi, seguito da un solo nuovo tentativo immediato per errori di rete o risposte 5xx. Dopo il secondo fallimento l’evento viene scartato. Sono possibili duplicati e consegne fuori ordine. Salva il payload verificato, rispondi subito con 2xx e poi elaboralo. issue.updated raggruppa le modifiche; per description e plan riporta solo il nome del campo. Controlla quindi lo stato corrente. Per 429 rispetta Retry-After; gli errori di validazione restituiscono 422 e la quota definitiva restituisce 403 issue_limit_reached. Un timeout di creazione non prova un fallimento: verifica prima di riprovare. La votazione dei feedback ha un [endpoint e limiti propri](#errors).

## Collegare la raccolta di feedback e il SSO {#feedback-ingestion-and-sso}

Il proprietario crea una chiave di integrazione feedback nelle impostazioni del progetto. Conserva la chiave, mostrata una sola volta, come `MINDDY_FEEDBACK_KEY` nella configurazione segreta del backend. Non inserirla mai nel codice del browser. Imposta `MINDDY_ORIGIN` sull’origine dell’istanza di destinazione, senza barra finale.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Mostrare data di consegna","body":"Il supporto ha bisogno della data prevista.","user":{"external_id":"demo-user-1","name":"Lettore demo"}}'
```

Fornisci un titolo non vuoto di massimo 200 caratteri, un corpo facoltativo di massimo 10.000 e `user.external_id` e/o `user.email`. L’ID esterno ammette 255 caratteri, l’email 254 e il nome 200. Il backend garantisce l’identità; l’acquisizione anonima viene rifiutata. Il successo restituisce HTTP 201 con `id`, `status`, `review_state`, voti e pseudonimo. La bacheca non deve essere attiva per ricevere feedback. `user.name` è facoltativo. `analyze` è un booleano, true per impostazione predefinita; la stringa "false" viene rifiutata. false salta moderazione, categorizzazione e unione per quel feedback, pubblica il testo invariato e imposta lo stato di revisione `published` senza attesa. Controlla `review_state` e valida l’identità dell’autore sul server. Questo stato non attiva la bacheca e non supera le regole di visibilità o lo stato di spam. L’API crea feedback pubblici per impostazione predefinita e non accetta un parametro di visibilità privata.

### Voti, errori e webhook {#errors}

Invia `{"user":{"external_id":"demo-user-1"}}` tramite POST a `/api/v1/feedback/<id>/vote` con gli stessi header. Ogni identità dispone di un voto; ripeterlo è idempotente. Un feedback unito restituisce 409 `post_merged` con la destinazione canonica.

La creazione consente 20 chiamate al minuto per chiave; i voti, 60. Rispetta `Retry-After` in caso di 429. Controlla 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` e gli errori di campo 422 prima di riprovare. La creazione non è un aggiornamento idempotente: se perdi la risposta, controlla la casella feedback del team prima di ripetere. Le chiavi feedback non offrono webhook di issue in uscita. Un’integrazione issue configurata separatamente supporta quel canale con firma propria e consegna senza garanzia.

### Identificare i visitatori tramite SSO {#sso}

Come proprietario, attiva la bacheca e configura il suo segreto SSO distinto. Il backend firma un JWT HS256 con `sub` stabile, `exp` obbligatorio ed email e nome facoltativi. Usa al massimo 600 secondi di validità e un `jti` univoco; la verifica tollera 60 secondi di scarto dell’orologio. Reindirizza subito a `/f/<board-token>?sso=<jwt>`. Ogni token viene consumato una sola volta per bacheca; un nuovo tentativo richiede un token appena firmato. Non riutilizzare la chiave di acquisizione come segreto SSO. Mantieni i token fuori da log e schermate condivise.

Verifica che il visitatore apra Il mio feedback con l’identità prevista. Un token scaduto richiede un nuovo reindirizzamento. Se il segreto è compromesso, rinnovalo tramite la conferma della bacheca e aggiorna contemporaneamente il backend. Il codice email resta l’alternativa quando il SSO non è disponibile.

![Sequenze distinte di acquisizione backend e SSO browser con segreti diversi.](/documentation/it/feedback-ingestion-and-sso-workflow.svg)
