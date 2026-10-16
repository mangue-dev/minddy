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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects",
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
      "lib/server/update-project.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; it translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (it translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/it/project-members.png",
      "alt": "Invito via email e tre membri dimostrativi, con il proprietario identificato.",
      "caption": "Invita con l’email dell’account e identifica il proprietario prima di rimuovere l’accesso di un membro.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Un progetto raccoglie ticket, obiettivi, pagine e membri. Il proprietario gestisce le impostazioni amministrative e gli inviti; i membri lavorano sui contenuti e possono lasciare il progetto.

## Configurare un progetto {#project-settings}

Apri il progetto e poi le sue impostazioni. La proprietà del progetto determina l’accesso alle impostazioni amministrative. I membri possono consultare la sezione generale, nascondere il progetto per sé e lasciarlo, ma non ottengono i controlli di modifica del proprietario.

Come proprietario, inserisci un nome non vuoto e una chiave di progetto valida, quindi salva. La chiave viene convertita in maiuscolo e usa da 2 a 5 lettere ASCII. Dopo averla cambiata, controlla gli identificativi risultanti. Usa i controlli di icona e aspetto per distinguere il progetto nella navigazione; queste scelte visive non cambiano l’appartenenza al progetto.

Le altre sezioni gestiscono collaboratori, ticket ricorrenti, Git, importazione, integrazioni, automazione e feedback. Segui la guida dell’attività corrispondente prima di abilitare un fornitore o lavoro automatico. Le preferenze dell’account, come la lingua dell’interfaccia, sono separate dalla configurazione del progetto.


![Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.](/documentation/it/project-general.png)

### Nascondere un progetto per te {#hide-project}

Nascondi un progetto che non segui più ogni giorno per toglierlo dalla tua barra laterale e dalla tua home senza lasciarlo. Nelle impostazioni generali del progetto, scegli **Nascondi** in **Visibilità per te**, oppure fai clic con il tasto destro sul progetto nella barra laterale e scegli **Nascondi progetto**. Ogni membro può nascondere un progetto, proprietario compreso.

Nascondere cambia solo la tua navigazione. La preferenza è salvata nel tuo account, quindi resta dopo un nuovo accesso e sugli altri tuoi dispositivi. Mantieni il tuo accesso e puoi ancora aprire e modificare il progetto da un link diretto o da **Impostazioni account** → **Preferenze** → **Progetti nascosti**. Gli altri membri continuano a vedere il progetto, e le sue routine, integrazioni e notifiche continuano a funzionare. Aprire un progetto nascosto non lo riporta nella tua barra laterale.

Per ritrovarlo, scegli **Mostra** in **Progetti nascosti** o nelle impostazioni generali del progetto, oppure scegli **Mostra progetto** dal suo menu nella barra laterale. Se la modifica non può essere salvata, compare un errore e il progetto torna allo stato precedente; riprova. A differenza di lasciare il progetto o spostarlo nel cestino, nasconderlo non rimuove mai accesso o contenuti.

### Lasciare ed eliminare {#project-removal}

Un membro può usare l’azione per lasciare il progetto e rimuovere il proprio accesso. Chiedi al proprietario un nuovo invito se ti servirà di nuovo. Lasciare un progetto non lo elimina per tutti.

L’eliminazione del progetto è un’azione del proprietario nella zona di pericolo. Leggi conseguenze e conferma prima di usarla, soprattutto se il progetto contiene ticket, pagine, file o integrazioni. Se un normale salvataggio fallisce, conserva i valori desiderati, leggi l’errore e aggiorna il progetto prima di riprovare. Evita di inviare più volte un’azione distruttiva quando il suo primo risultato è incerto.

Il proprietario può anche fare clic con il tasto destro sul progetto nella barra laterale e scegliere **Spostati nel cestino**. Compare la stessa conferma e viene interessato solo il progetto su cui hai fatto clic.

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
