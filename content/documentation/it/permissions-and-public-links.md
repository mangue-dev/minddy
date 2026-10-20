---
{
  "id": "permissions-and-public-links",
  "locale": "it",
  "title": "Autorizzazioni e link pubblici",
  "summary": "Distingui accesso al progetto e contenuti pubblicati, controlla cosa vede un visitatore e verifica la revoca dei link.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Comprendere permessi e link pubblici"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/it/permissions-and-public-links-flow.svg",
      "alt": "Schema: Permessi account e progetto. Oggetto privato o pubblicazione esplicita. Solo insieme pubblicato e file firmati. Revocare link; file scadono successivamente.",
      "caption": "La pubblicazione concede accesso solo al contenuto scelto; la revoca del link non invalida subito gli URL firmati già emessi.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Permessi account e progetto"
          },
          {
            "title": "Oggetto privato o pubblicazione esplicita"
          },
          {
            "title": "Solo insieme pubblicato e file firmati"
          },
          {
            "title": "Revocare link; file scadono successivamente"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Comprendere permessi e link pubblici {#permissions-and-public-links}

Il server verifica l’accesso al progetto e il tuo ruolo nel progetto per ogni operazione. Ogni progetto ha un solo proprietario, che gestisce le impostazioni riservate, i membri, i ruoli e le integrazioni. I membri lavorano sui contenuti del progetto. I lettori possono leggerli e, quando il proprietario attiva **Può commentare** per loro, commentare; non possono modificare i contenuti né pubblicare link, e non vedono le integrazioni né i token di condivisione e della bacheca. La tabella dei [ruoli del progetto](/docs/projects#member-permissions) elenca l’accesso di ciascun ruolo. Nascondere un controllo nell’interfaccia non concede alcuna autorizzazione. Preferenze personali, quaderno e conversazioni private non diventano condivisi quando aggiungi contesto di progetto. MCP opera con l’account che lo ha autorizzato e segue, a ogni chiamata, il ruolo attuale di quell’account in ciascun progetto; non attribuisce privilegi di amministratore all’agente. Le integrazioni di progetto con chiavi `mdy_` non sono persone: mantengono i permessi fissi del loro tipo e non ricevono alcun ruolo.

Un cambio di ruolo o una rimozione si applica alla richiesta successiva. I contenuti già consegnati non vengono ritirati, e un URL firmato già emesso per un file privato resta valido fino alla scadenza, al massimo 10 minuti dopo.

![Schema: Permessi account e progetto. Oggetto privato o pubblicazione esplicita. Solo insieme pubblicato e file firmati. Revocare link; file scadono successivamente.](/documentation/it/permissions-and-public-links-flow.svg)

## Comprendere cosa viene pubblicato {#publication}

Una pagina pubblicata o una vista condivisa usa un link opaco, eventualmente protetto da password. Il proprietario e i membri possono pubblicare e revocare questi link; i lettori no. Chi possiede il link e, quando richiesta, la password può accedere al contenuto pubblicato. Revoca il link quando non serve più. Le sottopagine vengono risolte solo all’interno dell’insieme pubblicato, senza mostrare i titoli delle pagine escluse. Le URL firmate dei file riguardano solo le pagine incluse; i bucket e le route private rimangono protetti. Le menzioni possono restare testo senza un profilo accessibile. Un database pubblico mostra soltanto le voci del ramo pubblicato.

## Provare pubblicazione e revoca {#revocation}

Apri il link in una sessione separata senza login e controlla contenuti, file ed esclusioni. Revocalo e ripeti la prova. Non puoi richiamare le copie già scaricate; le URL firmate dei file rimangono valide fino alla scadenza, e gli URL dei file emessi per una pagina pubblicata durano 24 ore. I link segreti conservano `noindex`, a differenza del centro di documentazione indicizzabile. `noindex` è un’indicazione per i crawler, non un controllo di accesso. Non inserire link privati in rapporti o esempi pubblici.
