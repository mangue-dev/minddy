---
{
  "id": "choose-an-instance",
  "locale": "it",
  "title": "Istanze Cloud e self-hosted",
  "summary": "Confronta le responsabilità di gestione, le destinazioni dei dati e i fornitori opzionali da configurare.",
  "topic": "Primi passi",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "v0.11.0",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md",
      "app/(marketing)/self-hosting/install/page.tsx",
      "lib/public-routes.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (primary installation path verified against the localized self-hosting wizard routes; technical references retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (it wizard-first installation guidance review)",
    "date": "2026-10-09"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Scegliere Cloud o una propria istanza"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Scegliere un modello di gestione {#choose-an-instance}

minddy Cloud e minddy ospitato autonomamente eseguono lo stesso nucleo pubblico. Scegli Cloud se vuoi che minddy gestisca applicazione, database, Storage e pianificazione. Scegli l’hosting autonomo se devi controllare la sede dell’infrastruttura, i fornitori o il calendario degli aggiornamenti e puoi gestire questi servizi.

Un account Cloud appartiene a Cloud. Per un’istanza autonoma, crea un account su quell’istanza; non serve un account minddy Cloud. Controlla l’indirizzo prima di accedere o invitare qualcuno. Due istanze minddy non condividono automaticamente account o credenziali.


## Responsabilità e costi {#responsibilities}

| Responsabilità | Cloud | Hosting autonomo |
| --- | --- | --- |
| Infrastruttura, aggiornamenti e incidenti | minddy gestisce il servizio. | Mantieni host, TLS, monitoraggio e aggiornamenti delle versioni. |
| Backup e ripristino | minddy gestisce il servizio Cloud. | Conservi dati del database, file di Storage, configurazione e chiavi di cifratura, e provi i ripristini. |
| Account dei fornitori | minddy possiede gli account dei servizi che gestisce. | Scegli e paghi infrastruttura e fornitori opzionali. |
| Assistenza | Si applicano le condizioni di assistenza Cloud. | Gli strumenti di release e l’aiuto della comunità, secondo disponibilità, coprono difetti riproducibili del nucleo; non è incluso un SLA per gestire la tua infrastruttura. |

Per esempio, un gruppo senza capacità di gestione dei database può usare Cloud. Un operatore con requisiti sulla residenza dei dati può scegliere l’hosting autonomo e controllare le destinazioni di ogni fornitore attivato. Ospitare l’applicazione non rende locale un fornitore esterno di IA, posta elettronica o Git.

## Servizi necessari e opzionali {#services}

Un’installazione supportata richiede l’applicazione e Supabase con PostgreSQL, Auth, Storage e Realtime. PostgreSQL da solo non basta. Usa una release con tag e la relativa matrice di compatibilità. Le varianti derivate di Supabase senza versione fissata e gli adattatori autogestiti per GitHub Enterprise o GitLab non rientrano nel contratto supportato.

IA, posta elettronica, Git, notifiche push e analisi d’uso dipendono dalla configurazione. L’hosting autonomo non richiede Stripe, PostHog, una chiave IA gestita da minddy o un account Cloud. La configurazione opzionale mancante viene segnalata, senza sostituirla silenziosamente con un fornitore. Chiavi IA personali ed endpoint IA locali sono opzioni possibili; disponibilità e costi dipendono dalla capacità configurata.

Controlla permessi e condizioni sui dati prima di attivare un’integrazione. Le connessioni Git possono usare il relay gestito per le forge quando avvii esplicitamente l’integrazione; sono disponibili anche applicazioni del fornitore di proprietà dell’operatore e la disattivazione del relay. L’hosting autonomo non è una versione ridotta delle funzioni del nucleo.

## Fonte e prossimo passo {#next-step}

Il repository di riferimento è [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy), esclusivamente sotto GNU AGPL v3.0. Rispetta licenza e regole sui nomi per distribuzioni modificate o ospitate. Per installare, inizia dall’[assistente di hosting autonomo passo dopo passo](/it/hosting-autonomo/installa). Consulta il [riferimento per l’installazione](/it/documentazione/installation) per i dettagli tecnici e le verifiche aggiuntive. Prima di trasferire il lavoro esistente, consulta la guida al trasferimento tra istanze: credenziali e abbonamenti non vengono trasferiti con i dati dell’account.
