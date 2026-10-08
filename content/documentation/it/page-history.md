---
{
  "id": "page-history",
  "locale": "it",
  "title": "Esaminare e ripristinare una versione di pagina",
  "summary": "Visualizza la cronologia salvata prima di sostituire il documento attuale.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-history-preview.png",
      "alt": "Scheda Versioni con uno stato precedente espanso, autore, Ripristina e avviso di conservazione per 30 giorni.",
      "caption": "Esamina l’anteprima di uno stato salvato e confrontalo con la pagina attuale prima di ripristinarlo.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-history-steps"
  ]
}
---

## Esaminare le versioni salvate {#page-history}

Apri l’indicatore di salvataggio o cronologia della pagina per vedere le versioni, oppure il controllo di commenti e attività per esaminare le azioni. Le schede rispondono a domande diverse: una versione salvata è uno stato del documento, mentre l’attività può includere rinominazioni, eliminazione o ripristino senza la stessa istantanea del contenuto.

Seleziona una versione per visualizzarla prima di ripristinare. La cronologia identifica autori e attività degli agenti: confronta il contenuto con la modifica da annullare. L’interfaccia annuncia una finestra di 30 giorni; non considerare la cronologia un backup esterno permanente.

## Ripristinare e verificare {#restore-page-version}

Come membro autorizzato del progetto, ripristina la versione selezionata solo dopo aver esaminato il contenuto attuale che sostituirà. Lo stato precedente al ripristino entra a sua volta nella cronologia, consentendo di recuperarlo più avanti finché è conservato.

Riapri o aggiorna l’editor dopo il ripristino e controlla il corpo effettivo della pagina. Un editor già aperto mantiene una versione superata e non deve sovrascrivere alla cieca lo stato ripristinato. Le versioni di pagina non sono backup completi dell’istanza: dati degli allegati, file eliminati e oggetti correlati possono avere cicli di vita separati. Usa le guide di recupero di file e operatori quando mancano informazioni esterne al corpo salvato.


![Scheda Versioni con uno stato precedente espanso, autore, Ripristina e avviso di conservazione per 30 giorni.](/documentation/it/page-history-preview.png)
