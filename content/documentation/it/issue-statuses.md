---
{
  "id": "issue-statuses",
  "locale": "it",
  "title": "Seguire il ciclo di vita di un ticket",
  "summary": "Usa gli stati fissi per distinguere richieste in arrivo, lavoro pianificato, revisione e risultati finali.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
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
      "content/knowledge/core-tracker.md",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-statuses.png",
      "alt": "Gli otto stati del ticket nel selettore, con Backlog selezionato.",
      "caption": "La spunta indica lo stato attuale. Scegli quello che rispecchia lo stato effettivo del lavoro.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-statuses-steps"
  ]
}
---

## Cambiare uno stato {#issue-statuses}

Apri il selettore di stato del ticket o usa le azioni di stato del tabellone. In una vista kanban, spostare il lavoro tra colonne cambia il ticket stesso; cambiare un filtro modifica solo ciò che vedi. Verifica il nuovo stato nel pannello di dettaglio dopo lo spostamento.

| Stato | Uso |
| --- | --- |
| Triaggio | Lavoro in arrivo in attesa di valutazione. |
| Backlog | Lavoro conservato ma non ancora scelto per iniziare. |
| Da fare | Lavoro scelto da svolgere. |
| In corso | Lavoro in esecuzione. |
| In revisione | Implementazione in attesa di revisione. |
| Fatto | Risultato previsto completato. |
| Annullata | Lavoro chiuso senza consegna. |
| Duplicato | Lavoro rappresentato da un altro ticket. |

Gli stati sono fissi e non vengono personalizzati per progetto. Triaggio e Duplicato sono disponibili nei selettori, ma sono deliberatamente assenti dalle normali colonne kanban. Una colonna mancante non dimostra che lo stato o il ticket non esistano.


![Gli otto stati del ticket nel selettore, con Backlog selezionato.](/documentation/it/issue-statuses.png)

## Stati finali e verifica {#closed-work}

Fatto, Annullata e Duplicato sono stati finali per il monitoraggio: smettono di bloccare i ticket dipendenti ed escono dai conteggi attivi. Chiudere come Annullata non significa che l’attività sia stata consegnata. Quando contrassegni un duplicato, identifica il ticket mantenuto per dare una destinazione chiara alla discussione e al progresso.

Controlla i filtri se un ticket scompare dopo la chiusura. Riaprilo tramite identificativo per controllare il risultato e cambiare stato se l’hai chiuso per errore. Per il lavoro bloccato, controlla anche la direzione della dipendenza: cambiare lo stato di un ticket non ne riscrive descrizione o piano.
