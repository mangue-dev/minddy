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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "alt": "Ticket dimostrativo completato con descrizione e commento salvato.",
      "caption": "Lo stato completato documenta la verifica del percorso nell’applicazione. Non afferma che sia stato provato il link email del sito d’esempio.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Dal progetto al ticket completato {#first-project}

Usa un account dell’istanza prevista. In questo esempio, crea un progetto dimostrativo per un sito web e un ticket per controllarne il collegamento di contatto. Puoi seguire la stessa sequenza in Cloud o su un’istanza autonoma configurata; non serve l’IA.

Se il tuo team ha già un progetto, comunica al proprietario l'email del tuo account e accetta l'invito nella posta in arrivo invece di creare un duplicato.

1. Apri Home dopo l'accesso. Per iniziare un nuovo lavoro, scegli l'azione per creare un progetto nella navigazione. Seleziona un progetto completamente nuovo nella procedura guidata, inserisci un nome e una chiave di due-cinque lettere e prosegui nei passaggi dell'icona e del repository. Per questo esempio manuale, mantieni l'icona predefinita e non scegliere un repository. Puoi lasciare vuota la descrizione iniziale. Il passaggio successivo propone di invitare il tuo team: saltalo per questo esempio manuale oppure cerca per nome le persone dei tuoi altri progetti o inserisci le loro email; nessun invito parte prima che tu concluda la creazione. Nel passaggio finale, controlla Smart Assign e l'assegnazione automatica; lascia quest'ultima disattivata se vuoi assegnare personalmente il ticket dimostrativo. Scegli l'azione per concludere, attendi la creazione e apri il progetto.
2. Apri il progetto e crea un ticket. Assegna un titolo concreto, come «Controllare il collegamento di contatto del sito». Descrivi la pagina, la destinazione prevista e come verificherai il risultato. Se il pulsante Riempimento intelligente è visibile e attivo, disattivalo per questo esempio manuale prima di creare il ticket. Questo pulsante controlla la compilazione di questo ticket ed è indipendente da Smart Assign e dalle routine.
3. Scegli un assegnatario, una priorità e un impegno se aiutano a pianificare l’attività. Conferma la creazione, apri il ticket ottenuto e controlla progetto e identificativo.
4. Imposta lo stato «In corso» quando inizi il lavoro. Esegui il controllo e registra il risultato in un commento. Usa «In revisione» se qualcuno deve ancora esaminarlo.
5. Imposta «Fatto» dopo aver verificato il risultato previsto. I tabelloni nascondono la colonna **Fatto** per impostazione predefinita: seleziona **Fatto** nel filtro **Stato** del tabellone, oppure cerca l’identificativo del ticket, per confermare il cambiamento.

![Ticket dimostrativo completato con descrizione e commento salvato.](/documentation/it/reader-first-project.png)

## Risolvere un risultato inatteso {#first-use-recovery}

Un invito riguarda un account e un’istanza specifici. Se manca, verifica l’indirizzo email comunicato al proprietario e apri la posta in arrivo sulla stessa istanza. Conoscere il nome di un progetto non permette di entrarvi. Se un ticket scompare dal tabellone dopo un cambio di stato, rimuovi i filtri della vista o cerca il suo identificativo prima di crearne un’altra copia. I ticket fatti e annullati escono dal tabellone per impostazione predefinita; seleziona **Fatto** o **Annullata** nel filtro **Stato** per mostrarli.

Se alcuni inviti aggiunti nella procedura guidata non sono partiti, il progetto viene comunque creato e una notifica elenca ogni persona non invitata con il motivo. Controlla gli inviti in sospeso nelle impostazioni dei membri del progetto prima di invitare di nuovo.

Sul telefono, apri il menu di navigazione per raggiungere il progetto e usa i controlli dei ticket. I selettori di stato e proprietà permettono di svolgere la stessa attività senza scorciatoie da tastiera desktop. Salva le decisioni specifiche del progetto in una pagina e collegala al ticket quando l’attività richiede un contesto duraturo.
