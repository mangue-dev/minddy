---
{
  "id": "feedback-to-issue",
  "locale": "it",
  "title": "Unire feedback e collegarlo alla consegna",
  "summary": "Scegliere richiesta canonica, collegare lavoro e verificare stato pubblico.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
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
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/feedback-to-issue-workflow.png",
      "alt": "Feedback collegato a una nuova issue con stato Pianificato.",
      "caption": "La promozione di questo esempio ha creato una issue collegata con stato Da fare. Il feedback pubblico è passato automaticamente a Pianificato.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Risolvere duplicati {#feedback-to-issue}

Come membro del progetto, apri la richiesta e scegli di unirla a una richiesta canonica esistente nello stesso progetto. Leggi prima entrambi i bisogni: parole simili non dimostrano che il risultato atteso sia lo stesso. La richiesta corrente diventa il duplicato, i voti vengono uniti per identità e il duplicato reindirizza alla richiesta canonica. Controlla l’evento di unione nell’attività; il comando di annullamento usa quell’evento. Rifiuta un suggerimento IA errato anziché accettarlo solo per svuotare la coda.


## Creare o collegare lavoro {#work}

Trasforma la richiesta in una nuova issue se il lavoro non è già tracciato. Controlla i campi di creazione prima di confermare; senza campi forniti, la promozione crea per impostazione predefinita lavoro nel backlog. Se esiste già una issue, usa invece il collegamento. Un feedback già collegato non può essere promosso di nuovo. Rimuovere il collegamento conserva l’ultimo stato pubblico e interrompe la relazione con la issue.

Lo stato collegato segue quello della issue: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Spostare il lavoro nel backlog riapre anche lo stato del feedback. Dopo una modifica, controlla la issue collegata e la richiesta senza sessione.

Le notifiche al team per nuovo feedback dipendono dalla fonte e dal passaggio di revisione. Non promettere a chi vota un’email automatica per ogni unione o aggiornamento della issue; può consultare stato pubblico e risposte in Il mio feedback. Il collegamento mostra l’avanzamento senza esporre la issue privata.

![Feedback collegato a una nuova issue con stato Pianificato.](/documentation/it/feedback-to-issue-workflow.png)
