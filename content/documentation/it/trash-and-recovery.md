---
{
  "id": "trash-and-recovery",
  "locale": "it",
  "title": "Cestino e ripristino",
  "summary": "Trova un oggetto eliminato, ripristina le sue dipendenze e distingui la rimozione definitiva.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Ripristinare lavoro eliminato"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-trash.png",
      "alt": "Ticket dimostrativo recuperabile con trenta giorni rimanenti nel cestino.",
      "caption": "Le azioni della riga permettono di ripristinarlo. Svuotare il cestino è un’operazione definitiva separata.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Trovare e ripristinare un elemento {#trash-and-recovery}

Apri il cestino dal menu dell’account. Contiene lavoro eliminato recuperabile, inclusi ticket, obiettivi, feedback, routine, progetti e pagine supportati. Controlla tipo, momento dell’eliminazione e conservazione rimanente mostrata nell’interfaccia prima di scegliere il ripristino.

Ripristina prima il padre o contenitore richiesto quando l’elemento ne dipende. Per esempio, ripristina un database eliminato prima di una voce eliminata separatamente. Riapri la destinazione ripristinata ed esamina contenuto e proprietà. Gli elementi eliminati restano recuperabili per 30 giorni prima che la conservazione li rimuova definitivamente. Solo il proprietario può ripristinare o rimuovere in modo permanente un progetto o una routine. I membri possono ripristinare o rimuovere gli altri oggetti supportati finché mantengono accesso.

![Ticket dimostrativo recuperabile con trenta giorni rimanenti nel cestino.](/documentation/it/reader-trash.png)

## Eliminazione definitiva e recupero non riuscito {#permanent-removal}

La rimozione definitiva e lo svuotamento del cestino non possono essere annullati. Leggi conferma e numero di elementi prima di procedere; non sono normali modi per nascondere il lavoro concluso. Un elemento oltre la conservazione disponibile potrebbe non essere più recuperabile dall’interfaccia.

Se il ripristino fallisce, leggi l’errore e controlla che progetto o padre esistano e che tu abbia ancora accesso. Non eliminare definitivamente o ricreare oggetti più volte per risolvere un conflitto di ripristino. Esporta i dati importanti prima di eliminare l’account; l’eliminazione dell’account ha conseguenze diverse dal mettere un singolo oggetto nel cestino recuperabile.
