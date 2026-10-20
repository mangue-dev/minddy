---
{
  "id": "objectives",
  "locale": "it",
  "title": "Obiettivi",
  "summary": "Definisci il risultato di un progetto, collega il lavoro e interpreta avanzamento, dipendenze e slancio.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-693 project roles; MIN-728 one editor engine; MIN-736 closed columns hidden by default; MIN-741 creation dialogs; MIN-742 resources; MIN-749 relation shortcut R; UI/UX refinements batch: Create in project shortcut",
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
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained); agent:/root (MIN-670 source, it wording and new-control review; existing procedural evidence retained); agent:/root (UI refinements source and control review; unchanged procedural evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 objective board status filter: source review of the project page and objective header; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared lead and relations and the Create objective button; objectives-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen reader-objectives) and inspected; no other browser walkthrough); agent:/root (MIN-742 resources: source and unit-test review of resource mentions scoped to their surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of the Command/Ctrl+Shift+P Create in shortcut, its caret restoration and key hint in components/creation-project-select.tsx and the create.changeProject entry in lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (it changed-passage review against English revision 7; earlier unchanged prose reviews retained); agent:/root (MIN-670 source, it wording and new-control review; existing procedural evidence retained); agent:/root (it changed-passage parity and localized-label review); agent:/root/min693_it with agent:/root (it MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (it translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it MIN-736 added sentence with catalog status labels; agent review, not human acceptance); agent:/root (it MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (it MIN-742 added sentence with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (it translation of MIN-749 added sentences, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it translation of the Create in shortcut changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Seguire un risultato con un obiettivo",
    "Interpretare dipendenze e andamento degli obiettivi"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-objectives.png",
      "alt": "Finestra di creazione obiettivo non inviata nel progetto Aurora con un nome di risultato d’esempio e il pulsante Crea obiettivo.",
      "caption": "Definisci il risultato prima di scegliere responsabile, data limite e stato. Questa finestra non ha creato un secondo obiettivo.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Un obiettivo raccoglie i ticket di un progetto per seguire un risultato. Le sue dipendenze spiegano i vincoli, mentre progresso e andamento aiutano a interpretare il lavoro collegato. Questi indicatori non sostituiscono la verifica del risultato né garantiscono una data di consegna.

## Seguire un risultato con un obiettivo {#objectives}

Apri la destinazione degli obiettivi del progetto e crea un obiettivo. Se lo crei da un altro punto dell’app, scegli il suo progetto in **Crea in**, in alto a sinistra del modulo (accanto al titolo **Nuovo obiettivo** sul telefono); cambiare progetto rimuove il responsabile e le relazioni scelti per il precedente. Su un computer, Command/Ctrl+Maiusc+P apre questo menu anche mentre scrivi il nome o la descrizione; quando scegli un progetto o chiudi il menu, il cursore torna esattamente dov’era. La pillola mostra questa scorciatoia, che esiste solo quando si può scegliere più di un progetto; sul telefono non viene indicata alcuna scorciatoia. Dai un nome al risultato desiderato, aggiungi contesto utile e imposta i campi disponibili per responsabile, data obiettivo, colore e stato. Un obiettivo appartiene a un progetto ed è distinto da un ciclo personale che comprende più progetti. La persona responsabile segue il risultato; sceglierla non trasferisce la proprietà del progetto. Solo il proprietario o un Membro può essere responsabile di un obiettivo, e un responsabile il cui ruolo diventa Lettore viene rimosso dall’obiettivo.

La descrizione dell’obiettivo e i suoi commenti usano lo stesso editor delle pagine del progetto, senza le maniglie dei blocchi: digita `/` per inserire blocchi e `@` per menzionare una persona, un ticket, un obiettivo o una pagina. Il menu `@` elenca anche le risorse allegate a ciò che stai scrivendo: il ticket o l’obiettivo per la descrizione e il piano, un commento per i propri file o una finestra di creazione per i file aggiunti lì. Una menzione di una risorsa allegata altrove appare come **Non disponibile**. Più persone possono modificare la descrizione contemporaneamente, con il cursore di ciascuna mostrato con il suo nome e il suo colore. Seleziona del testo per formattarlo o aggiungere un link. Incolla o trascina un'immagine, oppure scegli **Immagine** nel menu `/`, per inserirla nella descrizione.

Apri ogni ticket pertinente e scegli l’obiettivo nelle sue proprietà oppure usa i controlli dei ticket dell’obiettivo. Verifica che il lavoro previsto compaia sotto l’obiettivo. Usa discussione e risorse per decisioni e pagine di riferimento che riguardano l’intero risultato.

![Finestra di creazione obiettivo non inviata nel progetto Aurora con un nome di risultato d’esempio e il pulsante Crea obiettivo.](/documentation/it/reader-objectives.png)

### Leggere il progresso prima di chiudere {#objective-progress}

Esamina i ticket completati e attivi insieme al progresso dell’obiettivo. Un indicatore riassume il lavoro collegato; non può stabilire se un risultato di prodotto sia accettabile. Controlla attività mancanti e lavoro annullato o duplicato prima di segnare l’obiettivo come completato. Il tabellone dell’obiettivo mostra prima il lavoro aperto: seleziona **Fatto** e **Annullata** nel suo filtro **Stato** per rivedere lì i ticket chiusi.

Usa il ciclo di vita dell’obiettivo per distinguere risultati pianificati, in corso, completati e annullati. Una data obiettivo è un traguardo, mentre una previsione è una stima basata sull’attività. Se l’obiettivo appare vuoto, controlla l’associazione dei ticket e i filtri della vista invece di ricrearlo. L’eliminazione di un obiettivo usa il cestino recuperabile e non è un normale cambio di stato.

## Interpretare dipendenze e andamento degli obiettivi {#objective-dependencies-and-momentum}

Apri l’obiettivo e le sue relazioni. Nella pagina dell’obiettivo, fuori da un campo di testo, R apre la scelta del tipo di relazione. Controlla quale risultato dipende da un altro e leggi le relazioni di blocco tra ticket quando spiegano il vincolo. L’organizzazione padre-figlio, un collegamento correlato e una dipendenza di blocco rispondono a domande diverse; controlla la direzione prima di cambiare una relazione.

Una relazione di blocco può collegare un ticket o un altro obiettivo a questo obiettivo, all’interno dello stesso progetto. I suoi ticket aperti ereditano il blocco irrisolto: la relazione mostrata identifica sia il prerequisito effettivo sia l’obiettivo che lo trasmette. Non viene salvata una nuova relazione diretta su ogni ticket. Chiudere il prerequisito o l’obiettivo bloccato, oppure rimuovere un ticket da quell’obiettivo, elimina il relativo blocco ereditato. Risolvi il prerequisito effettivo o correggi una relazione superata. Cambiare solo la data obiettivo non completa i ticket che lo bloccano.

### Interpretare il segnale di andamento {#momentum}

Il pannello Ritmo appare solo quando l’obiettivo ha una data obiettivo. Rimuovendo questa data si nasconde il pannello, compresi lo storico, le statistiche sul ritmo e la data di fine stimata. Aggiungi una data obiettivo per mostrarlo di nuovo; l’indicatore di avanzamento complessivo resta disponibile anche senza una data.

L’andamento riassume il lavoro completato di recente. Può essere in accelerazione, costante, in rallentamento o fermo, con stati separati per obiettivi non iniziati, completati e annullati. Usalo per individuare un risultato che richiede attenzione, poi leggi i ticket e l’attività sottostanti.

La data di fine stimata richiede almeno due completamenti, una settimana intera osservata, impegno consegnato positivo e lavoro rimanente. Contribuiscono solo i ticket attualmente collegati; un completamento precedente alla creazione dell’obiettivo non produce un andamento recente artificiale.

Con una data obiettivo valida, lo storico va dalla creazione a quella data e il ritmo di consegna usa il tempo osservato dalla creazione, compreso il tempo dopo una scadenza non rispettata. Se è impostata una data obiettivo ma non definisce un periodo valido successivo alla creazione, il calcolo usa uno storico mobile di otto settimane e una finestra di previsione di 28 giorni.

Poco storico o un recente cambio di ambito ne riducono l’utilità. La stima non è una scadenza promessa e non comprende il lavoro invisibile che non hai collegato. Confronta data obiettivo, lavoro rimanente e vincoli reali prima di cambiare gli impegni.


## Scegliere un obiettivo per un feedback {#objective-feedback}

Nelle proprietà dell’obiettivo, il numero di feedback apre la sezione Feedback del progetto filtrata per questo obiettivo, incluse le richieste risolte. Anche zero viene mostrato. Le richieste restano separate dall’avanzamento dei ticket e dallo slancio.

Un feedback può essere associato a un obiettivo senza diventare un ticket. Nei feedback del progetto, scegli l’obiettivo nelle proprietà della richiesta. Non contribuiscono all’avanzamento o alla dinamica dei ticket. La conversione eredita obiettivo e categorie, salvo le modifiche nel modulo di creazione.
