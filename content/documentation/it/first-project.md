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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "revision": 5,
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

1. Apri Home dopo l'accesso. Per iniziare un nuovo lavoro, scegli l'azione per creare un progetto nella navigazione. Seleziona un progetto completamente nuovo nella procedura guidata, inserisci un nome e una chiave di due-cinque lettere e prosegui nei passaggi dell'icona e del repository. Per questo esempio manuale, mantieni l'icona predefinita e non scegliere un repository. Puoi lasciare vuota la descrizione iniziale. Nel passaggio finale, controlla Smart Assign e l'assegnazione automatica; lascia quest'ultima disattivata se vuoi assegnare personalmente il ticket dimostrativo. Scegli l'azione per concludere, attendi la creazione e apri il progetto. Se il tuo team ha già un progetto, comunica al proprietario l'email del tuo account e accetta l'invito nella posta in arrivo invece di creare un duplicato.
2. Apri il progetto e crea un ticket. Assegna un titolo concreto, come «Controllare il collegamento di contatto del sito». Descrivi la pagina, la destinazione prevista e come verificherai il risultato. Se il pulsante Riempimento intelligente è visibile e attivo, disattivalo per questo esempio manuale prima di creare il ticket. Questo pulsante controlla la compilazione di questo ticket ed è indipendente dagli interruttori di automazione e Smart Assign del progetto.
3. Scegli un assegnatario, una priorità e un impegno se aiutano a pianificare l’attività. Conferma la creazione, apri il ticket ottenuto e controlla progetto e identificativo.
4. Imposta lo stato «In corso» quando inizi il lavoro. Esegui il controllo e registra il risultato in un commento. Usa «In revisione» se qualcuno deve ancora esaminarlo.
5. Imposta «Fatto» dopo aver verificato il risultato previsto. Cerca il ticket tra il lavoro completato del progetto o tramite il suo identificativo per confermare il cambiamento.

![Ticket dimostrativo completato con descrizione e commento salvato.](/documentation/it/reader-first-project.png)

## Risolvere un risultato inatteso {#first-use-recovery}

Un invito riguarda un account e un’istanza specifici. Se manca, verifica l’indirizzo email comunicato al proprietario e apri la posta in arrivo sulla stessa istanza. Conoscere il nome di un progetto non permette di entrarvi. Se un ticket scompare dal tabellone dopo un cambio di stato, rimuovi i filtri della vista o cerca il suo identificativo prima di crearne un’altra copia.

Sul telefono, apri il menu di navigazione per raggiungere il progetto e usa i controlli dei ticket. I selettori di stato e proprietà permettono di svolgere la stessa attività senza scorciatoie da tastiera desktop. Salva le decisioni specifiche del progetto in una pagina e collegala al ticket quando l’attività richiede un contesto duraturo.
