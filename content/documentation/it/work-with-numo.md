---
{
  "id": "work-with-numo",
  "locale": "it",
  "title": "Completare un’attività del progetto con Numo",
  "summary": "Aprire una conversazione contestuale, scegliere un modello e verificare il risultato.",
  "topic": "Numo e integrazioni",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "numo-permissions-and-approvals",
    "delegate-code-work",
    "recover-numo-work",
    "numo-mcp-connections",
    "external-minddy-mcp"
  ],
  "aliases": [
    "agents-and-mcp"
  ],
  "tags": [],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/work-with-numo-workflow.png",
      "alt": "Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.",
      "caption": "Conversazione dimostrativa esistente, tradotta per la visualizzazione. La risposta salvata cita AUR-11 e AUR-7; la cattura non attesta una nuova esecuzione.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow"
  ]
}
---

## Partire dal lavoro {#work-with-numo}
Apri il ticket o il progetto interessato e usa il pulsante flottante di Numo. La pagina corrente diventa il contesto. Le azioni contestuali che affidano lavoro a Numo aprono lo stesso pannello. Servono accesso al progetto e budget IA disponibile oppure una chiave personale compatibile.

1. Controlla il contesto nell’area di scrittura. Specifica il ticket quando sono coinvolti più elementi.
2. Scegli modello e livello di ragionamento della conversazione. Il worker di codice usa impostazioni dell’account separate.
3. Invia una richiesta circoscritta, per esempio: «Leggi questo ticket e proponi criteri di accettazione. Non modificarne lo stato».
4. Leggi la risposta e apri i collegamenti ai ticket o alle fonti. Se hai chiesto una modifica, verifica l’oggetto aggiornato.

![Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.](/documentation/it/work-with-numo-workflow.png)


## Continuare o delegare {#continue}
L’elenco conserva le conversazioni precedenti. Continua quella che contiene le decisioni utili. Per modificare un repository, Numo delega a un worker in una sandbox del server e mostra avanzamento, file, controlli e pull request. Non lavora nella tua cartella locale.

Se Numo richiede informazioni, invia la scelta prima di attendere il proseguimento delle attività dipendenti. Una scheda di consumo o errore spiega l’interruzione. Verifica ogni scrittura esterna prima di chiedere di ripeterla.
