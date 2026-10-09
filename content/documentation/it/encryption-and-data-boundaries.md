---
{
  "id": "encryption-and-data-boundaries",
  "locale": "it",
  "title": "Crittografia e limiti di protezione dei dati",
  "summary": "Dopo la configurazione e la migrazione previste, minddy cifra contenuti e file prima delle scritture persistenti mediante cifratura autenticata lato server.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Comprendere cifratura e dati ancora visibili"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/it/encryption-and-data-boundaries-flow.svg",
      "alt": "Schema: Contenuto cifrato e chiavi avvolte. Radice nella configurazione server protetta. Runtime autorizzato può decifrare. Export e provider richiedono protezione separata.",
      "caption": "La protezione dei contenuti persistenti dipende dalle chiavi del server; esportazioni e invii ai provider richiedono controlli separati.",
      "revision": 4,
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
            "title": "Contenuto cifrato e chiavi avvolte"
          },
          {
            "title": "Radice nella configurazione server protetta"
          },
          {
            "title": "Runtime autorizzato può decifrare"
          },
          {
            "title": "Export e provider richiedono protezione separata"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Comprendere cifratura e dati ancora visibili {#encryption-and-data-boundaries}

Dopo la configurazione e la migrazione previste, minddy cifra contenuti e file prima delle scritture persistenti mediante cifratura autenticata lato server. Le chiavi di progetto, utente e sistema sono versionate e protette da una chiave radice conservata fuori da PostgreSQL. Una sola estrazione del database non permette di leggere i contenuti protetti senza le chiavi. L’applicazione li decifra per utenti autorizzati, ricerca e lavoro IA autorizzato, anche senza una sessione interattiva. Un runtime compromesso o l’accesso sia ai dati sia alle chiavi supera questo confine: l’operatore non è escluso da una protezione end-to-end.

![Schema: Contenuto cifrato e chiavi avvolte. Radice nella configurazione server protetta. Runtime autorizzato può decifrare. Export e provider richiedono protezione separata.](/documentation/it/encryption-and-data-boundaries-flow.svg)

## Riconoscere dati leggibili ed esportati {#exceptions}

Auth conserva l’indirizzo email di login. Gli identificatori, le chiavi di progetto e ticket, gli stati, le priorità, le date e i metadati consentiti rimangono interrogabili. I contenuti pubblicati sono intenzionalmente leggibili. Devi proteggere separatamente esportazioni, file scaricati, browser e dati inviati a provider esterni di IA, email, Git o MCP. Un flag non dimostra che i dati storici siano stati convertiti o rimossi da copie, log e provider. L’esame dei sorgenti non prova che la migrazione di cifratura sia stata eseguita su minddy Cloud in produzione.

## Preservare il recupero {#recovery}

Proteggi `MINDDY_DATA_ROOT_KEY` fuori dal database e conserva il materiale di recupero necessario ai backup attuali e storici. Ripristina insieme database, byte dei file e configurazione. Cifra il backup esterno che contiene sia dati sia chiavi. Cambiare la radice senza riavvolgere le chiavi rende i contenuti illeggibili; disattivare il flag non li riporta in chiaro. Prima di attivare la cifratura su un’istanza esistente, prova il recupero e verifica la decifratura e i byte effettivamente restituiti.
