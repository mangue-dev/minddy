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
  "revision": 24,
  "sourceRevision": 23,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-31",
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-field-shortcuts.ts",
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
      "lib/keyboard/shortcuts.ts",
      "lib/objective-order.ts",
      "components/objective-label.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "app/(app)/projects/[id]/page.tsx",
      "components/objectives/objectives-page.tsx",
      "components/app-sidebar.tsx",
      "lib/objective-forecast.ts",
      "lib/server/objective-forecast.ts",
      "app/api/objectives/[id]/forecast/route.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (estimated finish date now computed on the server from contributors' activity hours, cross-project throughput and allocation to the objective, with the objective's own pace as fallback, MIN-876; checked against lib/objective-forecast.ts, lib/server/objective-forecast.ts, app/api/objectives/[id]/forecast/route.ts and components/objective-momentum.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the momentum estimate)",
    "language": "agent:claude-code (it translation of the changed passage, reviewed against en revision 23; agent review, not human acceptance)",
    "date": "2026-10-31"
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Un obiettivo raccoglie i ticket di un progetto per seguire un risultato. Le sue dipendenze spiegano i vincoli, mentre progresso e andamento aiutano a interpretare il lavoro collegato. Questi indicatori non sostituiscono la verifica del risultato né garantiscono una data di consegna.

## Seguire un risultato con un obiettivo {#objectives}

Apri la destinazione degli obiettivi del progetto e crea un obiettivo. Se lo crei da un altro punto dell’app, scegli il suo progetto in **Crea in**, in alto a sinistra del modulo (accanto al titolo **Nuovo obiettivo** sul telefono); cambiare progetto rimuove il responsabile e le relazioni scelti per il precedente. Su un computer, Command/Ctrl+Maiusc+P apre questo menu anche mentre scrivi il nome o la descrizione; quando scegli un progetto o chiudi il menu, il cursore torna esattamente dov’era. La pillola mostra questa scorciatoia, che esiste solo quando si può scegliere più di un progetto; sul telefono non viene indicata alcuna scorciatoia. Dai un nome al risultato desiderato, aggiungi contesto utile e imposta i campi disponibili per responsabile, data obiettivo, colore e stato. Su un computer, gli stessi tasti dei campi di un ticket li aprono non appena il cursore lascia il nome e la descrizione: S lo stato, A il responsabile, D la data obiettivo, R una relazione e C il colore; il tooltip di ogni selettore mostra il suo tasto. Un obiettivo appartiene a un progetto ed è distinto da un ciclo personale che comprende più progetti. La persona responsabile segue il risultato; sceglierla non trasferisce la proprietà del progetto. Solo il proprietario o un Membro può essere responsabile di un obiettivo, e un responsabile il cui ruolo diventa Lettore viene rimosso dall’obiettivo.

La descrizione dell’obiettivo e i suoi commenti usano lo stesso editor delle pagine del progetto, senza le maniglie dei blocchi: digita `/` per inserire blocchi e `@` per menzionare una persona, un ticket, un obiettivo o una pagina. Il menu `@` elenca anche le risorse allegate a ciò che stai scrivendo: il ticket o l’obiettivo per la descrizione e il piano, un commento per i propri file o una finestra di creazione per i file aggiunti lì. Una menzione di una risorsa allegata altrove appare come **Non disponibile**. Più persone possono modificare la descrizione contemporaneamente, con il cursore di ciascuna mostrato con il suo nome e il suo colore. Seleziona del testo per formattarlo o aggiungere un link. Incolla o trascina un'immagine, oppure scegli **Immagine** nel menu `/`, per inserirla nella descrizione. Sul telefono, la barra sopra la tastiera sostituisce la barra di selezione e il menu `@` digitato; la [guida alle pagine](/it/documentazione/pages#editor-formatting) la descrive.

Apri ogni ticket pertinente e scegli l’obiettivo nelle sue proprietà oppure usa i controlli dei ticket dell’obiettivo. Il selettore degli obiettivi mostra gli obiettivi aperti prima di quelli fatti e annullati; in ciascun gruppo vengono prima quelli che hanno ricevuto più ticket negli ultimi 30 giorni. Ognuno mostra il proprio stato e il proprio nome nel suo colore. Verifica che il lavoro previsto compaia sotto l’obiettivo. Usa discussione e risorse per decisioni e pagine di riferimento che riguardano l’intero risultato.

![Finestra di creazione obiettivo non inviata nel progetto Aurora con un nome di risultato d’esempio e il pulsante Crea obiettivo.](/documentation/it/reader-objectives.png)

Nella pagina degli obiettivi, tieni premuto Maiusc e fai clic sugli obiettivi per selezionarne più di uno; un clic nello spazio vuoto dell’elenco annulla la selezione. **Azioni** nella barra mobile, o Command+K su macOS o Ctrl+K sugli altri sistemi, offre **Cambia stato**, **Cambia responsabile**, **Cambia colore** e **Sposta nel cestino**, che chiede prima una conferma. **Chiedi a Numo** apre Numo con tutti gli obiettivi selezionati nel suo contesto.

### Leggere il progresso prima di chiudere {#objective-progress}

