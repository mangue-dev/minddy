---
{
  "id": "task-notebook",
  "locale": "it",
  "title": "Taccuino delle attività",
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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Raccogliere note nel taccuino privato"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-task-notebook.png",
      "alt": "Attività personali dimostrative tradotte nel taccuino.",
      "caption": "Il taccuino segue passaggi personali fuori dalla gerarchia dei ticket del progetto. Gli stati delle attività d’esempio restano invariati.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Annotare un'idea {#task-notebook}

Apri il taccuino delle attività dai comandi personali dell’applicazione, oppure usa Command+Maiusc+K su macOS e Ctrl+Maiusc+K su Windows/Linux quando il focus è fuori dal testo modificabile. È uno spazio per appunti e caselle di spunta che appartiene al tuo account. Aggiungi il contesto, organizzalo in sezioni se utile e usa le caselle delle attività per seguire piccoli passi personali prima che diventino ticket di un progetto.

Per ritrovare un’attività, apri la palette dei comandi con Command+K su macOS o Ctrl+K su Windows/Linux e digita alcune parole dell’attività. Le attività ancora da fare compaiono sotto **Taccuino delle attività**, con la loro sezione; le attività completate o annullate e le domande non compaiono. Scegline una per aprire il taccuino su quell’attività. Finché non digiti nulla, la palette non elenca le attività del taccuino.

Il taccuino usa lo stesso editor delle pagine del progetto, con le stesse maniglie dei blocchi: passa sopra un blocco per trascinarlo, aprirne il menu o aggiungere un blocco con **+**. Digita `/` per inserire un'attività, proposta per prima, o un titolo, un elenco, una citazione, un **Riquadro**, un blocco di codice, un **Blocco a scomparsa** o un divisore, oppure scegli **Detta un'attività** per dettare le attività a voce. Il taccuino resta salvato in Markdown, quindi Numo e gli agenti collegati leggono le stesse attività e gli stessi stati. Seleziona del testo per formattarlo o aggiungere un link. Incolla o trascina un'immagine, oppure scegli **Immagine** nel menu `/`, per inserirla in una nota. Gli altri tipi di file vanno nelle pagine.

Il menu **Azioni del taccuino** (`…`) offre **Copia tutto come prompt**, che copia l’intero taccuino per il tuo agente di programmazione, e **Rimuovi le attività completate e annullate**. La rimozione chiede una conferma, elimina le attività completate e annullate insieme ai titoli che restano vuoti e conserva le attività da fare o in corso. Per copiare meno, usa **Copia la sezione come prompt** su un titolo o **Copia come prompt** su un’attività. Se **Avvia il ticket o l'attività quando ne copio il prompt** è attivo in **Impostazioni account** → **Ticket**, la copia porta anche in corso le attività in attesa copiate.

Il taccuino è privato. Usa una pagina del progetto per le informazioni che i colleghi devono condividere. Numo può leggere o aggiornare il taccuino quando glielo chiedi, ma l'appartenenza di un'altra persona al tuo progetto non rende condivisi i tuoi appunti.

![Attività personali dimostrative tradotte nel taccuino.](/documentation/it/work-task-notebook.png)

## Portare un'attività nel progetto {#promote-note}

Apri il menu dell'attività e scegli **Promuovi a ticket** quando l'appunto diventa lavoro di progetto. Il taccuino si chiude e Numo si apre con una richiesta già preparata che contiene l'attività e le sue sottoattività. Se stai consultando un progetto, viene utilizzato quel progetto; da una schermata globale, specifica il progetto di destinazione nella conversazione. Controlla la richiesta prima di inviarla. Servono utilizzo IA disponibile o una chiave personale compatibile. La sola apertura non ha ancora creato un ticket. Quando Numo conferma la creazione, apri il ticket e controllane identificativo, ambito e proprietà. Aggiungi le condizioni di accettazione mancanti per conservare il contesto necessario. La richiesta preparata chiede anche a Numo di rimuovere l'attività dal taccuino una volta creato il ticket: cercala quindi nel ticket anziché nel taccuino.

Se la creazione fallisce o il risultato non è chiaro dopo un errore di rete, cerca il ticket prima di ripetere l'operazione. Quando chiedi a Numo di modificare un'attività, mantieni intatte le altre sezioni. Controlla che abbia modificato la casella prevista senza sostituire l'intero taccuino.
