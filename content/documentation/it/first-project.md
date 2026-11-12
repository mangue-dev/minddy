---
{
  "id": "first-project",
  "locale": "it",
  "title": "Primi passi",
  "summary": "Crea un progetto o entra in uno esistente, registra un’attività e chiudila dopo averne verificato il risultato.",
  "topic": "Primi passi",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 14,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/mobile-onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/mobile-onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/mobile-onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 tour follow-up skip sentence with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Completare il primo ticket"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-first-project.png",
      "alt": "Ticket AUR-3 in corso, con descrizione, assegnatario, impegno e categoria.",
      "caption": "Il ticket mostra identificativo, stato e proprietà. Segnalo come completato solo dopo aver verificato il risultato atteso.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Dal progetto al ticket completato {#first-project}

Usa un account dell’istanza prevista. In questo esempio, crea un progetto dimostrativo per un sito web e un ticket per controllarne il collegamento di contatto. Puoi seguire la stessa sequenza in Cloud o su un’istanza autonoma configurata; non serve l’IA.

Se il tuo team ha già un progetto, comunica al proprietario l'email del tuo account e accetta l'invito nella posta in arrivo invece di creare un duplicato. Al primo passaggio della procedura guidata, **Voglio unirmi a un progetto** spiega come unirti.

Un nuovo account chiede prima il tuo nome e la tua immagine in **Come dovremmo chiamarti?**. Sul telefono seguono i primi passi, una pagina alla volta: crea il progetto dal primo passaggio, oppure scegli **Salta l'onboarding**, conferma e segui questo esempio da Home. Consulta [Creare un account e accedere](/it/documentazione/accounts#account-access).

1. Apri Home dopo l'accesso e scegli **Nuovo progetto** nella navigazione. La procedura guidata si apre su **Come si chiama il tuo progetto?**: inserisci un nome e una chiave di due-cinque lettere, poi scegli **Continua**.
2. Mantieni l'icona predefinita in **Icona del progetto** e scegli **Continua**. In **Collega un repository**, scegli **Salta** per questo esempio manuale. Dal secondo passaggio in poi, **Indietro**, sotto **Continua**, torna al passaggio precedente.
3. In **Invita il tuo team**, scegli **Salta** per questo esempio manuale; per lavorare con altre persone, cerca invece per nome le persone dei tuoi altri progetti o inserisci le loro email. Nessun invito parte prima che tu scelga **Fine**.
4. In **Porta qui i tuoi ticket**, scegli **Salta**: questo esempio parte senza ticket. Per partire da un altro strumento, consulta il paragrafo dopo questi passaggi.
5. In **Ultimi ritocchi**, controlla Smart Assign. Scegli **Fine**, attendi la creazione e apri il progetto.
6. Apri il progetto e crea un ticket. Assegna un titolo concreto, come «Controllare il collegamento di contatto del sito». Descrivi la pagina, la destinazione prevista e come verificherai il risultato. Se il pulsante Smart Fill è visibile e attivo, disattivalo per questo esempio manuale prima di creare il ticket. Questo pulsante controlla la compilazione di questo ticket ed è indipendente da Smart Assign e dalle routine.
7. Scegli un assegnatario, una priorità e un impegno se aiutano a pianificare l’attività. Conferma la creazione, apri il ticket ottenuto e controlla progetto e identificativo.
8. Imposta lo stato «In corso» quando inizi il lavoro. Esegui il controllo e registra il risultato in un commento. Usa «In revisione» se qualcuno deve ancora esaminarlo.
9. Imposta «Completato» dopo aver verificato il risultato previsto. I tabelloni nascondono la colonna **Completato** per impostazione predefinita: seleziona **Completato** nel filtro **Stato** del tabellone, oppure cerca l’identificativo del ticket, per confermare il cambiamento.

Per portare i ticket da un altro strumento, sceglilo nell'elenco di **Porta qui i tuoi ticket**: Linear, Jira, Notion, GitHub, Trello o minddy. **Come esportare da …** apre i passaggi di esportazione dello strumento scelto. Esporta lì il CSV, poi scegli **Scegli il file CSV**. Il file scelto compare con un pulsante per rimuoverlo. Viene importato quando il progetto esiste: il progetto si apre con una finestra di importazione che contiene il file, dove abbini le colonne e confermi l'importazione. Una bozza salvata della procedura guidata non conserva il file; se riprendi la creazione più tardi, sceglilo di nuovo.

![Ticket AUR-3 in corso, con descrizione, assegnatario, impegno e categoria.](/documentation/it/reader-first-project.png)

## Risolvere un risultato inatteso {#first-use-recovery}

Un invito riguarda un account e un’istanza specifici. Se manca, verifica l’indirizzo email comunicato al proprietario e apri la posta in arrivo sulla stessa istanza. Conoscere il nome di un progetto non permette di entrarvi. Se un ticket scompare dal tabellone dopo un cambio di stato, rimuovi i filtri della vista o cerca il suo identificativo prima di crearne un’altra copia. I ticket completati e annullati escono dal tabellone per impostazione predefinita; seleziona **Completato** o **Annullato** nel filtro **Stato** per mostrarli.

Se alcuni inviti aggiunti nella procedura guidata non sono partiti, il progetto viene comunque creato e una notifica elenca ogni persona non invitata con il motivo. Controlla gli inviti in sospeso nelle impostazioni dei membri del progetto prima di invitare di nuovo.

Sul telefono, apri il menu di navigazione per raggiungere il progetto e usa i controlli dei ticket. I selettori di stato e proprietà permettono di svolgere la stessa attività senza scorciatoie da tastiera desktop. Salva le decisioni specifiche del progetto in una pagina e collegala al ticket quando l’attività richiede un contesto duraturo.
