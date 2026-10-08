---
{
  "id": "projects",
  "locale": "it",
  "title": "Progetti e membri",
  "summary": "Configura un progetto, invita i collaboratori e gestisci i membri con le autorizzazioni necessarie.",
  "topic": "Primi passi",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configurare un progetto",
    "Invitare persone a un progetto"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/it/project-general.png",
      "alt": "Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.",
      "caption": "Controlla nome e chiave prima di salvare. Spostare il progetto nel cestino è un’azione separata.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/it/project-members.png",
      "alt": "Invito via email e tre membri dimostrativi, con il proprietario identificato.",
      "caption": "Invita con l’email dell’account e identifica il proprietario prima di rimuovere l’accesso di un membro.",
      "revision": 5,
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
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Un progetto raccoglie lavoro e conoscenze condivisi. Il proprietario ne configura le impostazioni e invita i collaboratori; i membri lavorano sui contenuti entro i propri permessi. Le sezioni seguenti distinguono configurazione, inviti, rimozione dei membri e uscita dal progetto.

## Configurare un progetto {#project-settings}

Apri il progetto e poi le sue impostazioni. La proprietà del progetto determina l’accesso alle impostazioni amministrative. I membri possono consultare la sezione generale e lasciare il progetto, ma non ottengono i controlli di modifica del proprietario.

Come proprietario, inserisci un nome non vuoto e una chiave di progetto valida, quindi salva. La chiave viene convertita in maiuscolo e usa da 2 a 5 lettere o cifre. Dopo averla cambiata, controlla gli identificativi risultanti. Usa i controlli di icona e aspetto per distinguere il progetto nella navigazione; queste scelte visive non cambiano l’appartenenza al progetto.

Le altre sezioni gestiscono collaboratori, ticket ricorrenti, Git, importazione, integrazioni, automazione e feedback. Segui la guida dell’attività corrispondente prima di abilitare un fornitore o lavoro automatico. Le preferenze dell’account, come la lingua dell’interfaccia, sono separate dalla configurazione del progetto.


![Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.](/documentation/it/project-general.png)

### Lasciare ed eliminare {#project-removal}

Un membro può usare l’azione per lasciare il progetto e rimuovere il proprio accesso. Chiedi al proprietario un nuovo invito se ti servirà di nuovo. Lasciare un progetto non lo elimina per tutti.

L’eliminazione del progetto è un’azione del proprietario nella zona di pericolo. Leggi conseguenze e conferma prima di usarla, soprattutto se il progetto contiene ticket, pagine, file o integrazioni. Se un normale salvataggio fallisce, conserva i valori desiderati, leggi l’errore e aggiorna il progetto prima di riprovare. Evita di inviare più volte un’azione distruttiva quando il suo primo risultato è incerto.

## Invitare persone a un progetto {#project-members}

Il proprietario del progetto gestisce l’appartenenza nelle impostazioni dei membri. Chiedi al collaboratore l’email che usa su questa istanza, invia l’invito e controlla che sia in attesa. La stessa email su un’altra istanza non dà accesso qui.

La persona invitata accede con quell’account e apre la posta in arrivo. Accetta l’invito in attesa per entrare o rifiutalo se il progetto è inatteso. Il dialogo di ingresso iniziale aiuta a condividere la tua email con il proprietario; non permette di entrare in progetti senza invito.


![Invito via email e tre membri dimostrativi, con il proprietario identificato.](/documentation/it/project-members.png)

### Responsabilità di proprietario e membri {#member-permissions}

| Persona | Accesso tipico al progetto |
| --- | --- |
| Membro | Lavorare con ticket, pagine e spazi di collaborazione del progetto; gestire le proprie preferenze dell’account. |
| Proprietario | Attività dei membri più impostazioni del progetto, inviti e configurazioni di integrazione o automazione riservate al proprietario. |
| Visitatore tramite collegamento pubblico | Solo il contenuto pubblicato esplicitamente attraverso quel collegamento; nessuna appartenenza al progetto. |

Controlla l’elenco dei membri prima di rimuovere qualcuno. La riga del proprietario non offre un’azione di rimozione e questi controlli non trasferiscono la proprietà del progetto. Il proprietario può annullare un invito in attesa prima che venga accettato; lo stato in attesa non rivela se quell’indirizzo ha già un account. La rimozione interrompe l’accesso come membro; non ritira esportazioni, schermate o copie già ricevute. Le credenziali personali Git, IA e MCP restano dell’account e non si trasferiscono con il cambio di proprietario del progetto.

### Risolvere la mancanza di accesso {#invitation-recovery}

Se un invito manca, confronta l’email invitata con l’account connesso e verifica l’URL dell’istanza. Chiedi al proprietario di controllare gli inviti in attesa invece di creare ripetutamente account. Se i permessi cambiano durante una sessione aperta, ricarica la destinazione e verifica l’appartenenza prima di riprovare a scrivere. Non condividere la sessione di un’altra persona per aggirare un errore di accesso.
