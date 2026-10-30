---
{
  "id": "issues",
  "locale": "it",
  "title": "Ticket",
  "summary": "Crea e organizza i ticket, segui il loro ciclo di vita, gestisci dipendenze e piani e importa o modifica il lavoro in blocco.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 44,
  "sourceRevision": 44,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-753 drafts tray; MIN-750 Smart Fill re-evaluation; MIN-804 parent and sub-issue relations; MIN-798 Smart Fill titles; MIN-809 Smart Fill split button; MIN-813 Smart Fill title on request; MIN-833 selection right-click menu",
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
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "lib/smart-fill-fields.ts",
      "lib/server/smart-fill-reevaluation.ts",
      "lib/server/smart-fill-ownership.ts",
      "lib/server/smart-fill-title.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/palette-picker-rows.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/server/assistant/prompt.ts",
      "components/drafts-tray.tsx",
      "lib/use-all-drafts.ts",
      "lib/use-held-draft.ts",
      "lib/issue-hierarchy.ts",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "lib/creation-relations.ts",
      "lib/action-menu-search.ts",
      "components/use-issue-menu-actions.tsx",
      "lib/use-bulk-selection-actions.ts",
      "components/relation-chips.tsx",
      "components/sub-issues-section.tsx",
      "lib/create-context.tsx"
    ]
  },
  "review": {
    "revision": 44,
    "fact": "agent:claude-code (inline sub-issue field replaced by the Create a sub-issue split button, which opens the issue creation dialog with the parent set, and its Ask Numo to split the issue menu entry, hidden from Readers, checked against components/sub-issues-section.tsx, lib/create-context.tsx and the IssueUI catalog entries; remove button with the same confirmation on each relation of a board card relation chip popover, none for relations inherited through an objective, checked against components/relation-chips.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the sub-issues figure still shows the former inline field)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Creare e modificare un ticket",
    "Valutare il lavoro in arrivo nel triage",
    "Seguire il ciclo di vita di un ticket",
    "Discutere il lavoro e allegare il contesto",
    "Collegare dipendenze e ticket correlati",
    "Suddividere un ticket in sottoticket",
    "Mantenere un piano di implementazione",
    "Ripetere un ticket dopo il completamento",
    "Aggiornare più ticket insieme",
    "Importare un backlog CSV dopo la verifica"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/it/new-issue.png",
      "alt": "Bozza non inviata nel progetto Aurora con titolo, descrizione, proprietà selezionabili manualmente e il pulsante Crea AUR-21.",
      "caption": "Descrivi il risultato atteso e scegli le proprietà utili prima di creare il ticket.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-27",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/it/triage-incoming.png",
      "alt": "Ticket dimostrativo AUR-19 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.",
      "caption": "Leggi la segnalazione ricevuta prima di accettarla, rifiutarla o collegare un duplicato.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        786
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-statuses.png",
      "alt": "Gli otto stati del ticket nel selettore, con Backlog selezionato.",
      "caption": "La spunta indica lo stato attuale. Scegli quello che rispecchia lo stato effettivo del lavoro.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        288,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-resources.png",
      "alt": "Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.",
      "caption": "Controlla la destinazione prima di aggiungere la risorsa. Questo link d’esempio non è stato inviato.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-dependencies.png",
      "alt": "La palette dei comandi mostra i ticket che possono bloccare questo, con la domanda della relazione nel campo di ricerca.",
      "caption": "Scegli la direzione della relazione prima della destinazione. Il selettore è mostrato senza inviare la relazione.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        788,
        506
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-sub-issues.png",
      "alt": "Campo per creare un sottoticket in un ticket principale dimostrativo.",
      "caption": "Il campo crea un figlio di questo ticket; ogni figlio conserva stato e discussione propri.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-implementation-plan.png",
      "alt": "Piano dimostrativo con due attività di lavoro completate su sei.",
      "caption": "Il piano salvato distingue passaggi completati, attivi e in attesa. L’avanzamento non dimostra l’esecuzione dell’attività di codice fittizia.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1416
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-date-recurrence.png",
      "alt": "Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.",
      "caption": "La modalità ricorrente mostra la cadenza settimanale. Conferma la prima scadenza prima di creare il ticket.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        324,
        540
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/import-issues-preview-workflow.png",
      "alt": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.",
      "caption": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate. L’importazione non è stata inviata; la pianificazione IA facoltativa è stata bloccata per la cattura.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/it/file-preview.png",
      "alt": "Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica, Rinomina e Rimuovi.",
      "caption": "Il visualizzatore condiviso colloca Chiudi sotto l’anteprima. Il menu Azioni del file offre Scarica e, con i permessi necessari, Rinomina e Rimuovi.",
      "revision": 44,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

Un ticket descrive un’attività del progetto, dal lavoro in arrivo alla verifica del risultato. Puoi aggiungere discussione, risorse, dipendenze, sottoticket e un piano, poi gestire ricorrenze o azioni collettive. L’importazione CSV crea nuovi ticket e richiede il proprietario del progetto.

## Creare e modificare un ticket {#create-an-issue}

Devi essere il proprietario o un Membro del progetto di destinazione; i lettori possono aprire i ticket ma non crearli né modificarli. Apri il progetto e il controllo per creare un ticket. Inserisci un titolo che identifichi il lavoro, poi aggiungi contesto, risultato previsto e vincoli nella descrizione. Titolo e descrizione funzionano come un unico testo: su computer, la freccia giù sull'ultima riga del titolo passa alla prima riga della descrizione, la freccia su torna indietro, e il cursore mantiene più o meno la sua posizione sulla riga. Maiusc+Invio nel titolo passa alla descrizione; anche Invio, a meno che tu non abbia scelto Invio come scorciatoia di invio, nel qual caso crea il ticket. Command/Ctrl+Invio lo crea da entrambi i campi. Le stesse frecce e Invio collegano titolo e descrizione di un ticket, un obiettivo, una pagina o un feedback aperti. Il modulo si apre sul progetto corrente; scegline un altro in **Crea in**, in alto a sinistra del modulo (accanto al titolo **Nuovo ticket** sul telefono), soprattutto quando crei da una vista personale o tra progetti. Su un computer, Command/Ctrl+Maiusc+P apre questo menu anche mentre scrivi il titolo o la descrizione; quando scegli un progetto o chiudi il menu, il cursore torna esattamente dov’era. La pillola mostra questa scorciatoia, che esiste solo quando si può scegliere più di un progetto; sul telefono non viene indicata alcuna scorciatoia. Cambiare progetto rimuove le categorie, l’obiettivo e le relazioni scelti per il precedente. Il pulsante di creazione mostra l’identificativo che riceverà il ticket, ad esempio `MIN-42`, e tiene conto dei ticket creati nel frattempo; il suo menu crea il ticket e copia questo identificativo.

Per creare il ticket manualmente, disattiva Riempimento intelligente se il pulsante è visibile e attivo. Vengono così mostrati i controlli di priorità, impegno, categorie, obiettivo e relazioni, che puoi impostare tu. Per impostare solo alcune di queste proprietà, lascia attivo Riempimento intelligente e apri la freccia accanto al suo pulsante: scegli una proprietà, poi il suo valore. Lì **Relazioni** elenca i tipi di relazione; sceglierne uno apre la palette dei comandi sulle sue possibili destinazioni. Fuori dal titolo e dalla descrizione, il tasto della proprietà apre direttamente il suo selettore: P per la priorità, E per l’impegno, L per le categorie oppure O per l’obiettivo. Il valore scelto resta visibile nel modulo. Riempimento intelligente deduce solo le proprietà lasciate vuote. La scelta vale per questo ticket; riaprendo il modulo di creazione viene ripristinata la preferenza dell’account. È indipendente dagli interruttori di automazione e Smart Assign del progetto. Finché Riempimento intelligente è attivo, dopo il salvataggio [collega anche il ticket ai ticket correlati](#smart-fill-relations), perciò il selettore delle relazioni è nascosto; R lo apre comunque. Le relazioni già scelte restano visibili come pillole nella riga delle proprietà, tra l’assegnatario e la scadenza, e vengono create insieme al ticket.

Imposta le proprietà utili prima di confermare: stato, priorità, impegno, assegnatario, obiettivo, categorie, scadenza e ricorrenza. L’assegnatario è il proprietario del progetto o un Membro, mai un lettore; un obiettivo raggruppa ticket intorno a un risultato del progetto. Puoi lasciare vuote le proprietà opzionali anziché indovinarle. La priorità è **Non definita** o va da bassa a urgente, passando per media e alta; l’impegno è **Non definito** o usa XS, S, M, L e XL.

Quando Smart Assign è attivo nel progetto, il selettore dell'assegnatario mostra **Smart Assign** al posto di **Non assegnato**. Le schede dei ticket e la palette dei comandi seguono la stessa regola, e una scheda senza assegnatario mostra l'icona di Smart Assign. Lascia questa scelta e Smart Assign sceglierà l'assegnatario appena il ticket esce dal triage. Nel pannello del ticket, scegliere **Smart Assign** rimuove l'assegnatario attuale e lascia scegliere di nuovo a Smart Assign. I ticket **Annullato** e **Duplicato** restano **Non assegnato**.

Conferma la creazione e apri il nuovo ticket. Controlla identificativo e progetto. Riapri i selettori delle proprietà per cambiare i valori quando l’attività diventa più chiara. La descrizione spiega il lavoro; il piano di implementazione si mantiene separatamente nella scheda del piano.

Chiudere il modulo conserva ciò che hai scritto: riaprilo per riprendere da dove eri rimasto. Contano solo un titolo, una descrizione o un allegato: un modulo che contiene soltanto proprietà o relazioni riparte vuoto. Se non lo riapri entro due minuti, il suo contenuto viene salvato come bozza e il modulo successivo si apre vuoto; fino ad allora esiste solo in questa finestra, quindi ricaricare o chiudere la finestra lo fa perdere. Aprire una bozza o un modulo precompilato da un altro punto salva prima come bozza ciò che avevi lasciato. Per salvarlo tu, apri il menu accanto al pulsante di creazione e scegli **Salva come bozza**. Le bozze salvate di ticket e obiettivi si raccolgono in **Bozze**, in basso a destra nella finestra, tra Numo e il taccuino delle attività; il pulsante compare solo quando hai una bozza e ne indica il numero. Il suo elenco mostra il titolo e la prima riga della descrizione di ogni bozza. Scegli una bozza per riaprirla nel suo modulo di creazione e completarla; creare il ticket rimuove la bozza. Il pulsante di eliminazione accanto a una bozza chiede prima una conferma, e l’eliminazione non può essere annullata. Su un telefono, apri la palette dei comandi e cerca il titolo della bozza. Le bozze restano su questo dispositivo per 30 giorni, al massimo dieci per tipo; l’elenco mostra solo quelle dei progetti in cui puoi ancora creare ticket.


![Bozza non inviata nel progetto Aurora con titolo, descrizione, proprietà selezionabili manualmente e il pulsante Crea AUR-21.](/documentation/it/new-issue.png)

La descrizione, i commenti e la finestra di creazione del ticket usano lo stesso editor delle pagine del progetto, senza le maniglie dei blocchi. Digita `/` per inserire un titolo, un elenco, un'attività, una citazione, un **Riquadro**, un blocco di codice, un **Blocco a scomparsa** o un divisore, e `@` per menzionare una persona, un ticket, un obiettivo, una pagina, una pull request, una routine, un ciclo, una skill, un server MCP collegato, il taccuino delle attività o una data ([guida alle pagine](/docs/pages#page-editor)). Il menu `@` elenca anche le risorse allegate a ciò che stai scrivendo: il ticket o l’obiettivo per la descrizione e il piano, un commento per i propri file o una finestra di creazione per i file aggiunti lì. Una menzione di una risorsa allegata altrove appare come **Non disponibile**. Più persone possono modificare la stessa descrizione contemporaneamente: il cursore di ciascuna appare con il suo nome e il suo colore, e le modifiche di Numo o di un agente collegato appaiono appena salvate. Numo, gli agenti collegati e le esportazioni CSV leggono il testo in Markdown, che si aggiorna pochi secondi dopo la fine della digitazione. Seleziona del testo per metterlo in grassetto, corsivo, barrato o codice, o per aggiungere un link. Incolla o trascina un'immagine, oppure scegli **Immagine** nel menu `/`, per inserirla nella descrizione; gli altri tipi di file vanno nelle risorse del ticket. Una menzione punta alla sua destinazione, non al suo nome: segue una rinomina e resiste alle modifiche e al copia-incolla in un’altra descrizione, un commento, una pagina o il compositore di Numo. Chi non può aprire la destinazione vede una menzione **Non disponibile**, senza nome né progetto. Sul telefono, la barra sopra la tastiera sostituisce la barra di selezione e il menu `@` digitato; la [guida alle pagine](/it/documentazione/pages#editor-formatting) la descrive.

### Verificare salvataggio e visibilità {#issue-save}

Dopo aver cambiato una proprietà, verifica il valore visualizzato. I filtri possono rimuovere subito un ticket dalla vista attuale quando cambiano assegnatario, stato o categoria. Cerca il suo identificativo o apri il progetto senza quei filtri prima di creare un sostituto.

Se la creazione o il salvataggio falliscono, conserva il testo, leggi l’errore e controlla che appartenenza e destinazione esistano ancora. Prima di riprovare dopo un errore di rete, verifica se il ticket sia già stato creato. Collega le pagine del progetto come risorse aggiornate quando serve il loro contenuto attuale e usa i commenti per discutere l’attività.

### Scegliere cosa fa Riempimento intelligente {#smart-fill-preferences}

Le preferenze di Riempimento intelligente appartengono al tuo account. Apri **Impostazioni account** → **Smart Fill**. Ogni opzione ha il proprio riquadro:

- Nel riquadro **Smart Fill**, **Attiva Smart Fill** attiva o disattiva Riempimento intelligente per il tuo account. Completa priorità, impegno, categorie e obiettivo mancanti; stato, assegnatario e scadenza restano una tua scelta. Gli interruttori dei due riquadri successivi dipendono da questo.
- In **Ticket da compilare**, **Completa i ticket creati** e **Completa i ticket in triage** scelgono quali nuovi ticket completa: quelli che crei e i ticket in triage di cui sei responsabile. **Rivaluta i ticket modificati**, attivo per impostazione predefinita, permette a Riempimento intelligente di [rileggere un ticket](#smart-fill-reevaluation) dopo una modifica del titolo o della descrizione. **Scrivi i titoli mancanti**, attivo per impostazione predefinita, permette a Riempimento intelligente di [scrivere il titolo](#smart-fill-title) di un ticket che ti limiti a descrivere.
- In **Ticket correlati**, **Collega i ticket correlati**, attivo per impostazione predefinita, permette a Riempimento intelligente di [aggiungere relazioni](#smart-fill-relations) dopo il salvataggio di un ticket.
- In **Indicizzazione dei ticket**, **Indicizza i ticket**, attivo per impostazione predefinita e indipendente da Riempimento intelligente, trasforma il titolo e la descrizione dei ticket che crei o modifichi in vettori privati usati per trovare i ticket correlati e per [cercare i ticket per significato](/docs/navigation#search-by-meaning). L’indicizzazione in background dei ticket esistenti di un progetto rispetta sia l’interruttore del proprietario del progetto sia quello dell’autore: un ticket il cui autore l’ha disattivato non viene mai indicizzato. I vettori sono cifrati con il progetto, come il ticket; quelli salvati prima che il progetto iniziasse a cifrare vengono convertiti dal job in background. Con l’interruttore disattivato non viene creato alcun vettore per i tuoi ticket, anche quando qualcun altro li modifica, e la ricerca dei ticket correlati confronta solo le parole. Anche le tue ricerche usano allora solo il testo, senza ricerca per significato. I vettori già creati restano finché il testo non cambia; vengono eliminati appena il testo cambia, o insieme al ticket.

Disattivare un interruttore annulla anche i passaggi non ancora eseguiti. Numo può modificare queste preferenze quando glielo chiedi.

### Quando Riempimento intelligente rilegge un ticket {#smart-fill-reevaluation}

Con **Rivaluta i ticket modificati** attivo, un ticket creato con Riempimento intelligente attivo viene riletto dopo una modifica del titolo o della descrizione. Riempimento intelligente aspetta che il testo resti invariato per cinque minuti, così una serie di modifiche viene letta una sola volta; il passaggio può partire fino a un minuto dopo. Poi ridefinisce priorità, impegno, categorie e obiettivo a partire dal nuovo testo.

Modifica solo le proprietà che nessuno ha scelto a mano: quelle lasciate vuote alla creazione del ticket e che nessuno ha cambiato da allora. Non appena tu, Numo o un agente collegato ne cambiate una, Riempimento intelligente non la tocca più. Non rimuove mai l’obiettivo né tutte le categorie; può svuotare l’impegno quando il testo non descrive più un lavoro stimabile. I ticket creati prima di questa funzione, con Riempimento intelligente disattivato o con tutte le proprietà già impostate non vengono mai riletti.

Ogni modifica compare nell’attività del ticket con Riempimento intelligente come autore, e un ticket spostato in un altro obiettivo compare anche nell’attività di entrambi gli obiettivi. Un passaggio che non trova nulla da cambiare non scrive nulla. Il passaggio conta nella quota **Automazioni** della persona che ha fatto l’ultima modifica, segue la sua preferenza **Rivaluta i ticket modificati** e viene saltato quando il suo budget è esaurito o il fornitore non risponde.

### Lasciare che Riempimento intelligente scriva il titolo {#smart-fill-title}

Con **Scrivi i titoli mancanti** attivo, crei un ticket descrivendolo. L’opzione è attiva per impostazione predefinita e dipende da **Attiva Smart Fill**. Finché Riempimento intelligente è attivo per il ticket, il modulo di creazione mostra solo la descrizione, con il cursore al suo interno. Descrivi il lavoro e crea il ticket. Per scrivere tu il titolo, apri la freccia accanto al pulsante Smart Fill e scegli **Imposta manualmente** → **Titolo**: il campo del titolo compare sopra la descrizione, e un titolo che digiti viene mantenuto così com’è. Se lasci il campo vuoto e passi ad altro, scompare di nuovo. Anche disattivare Smart Fill per il ticket fa tornare il titolo. Questo vale per il modulo di creazione; Numo, il server MCP e l’importazione CSV scrivono i propri titoli.

Riempimento intelligente scrive un titolo breve che riassume la descrizione e distingue il ticket da quelli simili, nella lingua della descrizione. Il ticket compare quando titolo e proprietà sono compilati, e la sua attività nomina Riempimento intelligente. Se non è possibile scrivere un titolo, perché il fornitore non risponde o il tuo budget **Automazioni** è esaurito, il ticket prende invece la prima riga della descrizione. Una descrizione che contiene solo un’immagine richiede comunque un titolo.

Un titolo scritto così resta di Riempimento intelligente finché qualcuno non lo modifica. Con **Rivaluta i ticket modificati** attivo, una [rilettura](#smart-fill-reevaluation) successiva può sostituirlo quando la descrizione ora descrive un altro lavoro, e lo mantiene finché è adatto. Quel passaggio riscrive il titolo solo se la persona che ha fatto l’ultima modifica non ha disattivato **Scrivi i titoli mancanti**. Appena tu, Numo o un agente connesso modificate il titolo, Riempimento intelligente non lo tocca più.

## Valutare il lavoro in arrivo nel triage {#triage-incoming-work}

Apri la destinazione Triaggio del progetto. Leggi il ticket in arrivo e il contesto della sua origine prima di accettarlo nel lavoro pianificato. Controlla se un ticket esistente rappresenta già la richiesta. Chiarisci risultato previsto, progetto, assegnatario, priorità e sforzo secondo necessità.

I filtri dell’elenco restringono i ticket in arrivo per priorità, impegno, assegnatario, obiettivo, categorie o integrazione. **Non definita** nella priorità e **Non definito** nell’impegno mantengono i ticket che non hanno ancora un valore. I valori della stessa proprietà sono alternative; proprietà diverse si combinano. Reimposta i filtri per mostrare nuovamente tutti i ticket in arrivo.

Scegli Accetta e conferma per spostare nel Backlog un ticket da mantenere. Scegli Rifiuta e conferma per impostarlo su Annullato. Se è un duplicato, scegli **Segna come duplicato…** e seleziona nella palette dei comandi il ticket da mantenere. Il ticket in arrivo assume lo stato Duplicato e rimanda a quello scelto. Se descrivi la richiesta nella ricerca del selettore, compaiono anche ticket simili sotto **Correlati per significato**, dopo le corrispondenze testuali; vedi [Cercare i ticket per significato](/docs/navigation#search-by-meaning). Quando un elemento esce dal triage, viene selezionato il successivo. Verifica lo stato risultante o il collegamento al duplicato nel ticket stesso. Passare da una scheda all’altra senza eseguire una di queste azioni non chiude il ticket.

### Ordinamento e limiti {#triage-order}

Smart Triage usa regole di ordinamento deterministiche.

All’interno di ogni colonna di stato, i ticket aperti che bloccano altro lavoro aperto vengono prima dei ticket senza blocchi. I ticket bloccati da lavoro aperto vengono ultimi, anche quando bloccano a loro volta altri ticket. Gli estremi chiusi non generano più questa priorità.

All’interno di ciascun livello, priorità più alta, impegno minore e scadenze superate o vicine fanno avanzare il lavoro. Nello stesso livello di blocco, i ticket di un obiettivo rimangono insieme e il gruppo viene ordinato in base al suo ticket meglio posizionato. A parità di posizione, contano la scadenza, la data di creazione più vecchia, la posizione manuale e infine l’identificativo, che garantisce un ordine stabile. Una relazione di collegamento non influisce su questo ordinamento.

Smart Triage non è una modalità sperimentale di triage con IA. L’ordine aiuta a scegliere quali elementi esaminare prima; non dimostra la verità di una descrizione, non risolve automaticamente i duplicati e non concede permessi.

Se manca l’elemento previsto, controlla progetto attivo, stato e filtri, poi cerca il suo identificativo. Il lavoro importato o sincronizzato dall’esterno può arrivare nel triage; controlla la fonte originale e la mappatura dell’integrazione prima di cambiare campi sincronizzati. Una richiesta collegata dal feedback resta un oggetto di feedback distinto con una propria discussione pubblica.


![Ticket dimostrativo AUR-19 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.](/documentation/it/triage-incoming.png)

## Seguire il ciclo di vita di un ticket {#issue-statuses}

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

Gli stati sono fissi e non vengono personalizzati per progetto. Triage e Duplicato sono disponibili nei selettori, ma sono deliberatamente assenti dalle normali colonne kanban. Per impostazione predefinita, i tabelloni nascondono anche le colonne **Completato** e **Annullato**; selezionale nel filtro **Stato** per mostrarle. Una colonna mancante non dimostra che lo stato o il ticket non esistano.


![Gli otto stati del ticket nel selettore, con Backlog selezionato.](/documentation/it/issue-statuses.png)

### Stati finali e verifica {#closed-work}

Completato, Annullato e Duplicato sono stati finali per il monitoraggio: smettono di bloccare i ticket dipendenti ed escono dai conteggi attivi. Chiudere come Annullato non significa che l’attività sia stata consegnata. Quando contrassegni un duplicato, identifica il ticket mantenuto per dare una destinazione chiara alla discussione e al progresso.

Controlla i filtri se un ticket scompare dopo la chiusura. Riaprilo tramite identificativo per controllare il risultato e cambiare stato se l’hai chiuso per errore. Per il lavoro bloccato, controlla anche la direzione della dipendenza: cambiare lo stato di un ticket non ne riscrive descrizione o piano.

## Discutere il lavoro e allegare il contesto {#issue-discussion-and-resources}

Apri la cronologia di discussione del ticket per aggiungere un commento. Spiega una decisione, una domanda o un risultato di verifica perché un altro membro possa capire cosa è cambiato. Usa le menzioni quando serve una persona o un oggetto collegato nel contesto; le notifiche dipendono comunque dalle preferenze del destinatario e dalla consegna sul suo dispositivo. Un lettore può commentare solo se il proprietario ha attivato **Può commentare** per lui. In quel caso può rispondere, menzionare persone, allegare file ai propri commenti e modificare o eliminare i propri commenti.

Allega una pagina pertinente del progetto, un file o un collegamento attraverso i controlli delle risorse. Una pagina collegata è una risorsa aggiornata: il suo titolo segue le rinominazioni e il contenuto può evolvere. Un file è un allegato memorizzato, non una garanzia che un URL esterno resti disponibile. **Pagina** apre la palette dei comandi sulle pagine del progetto, nell’ordine della barra laterale; scegline una per allegarla. Per scrivere una pagina che non esiste ancora, scegli **Nuova pagina** in fondo all’elenco; un titolo digitato prima nella ricerca diventa il suo titolo. La pagina viene creata nel progetto, allegata al ticket e aperta in un pannello laterale, dove **Espandi** apre la pagina intera.

Le risorse appaiono come schede: l’immagine stessa o l’icona del tipo di file, il nome e la dimensione. Un link mostra l’immagine di anteprima della sua pagina quando il sito ne fornisce una, altrimenti la sua favicon. Fai clic o clic destro su una scheda per aprirne il menu: Anteprima, Apri collegamento o Apri pagina, poi Rinomina, Scarica e Rimuovi quando si applicano. Anteprima apre un file supportato su tutta la finestra. Immagini, PDF, Markdown (`.md`), testo semplice (`.txt`, `.text`), CSV e formati audio o video supportati usano lo stesso visualizzatore. Il Markdown viene formattato, il testo resta letterale e il CSV si apre come tabella scorrevole. Usa Chiudi o Escape per tornare al ticket. Il menu Azioni del file (`…`) offre Scarica e, se puoi modificare quella risorsa, Rinomina e Rimuovi. Un clic sulla menzione di un file in un testo apre lo stesso visualizzatore. Minddy chiede una conferma prima di rimuovere una risorsa, che viene poi scollegata da questo contesto. Una risorsa pagina mantiene il titolo della sua pagina e non si può rinominare. I formati non supportati mantengono l’azione di download. **Apri pagina** la mostra in un pannello laterale, dove **Espandi** apre la pagina intera; un database si apre direttamente come pagina intera.

![Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica, Rinomina e Rimuovi.](/documentation/it/file-preview.png)

![Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.](/documentation/it/work-resources.png)

### Visibilità e caricamenti non riusciti {#resource-access}

L’appartenenza e l’accesso al progetto regolano discussione e risorse interne. Aggiungere una risorsa a un ticket non la pubblica per visitatori anonimi. Quando fai riferimento al feedback, distingui la discussione riservata al gruppo da una risposta pubblica prima di inviare testo.

Dopo l’operazione, verifica che una risorsa caricata compaia e si possa aprire. Se il caricamento fallisce, conserva il file originale, leggi l’errore e verifica il limite applicabile di dimensione o spazio dell’account. Gli operatori di istanze autonome hanno bisogno anche di metadati, policy e dati dei file di Storage funzionanti. Evita di allegare credenziali o dump diagnostici privati.

## Collegare dipendenze e ticket correlati {#issue-dependencies}

Apri i controlli delle relazioni di un ticket e cerca l’altro per titolo o identificativo. Fuori da un campo di testo, R apre la scelta del tipo di relazione da una scheda sotto il puntatore o dal pannello del ticket. Scelto il tipo, l’altra estremità si sceglie nella [palette dei comandi](/docs/navigation#search-and-shortcuts), che mostra solo i ticket e gli obiettivi che possono ricevere quella relazione; compaiono anche quelli completati e annullati, dopo quelli aperti. Una ricerca descrittiva mostra anche, dopo le corrispondenze testuali, ticket dello stesso progetto trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**. Scegli una relazione di blocco quando un’attività deve terminare prima che un’altra possa procedere. Se A blocca B, A è il prerequisito e B è bloccato da A. Una relazione di collegamento aggiunge contesto senza imporre quell’ordine.

Leggi entrambi gli identificativi e la direzione visualizzata prima di confermare. Per esempio, «Preparare l’endpoint» blocca «Collegare il client», non il contrario. Una dipendenza non rende nessuno dei ticket un sottoticket e una relazione padre-figlio non sostituisce una relazione di blocco.

![La palette dei comandi mostra i ticket che possono bloccare questo, con la domanda della relazione nel campo di ricerca.](/documentation/it/work-dependencies.png)

### Blocchi risolti ed ereditati {#blocker-state}

Gli stati finali Fatto, Annullata e Duplicato fanno smettere a un ticket di bloccare il lavoro. Le relazioni collegano ticket od obiettivi dello stesso progetto; entrambi gli estremi devono essere accessibili al suo interno. Non collegano lavoro privato arbitrario tra progetti e non pubblicano nessuno dei due estremi.

Un ticket aperto può ereditare un blocco attraverso il proprio obiettivo aperto. Se A blocca l’obiettivo B, i ticket aperti collegati a B mostrano A come blocco ereditato, anche senza una relazione diretta da A al ticket. La visualizzazione indica il prerequisito effettivo e l’obiettivo che trasmette il blocco. Esamina quella relazione dell’obiettivo prima di provare a rimuoverla dal ticket. Chiudere A, chiudere B o rimuovere il ticket da B elimina il blocco ereditato. Questo meccanismo segue l’appartenenza all’obiettivo, non la gerarchia tra ticket padre e sottoticket.

Rimuovi una relazione dai suoi controlli quando non è più pertinente; una conferma nomina l’altro ticket o obiettivo, e sparisce solo il collegamento. Su una scheda della board, il chip di un tipo di relazione apre l’elenco di quelle relazioni, ognuna con un pulsante di rimozione (✕) che chiede la stessa conferma; le relazioni ereditate da un obiettivo non lo hanno. Poi verifica etichetta e indicatore di blocco. Contrassegnare un ticket come duplicato ha effetti sul ciclo di vita e rimanda al lavoro mantenuto. Usalo per le attività duplicate invece di creare un collegamento ordinario e supporre che chiuda il duplicato.

Se il selettore di relazione non trova un ticket, controlla accesso al progetto e identificativo. Non esporre il contenuto di un altro progetto incollando un URL privato di ticket in una risposta pubblica al feedback.

### Collegamenti aggiunti da Riempimento intelligente {#smart-fill-relations}

Con **Collega i ticket correlati** attivo, Riempimento intelligente cerca i ticket correlati dopo la creazione di un ticket o la modifica del suo titolo o della sua descrizione. Il lavoro avviene in background dopo il salvataggio: creazione e modifica non lo attendono mai, e i collegamenti possono comparire qualche secondo dopo. Per un nuovo ticket segue le stesse scelte degli altri campi, quindi non viene eseguito se hai disattivato Riempimento intelligente per quel ticket. Non viene eseguito per i ticket importati da un repository collegato, per le copie ricorrenti né per le modifiche sincronizzate dal repository.

Riempimento intelligente confronta il ticket con al massimo cinque candidati dello stesso progetto, escludendo i ticket annullati, duplicati o eliminati. Una decisione classifica poi ogni candidato come correlato, bloccante, bloccato da o senza relazione. La sola somiglianza non crea mai un collegamento, una dipendenza richiede indizi più solidi di una semplice correlazione e, nel dubbio, Riempimento intelligente non aggiunge nulla. Una correlazione richiede un legame evidente, come lo stesso bug, un seguito diretto o un annullamento: due ticket che condividono solo una funzionalità o un argomento restano scollegati. La maggior parte dei ticket non riceve quindi alcun collegamento. Un singolo passaggio aggiunge al massimo due relazioni. Non tocca mai una coppia che ha già una relazione, non aggiunge mai un blocco che chiuderebbe un ciclo e scarta il risultato se il testo del ticket è cambiato durante la decisione. Non segna mai un duplicato e non cambia mai uno stato.

I collegamenti aggiunti in questo modo compaiono nelle relazioni del ticket come gli altri, e la cronologia indica Smart-fill come autore. Verifica la direzione di una dipendenza come faresti per le tue. Per rimuovere un collegamento usa i controlli delle relazioni: Riempimento intelligente non aggiunge di nuovo un collegamento rimosso per quella coppia. Per non ricevere nuovi collegamenti, disattiva **Collega i ticket correlati** nelle [tue preferenze](#smart-fill-preferences). I ticket creati prima di questa funzione, quelli importati e quelli sincronizzati da un repository vengono indicizzati gradualmente in background, ma non ricevono mai collegamenti automatici.

L’indicizzazione e le decisioni sulle relazioni usano l’IA. Rientrano nella quota **Automazioni** dell’account a cui spetta il passaggio: l’account addebitato per il Riempimento intelligente del nuovo ticket, di solito chi lo ha creato; chi modifica, per una modifica; il proprietario del progetto, per l’indicizzazione in background. La cronologia di utilizzo mostra l’indicizzazione come **Smart-fill · indice dei ticket**. Una decisione sulle relazioni compare come **Decisione IA** quando la prende il modello di decisione, e come **Smart-fill · relazioni** quando la prende il modello di riserva. Se quel budget è esaurito o il provider non risponde, il passaggio viene saltato e il ticket resta invariato. [La ricerca dei ticket per significato](/docs/navigation#search-by-meaning) usa lo stesso indice: ogni nuova ricerca rientra nella quota **Automazioni** dell’account che cerca e compare come **Ricerca dei ticket**.

## Suddividere un ticket in sottoticket {#sub-issues}

Nel pannello laterale del ticket padre, scegli **Crea un sottoticket** per aprire la finestra di creazione del ticket con questo ticket già impostato come padre. La freccia accanto (**Altre opzioni del sottoticket**) offre **Chiedi a Numo di suddividere il ticket**, che chiede a Numo di leggere il ticket con il suo piano e i suoi commenti e di creare un sottoticket per ogni parte di lavoro indipendente; controlla i sottoticket che crea. Un Lettore non vede questo pulsante. Dai a ogni figlio un risultato distinto. Dopo la creazione, controlla progetto, proprietà e identificativo del padre; una gerarchia deve facilitare il monitoraggio, non sostituire la descrizione di ciò che ogni figlio deve ottenere.

Per collegare ticket già esistenti, premi R su una scheda sotto il puntatore o nel pannello del ticket, oppure apri **Relazioni** dal clic destro su una scheda. **Principale di** elenca i ticket che possono diventare un sottoticket di questo; **Sottoticket di** elenca i ticket di primo livello che possono diventarne il principale. Ogni elenco propone solo ciò che la regola di un solo livello consente: un sottoticket non ha la voce **Principale di**, e un ticket che ha già sottoticket non ha la voce **Sottoticket di**. Scegliere un ticket che ha già un altro principale lo sposta sotto il nuovo. Da una selezione di schede, **Sottoticket di** colloca ogni ticket selezionato idoneo sotto il principale scelto. Nel modulo di nuovo ticket, **Relazioni** offre le stesse due voci: **Sottoticket di** crea il ticket sotto il principale scelto, e **Principale di** mette sotto di esso i ticket scelti una volta creato. Un nuovo ticket ha un principale o dei sottoticket, non entrambi. Scrivendo nel campo di ricerca del clic destro su una scheda o del menu `…` del pannello del ticket trovi anche le voci dei suoi sottomenu, ciascuna con il suo percorso, ad esempio **Relazioni** › **Contrassegna come bloccato da…**.

La gerarchia consente un solo livello: il padre deve essere un ticket di primo livello nello stesso progetto e un sottoticket non può avere figli. Se durante la creazione non scegli esplicitamente un obiettivo, il figlio eredita quello del padre. Controlla le proprietà risultanti invece di presumere che le modifiche successive del padre si propaghino.

Un figlio resta un ticket con un proprio stato e una propria discussione. L’indicatore di progresso del padre è ponderato in base all’impegno dei figli e alla quota di completamento attribuita al loro stato. Il contatore completati/totale nell’elenco dei sottoticket è invece un conteggio separato, non ponderato. Leggi gli stati dei figli insieme a entrambe le misure. Usa una dipendenza per dire «deve terminare prima» e un padre per dire «fa parte di questa attività più grande».

![Campo per creare un sottoticket in un ticket principale dimostrativo.](/documentation/it/work-sub-issues.png)

### Aprire o rimuovere la relazione con il padre {#change-parent}

L’identificativo del padre accanto al titolo del figlio apre un menu. Usa l’azione di apertura del padre per esaminare l’attività più grande. Per separare il figlio, scegli di scollegarlo dal padre e leggi la conferma prima di applicarla. Quando lo scollegamento riesce, la relazione scompare e il ticket rimane.

Non eliminare un figlio solo per riorganizzare la gerarchia. Controlla le relazioni padre-figlio esistenti prima di cambiare padre e risolvi una relazione rifiutata invece di forzare una gerarchia circolare. Se il salvataggio fallisce, riapri il figlio per verificare se il cambiamento sia stato applicato prima di riprovare. Conserva il lavoro completato dei figli quando rivedi il piano generale.

## Mantenere un piano di implementazione {#implementation-plans}

Apri la scheda del piano del ticket. La descrizione dovrebbe già indicare il problema e il risultato previsto. Aggiungi i passi di implementazione manualmente oppure [copia il prompt **Genera un piano**](#copy-issue-prompt) per il tuo agente di programmazione, che esplora da sé il repository. Numo non può leggere il repository: può precisare la descrizione e, se glielo chiedi, scrivere un piano semplice, ma qualsiasi percorso di file o funzione che cita è un’ipotesi. Un percorso o una funzione in un piano è una prova solo se il repository è stato realmente letto.

Il piano si modifica direttamente, come la descrizione: fai clic al suo interno e scrivi, senza modalità di modifica né pulsante di salvataggio. Un piano vuoto mostra un testo segnaposto. Più membri, Numo e gli agenti collegati possono modificare lo stesso piano contemporaneamente, ognuno con un cursore con il proprio nome, e un’attività spuntata da un agente compare nel tuo editor mentre scrivi altrove. Digita `- [ ]` seguito da uno spazio all’inizio di una riga, oppure scegli **Elenco attività** nel menu `/`, per aggiungere un’attività. Fai clic sulla casella di un’attività per completarla, oppure apri il suo menu per gli altri stati.

Premi Tab in un’attività per annidarla sotto la precedente e Maiusc+Tab per riportarla indietro; nel Markdown salvato, ogni livello è rientrato di due spazi. L’annidamento organizza i passi del piano e non crea relazioni padre-figlio tra ticket. Ogni attività di lavoro non annullata contribuisce al progresso, comprese quelle annidate.

Il piano usa righe di attività Markdown: `- [ ]` per da fare, `- [~]` per in corso, `- [x]` per completata e `- [-]` per annullata. Scrivi il testo dopo il marcatore, per esempio `- [ ] Verificare il link di contatto su mobile`. Le attività annullate non rientrano nel conteggio del completamento. Le attività sotto un’intestazione Questions riconosciuta vengono trattate come domande ed escluse dal progresso; tieni quindi i passaggi di lavoro in una sezione separata allo stesso livello d’intestazione. L’intestazione riconosciuta è `Questions`, con questa parola inglese. L’editor mostra queste righe come attività e le riscrive nello stesso formato, quello che leggono Numo e gli agenti collegati. Usa da fare, in corso, completata e annullata per descrivere ciò che è avvenuto, senza implicare verifiche non eseguite.

![Piano dimostrativo con due attività di lavoro completate su sei.](/documentation/it/work-implementation-plan.png)

### Conservare progresso e modifiche simultanee {#plan-progress}

Estendi o modifica il piano esistente invece di sostituirlo con una nuova copia non selezionata. Mantieni i passi completati e le spiegazioni dei cambiamenti di ambito. Le modifiche di altri membri e agenti compaiono nel piano man mano che vengono fatte. Uno strumento che sostituisce l’intero piano sostituisce comunque i passaggi che riscrive, quindi chiedi agli agenti di modificare solo la parte che cambiano.

Per far implementare il piano, copia il prompt del ticket per il tuo agente di codice, come descritto qui sotto. Un’attività spuntata non dimostra da sola che il codice superi i test. Leggi risultato, modifiche e controlli prima di segnare il ticket come fatto.

### Copiare un prompt per un altro agente di codice {#copy-issue-prompt}

Per affidare un ticket a un agente di codice esterno a Minddy, come Claude Code, Codex o Cursor, apri il menu delle azioni del ticket, scegli **Copia come prompt** e poi **Genera un piano** (o **Rivedi il piano** se esiste già), **Implementa il ticket**, **Verifica l'implementazione** o **Personalizzato…**. Con più ticket selezionati, **Copia il prompt combinato** li riunisce in un unico prompt. La copia non esegue alcun modello di IA e non consuma la tua quota di IA: Minddy raccoglie ciò che ha già memorizzato e l'agente esplora il repository da solo. Se nelle preferenze dell’account è attiva l’opzione **Avvia il ticket o l'attività quando ne copio il prompt**, la copia avvia anche un ticket non ancora iniziato. Consulta [Lavoro sul codice e pull request](/docs/code-work) per il flusso completo e la revisione delle pull request.

Il prompt contiene i campi del ticket, le sue categorie, le relazioni, il numero di risorse allegate e l'avanzamento del piano, ma non il testo del piano, che l'agente legge tramite il server MCP di Minddy o ti chiede. Indica inoltre il repository collegato al progetto e ogni pull request collegata al ticket, con il suo stato e i suoi branch quando sono noti. L'agente prosegue una pull request aperta sul suo branch e considera quelle unite o chiuse come cronologia. Senza una pull request aperta, il prompt suggerisce un nome di branch composto dall'identificativo del ticket e da un titolo breve, ad esempio `min-42-keyboard-navigation`. È solo un suggerimento: l'agente controlla prima i branch esistenti e segue la convenzione di denominazione del repository. Mantenere l'identificativo nel nome del branch, nel titolo della pull request o in una riga `Fixes MIN-42` permette a Minddy di collegare la pull request al ticket quando il repository è collegato.

Se le informazioni sulle pull request non possono essere caricate, il prompt lo dice invece di affermare che non ce ne sono. I prompt di piano e di revisione del piano chiedono all'agente di fermarsi prima di implementare. Un prompt personalizzato mantiene la tua richiesta e la sua portata così come le hai scritte. Il contenuto del ticket e la tua richiesta mantengono la lingua originale; le istruzioni che li circondano sono in inglese.

## Ripetere un ticket dopo il completamento {#recurring-issues}

Crea o apri un ticket che resti utile a ogni ripetizione, per esempio un controllo periodico delle dipendenze. Imposta una scadenza, poi scegli una ricorrenza giornaliera, settimanale, mensile o annuale nel controllo della data del ticket. Una ricorrenza senza scadenza viene rifiutata. Controlla proprietà e assegnatario prima di salvare. Le impostazioni delle ricorrenze del progetto elencano le serie attive; usale per cambiare frequenza o interrompere la ripetizione.

I ticket ricorrenti si ricreano dopo che il ticket è nello stato «Completato»; il successivo viene creato nel Backlog. Dopo aver completato una ricorrenza, controlla identificativo e proprietà del ticket successivo.

La scadenza successiva deriva dalla scadenza precedente più un intervallo di ricorrenza, non dal giorno in cui hai completato l’attività. Il successore copia titolo, descrizione, priorità, impegno, assegnatario, obiettivo e categorie. Non copia il piano di implementazione, la relazione con il padre, le risorse o i commenti. La ricorrenza passa al successore; riaprire e completare di nuovo il vecchio ticket non crea un’altra occorrenza. Se la creazione del successore fallisce, la serie si interrompe invece di riprovare ripetutamente sul ticket completato. Esamina il risultato e configura la ricorrenza sulla prossima attività appropriata dopo aver risolto l’errore. Non supporre che un calendario esegua codice o completi il nuovo ticket per te.


![Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.](/documentation/it/issue-date-recurrence.png)

### Cambiare o interrompere la ripetizione {#recurrence-change}

Usa le impostazioni delle ricorrenze per modificare o disabilitare le ripetizioni future. Esamina separatamente i ticket già creati: interrompere la creazione futura non significa che il lavoro esistente sia stato completato o rimosso.

Una routine di Numo è un oggetto diverso: programma una conversazione e può usare il budget IA del proprietario e i fornitori configurati. Scegli ticket ricorrenti per un’attività ripetuta da monitorare e una routine per un’istruzione da eseguire secondo un calendario. Se manca il ticket successivo, controlla se il precedente sia stato segnato come fatto, se la ricorrenza sia ancora attiva e se stai guardando il Backlog senza filtri restrittivi.

## Aggiornare più ticket insieme {#bulk-issue-actions}

Sul tabellone, tieni premuto Maiusc e fai clic su ogni scheda per aggiungerla alla selezione o rimuoverla. Con il mouse puoi anche trascinare un rettangolo di selezione da uno spazio vuoto del tabellone. Maiusc, Command o Ctrl aggiungono gli elementi alla selezione esistente. Vicino a un bordo il tabellone scorre, e le schede attraversate dal rettangolo restano selezionate anche quando escono dalla vista. Il rettangolo non è una modalità di selezione per schermi tattili. Controlla il numero selezionato e gli identificativi visibili prima di aprire le azioni collettive. La selezione è un insieme di lavoro per l’azione, non una vista salvata e non una concessione di permessi. Aprile con **Azioni** nella barra di selezione, oppure premi Comando+K su macOS o Ctrl+K su Windows/Linux mentre ci sono ticket selezionati.

Scegli Azioni nella barra mobile della selezione per aprire la palette dei comandi. Scegli stato, priorità, sforzo o assegnatario, imposta il valore e conferma il modulo integrato. L’azione dell’obiettivo appare solo per una selezione in un unico progetto con obiettivi disponibili. Altre azioni, come aggiungere o rimuovere elementi dal ciclo, collegare due ticket o inviare la selezione a Numo, appaiono quando il tabellone attuale le supporta. Con il mouse puoi anche puntare una scheda selezionata e premere S, P, E, A, L, D, O o R: il selettore che si apre vale per tutta la selezione e, per assegnatario, obiettivo, categorie e relazioni, per i ticket selezionati del progetto di quella scheda. Fai clic destro su una scheda selezionata per agire su tutta la selezione: **Copia il prompt combinato** offre **Genera i piani** (**Rivedi i piani** quando ogni ticket selezionato ne ha uno, **Genera o rivedi i piani** quando solo alcuni lo hanno), **Implementa i ticket**, **Verifica le implementazioni** e **Personalizzato…**, e ciascuna voce copia un solo prompt per tutti i ticket selezionati. **Copia i 3 identificativi**, con tre ticket selezionati, copia i loro identificativi separati da virgole, dal numero più basso al più alto. **Relazioni**, **Collega un obiettivo** e **Aggiungi una scadenza** aprono gli stessi selettori di R, O e D. **Sposta nel cestino**, per ultima, sposta l’intera selezione nel cestino dopo la stessa conferma della barra di selezione. Controlla poi i ticket interessati. Su un dispositivo solo tattile senza un gesto di selezione multipla supportato, modifica ogni ticket nel suo pannello di dettaglio.

### Risultati parziali e azioni distruttive {#bulk-results}

Quando lavori tra progetti, verifica la tua appartenenza a ciascun progetto coinvolto. Leggi gli eventuali risultati di errore parziale: i cambiamenti riusciti possono essere già salvati anche se un altro ticket è stato rifiutato. Controlla il risultato prima di riprovare sull’intera selezione.

L’eliminazione riguarda tutti gli elementi selezionati, quindi conferma l’insieme prima di procedere. **Sposta i ticket nel cestino** chiede una conferma; i ticket, con i loro commenti, file e link, possono essere ripristinati dal [cestino](/docs/trash-and-recovery) per 30 giorni. Rimuovi la selezione dopo l’operazione se passi ad altro lavoro. Se l’aggiornamento cambia i risultati dei filtri, i ticket possono uscire dalla vista mostrata pur restando nel progetto. Cerca gli identificativi per verificare il nuovo stato invece di ricrearli.

## Importare un backlog CSV dopo la verifica {#import-issues}

Il proprietario del progetto apre Importazione nelle impostazioni del progetto e seleziona un’esportazione CSV. I formati di Linear e Jira vengono riconosciuti; gli altri CSV usano l’associazione generica delle colonne. Ogni importazione è limitata a 5 MiB e 5.000 ticket. Suddividi intenzionalmente gli archivi più grandi e, quando possibile, mantieni i riferimenti ai ticket padre nello stesso gruppo.

Associa la colonna del titolo prima di importare. Controlla descrizione, stato, priorità, impegno, scadenza, categorie e assegnatari. Associa le persone a membri effettivi del progetto e verifica le nuove categorie. I riferimenti ai padri corrispondono a chiavi esterne nello stesso gruppo e supportano un solo livello. I CSV non importano i byte dei file allegati.

Una proposta IA viene richiesta soltanto per le associazioni mancanti. Puoi modificarla; se il provider non è disponibile o la richiesta fallisce, l’associazione manuale resta utilizzabile. Una correzione manuale impedisce a una proposta tardiva di sovrascrivere le tue scelte.

### Importare e verificare {#result}

Dopo ogni modifica delle associazioni, leggi il numero di ticket, la distribuzione degli stati e gli avvisi. Correggi le righe ignorate o non valide prima di confermare. L’importazione crea nuovi ticket: non presumere che caricare nuovamente il file aggiorni quelli esistenti eliminando i duplicati. Dopo il successo, verifica un campione di ticket, assegnazioni, date e collegamenti ai padri. Se la risposta va persa, controlla il progetto prima di ripetere l’intero file, per evitare lavoro duplicato.

![Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.](/documentation/it/import-issues-preview-workflow.png)

## Esportare i ticket in CSV {#export-issues}

Come membro autenticato di un progetto, apri la palette con Command+K su macOS o Ctrl+K sugli altri sistemi e cerca «Esporta i ticket in CSV». Scegli il comando, seleziona un progetto o tutti i progetti accessibili e controlla le caselle degli stati. La pagina del progetto corrente preseleziona quel progetto. I ticket completati, annullati e duplicati sono esclusi per impostazione predefinita; includili per ottenere l’intera cronologia. Deve restare selezionato almeno uno stato. I filtri della board e le schede selezionate non definiscono questa esportazione.

Scegli Esporta e controlla la conferma del download e il numero di ticket indicato. Il CSV UTF-8 contiene identificativi, titoli, descrizioni Markdown, stati, priorità, impegno, categorie, assegnatari, obiettivi, nomi dei progetti, date e identificativi dei ticket padre. L’accesso è limitato ai tuoi progetti accessibili. Un file con sole intestazioni può indicare che non esistono ticket accessibili corrispondenti. Quando lo condividi, considera descrizioni e nomi come dati del progetto.

### Verificare la completezza e reimportare {#export-issues-limits}

L’esportazione è limitata a 20.000 ticket. Un avviso di troncamento indica che il file potrebbe essere incompleto. Riduci l’ambito per progetto e stato, esporta gruppi separati e confronta i conteggi. Ripetere lo stesso ambito non scarica una pagina successiva. Se il download fallisce, controlla l’errore, la sessione e l’accesso al progetto prima di riprovare.

Il formato può essere [importato in minddy](#import-issues), con l’autorizzazione del proprietario di destinazione e dopo aver verificato la mappatura. L’importazione crea nuovi ticket; non ripristina gli identificativi originali né aggiorna i ticket esistenti. Mantieni le righe padre nello stesso lotto di importazione. Il CSV contiene dati dei ticket, non un backup di allegati, commenti, impostazioni dell’account o credenziali. Per trasferire un account, usa la [guida al trasferimento tra istanze](/docs/transfer-between-instances).
