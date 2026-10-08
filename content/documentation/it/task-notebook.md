---
{
  "id": "task-notebook",
  "locale": "it",
  "title": "Raccogliere note nel taccuino privato",
  "summary": "Scrivi note rapide e trasforma un’attività selezionata in lavoro di progetto quando serve monitorarla.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/productivity.md",
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "work-with-numo",
    "create-and-organize-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-task-notebook.png",
      "alt": "Attività personali dimostrative tradotte nel taccuino.",
      "caption": "Il taccuino segue passaggi personali fuori dalla gerarchia dei ticket del progetto. Gli stati delle attività d’esempio restano invariati.",
      "revision": 2,
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
    "task-notebook-steps"
  ]
}
---

## Annotare un'idea {#task-notebook}

Apri il taccuino delle attività dai comandi personali dell’applicazione, oppure usa Command+Maiusc+K su macOS e Ctrl+Maiusc+K su Windows/Linux quando il focus è fuori dal testo modificabile. È uno spazio per appunti e caselle di spunta che appartiene al tuo account. Aggiungi il contesto, organizzalo in sezioni se utile e usa le caselle delle attività per seguire piccoli passi personali prima che diventino ticket di un progetto.

Il taccuino è privato. Usa una pagina del progetto per le informazioni che i colleghi devono condividere. Numo può leggere o aggiornare il taccuino quando glielo chiedi, ma l'appartenenza di un'altra persona al tuo progetto non rende condivisi i tuoi appunti.

![Attività personali dimostrative tradotte nel taccuino.](/documentation/it/work-task-notebook.png)

## Portare un'attività nel progetto {#promote-note}

Apri il menu dell'attività e scegli l'azione per portarla nel progetto quando l'appunto diventa lavoro di progetto. Il taccuino si chiude e Numo si apre con una richiesta già preparata che contiene l'attività e le sue sottoattività. Se stai consultando un progetto, viene utilizzato quel progetto; da una schermata globale, specifica il progetto di destinazione nella conversazione. Controlla la richiesta prima di inviarla. Servono utilizzo IA disponibile o una chiave personale compatibile. La sola apertura non ha ancora creato un ticket. Quando Numo conferma la creazione, apri il ticket e controllane identificativo, ambito e proprietà. Aggiungi le condizioni di accettazione mancanti per conservare il contesto necessario.

Se la creazione fallisce o il risultato non è chiaro dopo un errore di rete, cerca il ticket prima di ripetere l'operazione. Quando chiedi a Numo di modificare un'attività, mantieni intatte le altre sezioni. Controlla che abbia modificato la casella prevista senza sostituire l'intero taccuino.
