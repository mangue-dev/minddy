---
{
  "id": "projects",
  "locale": "it",
  "title": "Progetti e membri",
  "summary": "Configura un progetto, invita i collaboratori, scegli i loro ruoli e trasferisci la proprietà.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles",
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
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; it translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (it translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root/min693_it with agent:/root (it MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
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
      "revision": 9,
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
      "revision": 9,
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

Un progetto raccoglie ticket, obiettivi, pagine e le persone che ci lavorano. Il suo unico proprietario gestisce le impostazioni amministrative, gli inviti e i ruoli. I membri lavorano sui contenuti e i lettori li seguono; entrambi possono lasciare il progetto. Usa le sezioni seguenti per configurare il progetto, scegliere chi può fare cosa, trasferire la proprietà o risolvere un problema di invito.

## Configurare un progetto {#project-settings}

Apri il progetto e poi le sue impostazioni. La proprietà del progetto determina l’accesso alle impostazioni amministrative. I membri e i lettori possono consultare la sezione generale, nascondere il progetto per sé e lasciarlo, ma non ottengono i controlli di modifica del proprietario.

Come proprietario, inserisci un nome non vuoto e una chiave di progetto valida, quindi salva. La chiave viene convertita in maiuscolo e usa da 2 a 5 lettere ASCII. Dopo averla cambiata, controlla gli identificativi risultanti. Usa i controlli di icona e aspetto per distinguere il progetto nella navigazione; queste scelte visive non cambiano l’appartenenza al progetto.

Le altre sezioni gestiscono collaboratori, ticket ricorrenti, Git, importazione, integrazioni, automazione e feedback. Segui la guida dell’attività corrispondente prima di abilitare un fornitore o lavoro automatico. Le preferenze dell’account, come la lingua dell’interfaccia, sono separate dalla configurazione del progetto.


![Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.](/documentation/it/project-general.png)

### Nascondere un progetto per te {#hide-project}

Nascondi un progetto che non segui più ogni giorno per toglierlo dalla tua barra laterale e dalla tua home senza lasciarlo. Nelle impostazioni generali del progetto, scegli **Nascondi** in **Visibilità per te**, oppure fai clic con il tasto destro sul progetto nella barra laterale e scegli **Nascondi progetto**. Chiunque faccia parte del progetto può nasconderlo, compresi il proprietario e i lettori.

Nascondere cambia solo la tua navigazione. La preferenza è salvata nel tuo account, quindi resta dopo un nuovo accesso e sugli altri tuoi dispositivi. Mantieni il tuo accesso e puoi ancora aprire e modificare il progetto da un link diretto o da **Impostazioni account** → **Preferenze** → **Progetti nascosti**. Gli altri membri continuano a vedere il progetto, e le sue routine, integrazioni e notifiche continuano a funzionare. Aprire un progetto nascosto non lo riporta nella tua barra laterale.

Per ritrovarlo, scegli **Mostra** in **Progetti nascosti** o nelle impostazioni generali del progetto, oppure scegli **Mostra progetto** dal suo menu nella barra laterale. Se la modifica non può essere salvata, compare un errore e il progetto torna allo stato precedente; riprova. A differenza di lasciare il progetto o spostarlo nel cestino, nasconderlo non rimuove mai accesso o contenuti.

### Lasciare ed eliminare {#project-removal}

Un membro o un lettore può usare l’azione per lasciare il progetto e rimuovere il proprio accesso. Chiedi al proprietario un nuovo invito se ti servirà di nuovo. Lasciare un progetto non lo elimina per tutti. Il proprietario non può lasciare il progetto: prima [trasferisci la proprietà](#transfer-ownership) a un membro.

L’eliminazione del progetto è un’azione del proprietario nella zona di pericolo. Leggi conseguenze e conferma prima di usarla, soprattutto se il progetto contiene ticket, pagine, file o integrazioni. Se un normale salvataggio fallisce, conserva i valori desiderati, leggi l’errore e aggiorna il progetto prima di riprovare. Evita di inviare più volte un’azione distruttiva quando il suo primo risultato è incerto.

Il proprietario può anche fare clic con il tasto destro sul progetto nella barra laterale e scegliere **Spostati nel cestino**. Compare la stessa conferma e viene interessato solo il progetto su cui hai fatto clic.

## Invitare persone a un progetto {#project-members}

Il proprietario del progetto gestisce l’appartenenza in **Impostazioni del progetto** → **Membri**. Chiedi al collaboratore l’email che usa su questa istanza, scegli il suo ruolo, invia l’invito e controlla che sia in attesa. Scegli **Membro** per chi lavora sul progetto, oppure **Lettore** per chi si limita a seguirlo. Per un lettore, attiva **Può commentare** se deve partecipare alle discussioni. Finché l’invito è in attesa, il proprietario può cambiarne il ruolo e l’opzione di commento. La stessa email su un’altra istanza non dà accesso qui.

La persona invitata accede con quell’account e apre la posta in arrivo. Accetta l’invito in attesa per entrare con il ruolo che prevede, oppure rifiutalo se il progetto è inatteso. Il dialogo di ingresso iniziale aiuta a condividere la tua email con il proprietario; non permette di entrare in progetti senza invito.


![Invito via email e tre membri dimostrativi, con il proprietario identificato.](/documentation/it/project-members.png)

### Ruoli di proprietario, membro e lettore {#member-permissions}

| Ruolo | Accesso al progetto |
| --- | --- |
| Proprietario | Uno per progetto. Tutto ciò che può fare un membro, più impostazioni del progetto, inviti e ruoli, integrazioni, collegamento Git, routine, trasferimento della proprietà ed eliminazione del progetto. |
| Membro | Tutto il lavoro sui contenuti: ticket, piani, obiettivi, feedback, pagine e database, commenti, file, viste condivise e link di pubblicazione, azioni Git e sulle pull request, Numo e MCP. Può lasciare il progetto. |
| Lettore | Legge i contenuti, i membri e le routine del progetto. Può nascondere il progetto, comparire tra chi sta visualizzando una pagina, usare viste personali e notifiche, e lasciare il progetto. Non può modificare i contenuti, ricevere assegnazioni, guidare un obiettivo o pubblicare link, e non vede le integrazioni né i token di condivisione e della bacheca. |
| Lettore con **Può commentare** | Accesso da lettore più i commenti su ticket, obiettivi, discussioni interne dei feedback e pagine: risposte, menzioni, file allegati ai propri commenti e modifica o eliminazione dei propri commenti. Le risposte pubbliche sulla bacheca dei feedback e i commenti o le reazioni sulle pull request restano non disponibili. |
| Visitatore tramite collegamento pubblico | Solo il contenuto pubblicato esplicitamente attraverso quel collegamento; nessuna appartenenza al progetto. |

I lettori contano nel limite di ospiti per progetto del piano come i membri, e lo stesso vale per gli inviti in attesa. Non esiste una fatturazione per postazione.

Controlla l’elenco dei membri prima di rimuovere qualcuno. La riga del proprietario non offre un’azione di rimozione; solo un [trasferimento](#transfer-ownership) cambia il proprietario. Il proprietario può annullare un invito in attesa prima che venga accettato; lo stato in attesa non rivela se quell’indirizzo ha già un account. La rimozione interrompe l’accesso come membro; non ritira esportazioni, schermate o copie già ricevute. Le credenziali personali Git, IA e MCP restano dell’account e non si trasferiscono con il cambio di proprietario del progetto.

### Cambiare il ruolo di un membro {#change-role}

Come proprietario, apri **Impostazioni del progetto** → **Membri** e scegli il nuovo ruolo della persona: **Membro** o **Lettore**. Per un lettore, scegli se attivare **Può commentare**. Questa opzione è disattivata per impostazione predefinita e viene disattivata ogni volta che qualcuno diventa lettore, quindi controllala dopo aver cambiato un membro in Lettore. Il tuo ruolo di proprietario cambia solo tramite un trasferimento.

Cambiare un membro in Lettore annulla anche l’assegnazione dei suoi ticket aperti e lo rimuove come responsabile dei suoi obiettivi, il che toglie quei ticket dal suo ciclo personale. Riassegna quel lavoro se deve proseguire.

Un cambio di ruolo si applica alla richiesta successiva della persona, nell’applicazione, in Numo e tramite MCP. I contenuti che ha già caricato o scaricato non vengono ritirati, e un link firmato a un file che ha già aperto può restare valido per qualche minuto.

### Risolvere la mancanza di accesso {#invitation-recovery}

Se un invito manca, confronta l’email invitata con l’account connesso e verifica l’URL dell’istanza. Chiedi al proprietario di controllare gli inviti in attesa invece di creare ripetutamente account. Se il tuo ruolo cambia durante una sessione aperta, ricarica la destinazione e verifica il tuo ruolo prima di riprovare a scrivere. Un lettore che deve modificare chiede al proprietario di cambiare il suo ruolo in Membro. Non condividere la sessione di un’altra persona per aggirare un errore di accesso.

## Trasferire la proprietà {#transfer-ownership}

Un progetto ha esattamente un proprietario. Per cederlo, apri **Impostazioni del progetto** → **Membri** come proprietario, scegli **Trasferisci la proprietà** per un membro esistente e conferma. Solo un Membro può ricevere la proprietà; prima invita la persona o cambia un lettore in Membro. Dopo il trasferimento, resti nel progetto come Membro.

### Cosa cambia con la proprietà {#transfer-effects}

- Le tue routine in questo progetto vengono sospese e non possono avviare nuovo lavoro. Il nuovo proprietario crea le routine che devono proseguire con il proprio budget.
- I limiti del piano per ticket e ospiti per progetto, lo spazio di archiviazione e l’IA in background, come Smart Assign e la revisione dei feedback, ora usano il piano e il budget del nuovo proprietario. I ticket e i membri esistenti vengono mantenuti.
- Abbonamenti, metodi di pagamento e chiavi e connessioni personali restano a ciascun account.
- Gli inviti in attesa restano validi.

Il trasferimento fallisce senza modificare nulla se lo spazio di archiviazione del nuovo proprietario non può contenere i file del progetto, oppure se possiede già un progetto con la stessa chiave. Libera spazio o cambia la chiave del progetto, quindi riprova.
