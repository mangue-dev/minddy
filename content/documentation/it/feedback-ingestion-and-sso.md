---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "it",
  "title": "Collegare acquisizione feedback e SSO",
  "summary": "Conservare chiavi sul server e firmare identità brevi con un segreto distinto.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/it/feedback-ingestion-and-sso-workflow.png",
      "alt": "Sequenze distinte di acquisizione backend e SSO browser con segreti diversi.",
      "caption": "La chiave di acquisizione autentica le chiamate server. Il segreto SSO della bacheca firma un token visitatore breve e monouso.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Inviare dal backend {#feedback-ingestion-and-sso}

Il proprietario crea una chiave di integrazione feedback nelle impostazioni del progetto. Conserva la chiave, mostrata una sola volta, come `MINDDY_FEEDBACK_KEY` nella configurazione segreta del backend. Non inserirla mai nel codice del browser. Imposta `MINDDY_ORIGIN` sull’origine dell’istanza di destinazione, senza barra finale.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Mostrare data di consegna","body":"Il supporto ha bisogno della data prevista.","user":{"external_id":"demo-user-1","name":"Lettore demo"}}'
```

Fornisci un titolo non vuoto di massimo 200 caratteri, un corpo facoltativo di massimo 10.000 e `user.external_id` e/o `user.email`. L’ID esterno ammette 255 caratteri, l’email 254 e il nome 200. Il backend garantisce l’identità; l’acquisizione anonima viene rifiutata. Il successo restituisce HTTP 201 con `id`, `status`, `review_state`, voti e pseudonimo. La bacheca non deve essere attiva per ricevere feedback. `analyze` è true per impostazione predefinita; false salta moderazione, categorizzazione e unione per quel feedback e imposta lo stato di revisione `published` senza attesa. Questo stato non attiva la bacheca e non supera le regole di visibilità o lo stato di spam. L’API crea feedback pubblici per impostazione predefinita e non accetta un parametro di visibilità privata.


## Voti, errori e webhook {#errors}

Invia `{"user":{"external_id":"demo-user-1"}}` tramite POST a `/api/v1/feedback/<id>/vote` con gli stessi header. Ogni identità dispone di un voto; ripeterlo è idempotente. Un feedback unito restituisce 409 `post_merged` con la destinazione canonica.

La creazione consente 20 chiamate al minuto per chiave; i voti, 60. Rispetta `Retry-After` in caso di 429. Controlla 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` e gli errori di campo 422 prima di riprovare. La creazione non è un aggiornamento idempotente: se perdi la risposta, controlla la casella feedback del team prima di ripetere. Le chiavi feedback non offrono webhook di issue in uscita. Un’integrazione issue configurata separatamente supporta quel canale con firma propria e consegna senza garanzia.


## Identificare via SSO {#sso}

Come proprietario, attiva la bacheca e configura il suo segreto SSO distinto. Il backend firma un JWT HS256 con `sub` stabile, `exp` obbligatorio ed email e nome facoltativi. Usa al massimo 600 secondi di validità e un `jti` univoco; la verifica tollera 60 secondi di scarto dell’orologio. Reindirizza subito a `/f/<board-token>?sso=<jwt>`. Ogni token viene consumato una sola volta per bacheca; un nuovo tentativo richiede un token appena firmato. Non riutilizzare la chiave di acquisizione come segreto SSO. Mantieni i token fuori da log e schermate condivise.

Verifica che il visitatore apra Il mio feedback con l’identità prevista. Un token scaduto richiede un nuovo reindirizzamento. Se il segreto è compromesso, rinnovalo tramite la conferma della bacheca e aggiorna contemporaneamente il backend. Il codice email resta l’alternativa quando il SSO non è disponibile.

![Sequenze distinte di acquisizione backend e SSO browser con segreti diversi.](/documentation/it/feedback-ingestion-and-sso-workflow.png)