Esamina i ticket completati e attivi insieme al progresso dell’obiettivo. Un indicatore riassume il lavoro collegato; non può stabilire se un risultato di prodotto sia accettabile. Controlla attività mancanti e lavoro annullato o duplicato prima di segnare l’obiettivo come completato. Il tabellone dell’obiettivo mostra prima il lavoro aperto: seleziona **Completato** e **Annullato** nel suo filtro **Stato** per rivedere lì i ticket chiusi. Su un computer, finché il tabellone mostra i ticket di un obiettivo, la barra laterale resta sull’elenco degli obiettivi, sotto la riga per tornare indietro **Obiettivi**, con quell’obiettivo evidenziato; scegli un altro obiettivo in quell’elenco per passare il tabellone a quello.

Usa il ciclo di vita dell’obiettivo per distinguere risultati pianificati, in corso, completati e annullati. Una data obiettivo è un traguardo, mentre una previsione è una stima basata sull’attività. Se l’obiettivo appare vuoto, controlla l’associazione dei ticket e i filtri della vista invece di ricrearlo. L’eliminazione di un obiettivo usa il cestino recuperabile e non è un normale cambio di stato.

## Interpretare dipendenze e andamento degli obiettivi {#objective-dependencies-and-momentum}

Apri l’obiettivo e le sue relazioni. Nella pagina dell’obiettivo, fuori da un campo di testo, R apre la scelta del tipo di relazione. Scelto il tipo, il ticket o l’obiettivo si sceglie nella palette dei comandi, come su un ticket. Controlla quale risultato dipende da un altro e leggi le relazioni di blocco tra ticket quando spiegano il vincolo. L’organizzazione padre-figlio, un collegamento correlato e una dipendenza di blocco rispondono a domande diverse; controlla la direzione prima di cambiare una relazione.

Una relazione di blocco può collegare un ticket o un altro obiettivo a questo obiettivo, all’interno dello stesso progetto. I suoi ticket aperti ereditano il blocco irrisolto: la relazione mostrata identifica sia il prerequisito effettivo sia l’obiettivo che lo trasmette. Non viene salvata una nuova relazione diretta su ogni ticket. Chiudere il prerequisito o l’obiettivo bloccato, oppure rimuovere un ticket da quell’obiettivo, elimina il relativo blocco ereditato. Risolvi il prerequisito effettivo o correggi una relazione superata. Cambiare solo la data obiettivo non completa i ticket che lo bloccano.

### Interpretare il segnale di andamento {#momentum}

Il pannello Ritmo appare solo quando l’obiettivo ha una data obiettivo. Rimuovendo questa data si nasconde il pannello, compresi lo storico, le statistiche sul ritmo e la data di fine stimata. Aggiungi una data obiettivo per mostrarlo di nuovo; l’indicatore di avanzamento complessivo resta disponibile anche senza una data.

L’andamento riassume il lavoro completato di recente. Può essere in accelerazione, costante, in rallentamento o fermo, con stati separati per obiettivi non iniziati, completati e annullati. Usalo per individuare un risultato che richiede attenzione, poi leggi i ticket e l’attività sottostanti.

La data di fine stimata parte dalle persone che svolgono il lavoro. Per ogni persona assegnataria di ticket collegati, minddy ricava le sue abituali ore di attività dai momenti in cui completa i ticket, misura l’impegno che consegna in tutti i suoi progetti e stima la quota di quell’impegno dedicata a questo obiettivo in base ai completamenti recenti e al lavoro aperto. La stima avanza solo durante quelle ore di attività: notti e fine settimana non aggiungono progressi, e il lavoro non assegnato viene ripartito tra chi contribuisce. Il calcolo avviene sul server: i ticket degli altri progetti e i dati di ogni persona non vengono mai mostrati, solo la data risultante.

Una persona viene considerata appena ha completato almeno due ticket nelle ultime sei settimane. Se non ce n’è nessuna, la stima torna al ritmo proprio dell’obiettivo, che richiede almeno due completamenti, una settimana intera osservata, impegno consegnato positivo e lavoro rimanente. Contribuiscono all’andamento solo i ticket attualmente collegati; un completamento precedente alla creazione dell’obiettivo non produce un andamento recente artificiale.

Con una data obiettivo valida, lo storico va dalla creazione a quella data e il ritmo di consegna usa il tempo osservato dalla creazione, compreso il tempo dopo una scadenza non rispettata. Se è impostata una data obiettivo ma non definisce un periodo valido successivo alla creazione, il calcolo usa uno storico mobile di otto settimane e una finestra di previsione di 28 giorni.

Poco storico o un recente cambio di ambito ne riducono l’utilità. La stima non è una scadenza promessa e non comprende il lavoro invisibile che non hai collegato. Confronta data obiettivo, lavoro rimanente e vincoli reali prima di cambiare gli impegni.


## Scegliere un obiettivo per un feedback {#objective-feedback}

Nelle proprietà dell’obiettivo, il numero di feedback apre la sezione Feedback del progetto filtrata per questo obiettivo, incluse le richieste risolte. La riga è nascosta finché nessuna richiesta appartiene all’obiettivo. Le richieste restano separate dall’avanzamento dei ticket e dallo slancio.

Un feedback può essere associato a un obiettivo senza diventare un ticket. Nei feedback del progetto, scegli l’obiettivo nelle proprietà della richiesta. Non contribuiscono all’avanzamento o alla dinamica dei ticket. La conversione eredita obiettivo e categorie, salvo le modifiche nel modulo di creazione.
