---
{
  "id": "publish-a-page",
  "locale": "it",
  "title": "Pubblicare una pagina e revocarne il collegamento",
  "summary": "Prova la vista del visitatore, scegli consapevolmente l’accesso ai discendenti e revoca la pubblicazione.",
  "topic": "Pagine e database",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-publish.png",
      "alt": "Finestra di pubblicazione con Privato selezionato e opzioni con password o link.",
      "caption": "Privato mantiene la pagina nel progetto. Controlla chi deve leggerla prima di cambiare la pubblicazione.",
      "revision": 2,
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
    "publish-a-page-steps"
  ]
}
---

## Pubblicare il contenuto previsto {#publish-a-page}

Apri una pagina del progetto come membro e usa i controlli di pubblicazione. Esamina prima contenuto e allegati. Scegli accesso privato, protetto da password o pubblico. La password richiede almeno otto caratteri e viene applicata dopo l’invio; selezionare la modalità non crea da solo un collegamento protetto.

Copia il collegamento /p/ generato dopo la riuscita della pubblicazione. Se la pagina ha discendenti, controlla l’opzione per includerli e il loro numero. Includerli pubblica il ramo selezionato; escluderli lascia i contenuti fuori da quella pubblicazione. Un database senza discendenti pubblicati non espone automaticamente tutti i corpi delle voci.

Apri il collegamento in una sessione separata del browser senza il tuo account. Prova la password se attiva, il contenuto, le sottopagine previste e i download. Questo verifica l’accesso in sola lettura del visitatore, non i tuoi permessi più ampi di membro.


![Finestra di pubblicazione con Privato selezionato e opzioni con password o link.](/documentation/it/page-publish.png)

## Revocare e controllare {#revoke-page}

Torna ai controlli di pubblicazione e scegli privato. Dopo la revoca riuscita, apri il vecchio collegamento in modo anonimo e verifica che l’accesso sia negato. Copie o schermate già ricevute non possono essere ritirate. Gli URL di download dei file già forniti da una pagina pubblicata vengono firmati per un massimo di 24 ore. La revoca impedisce nuove visite alla pagina, ma quegli URL già emessi possono restare validi fino alla scadenza.

I collegamenti delle pagine degli utenti restano noindex e sono separati dal manuale ufficiale indicizzato. Noindex è una politica di scoperta, non una password. Se un discendente o file è leggibile inaspettatamente, revoca prima, controlla il ramo pubblicato e riprova prima di inoltrare un collegamento corretto. I file di pagine non pubblicate non ottengono accesso tramite un riferimento interno.
