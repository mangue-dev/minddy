---
{
  "id": "self-hosted-diagnostics",
  "locale": "it",
  "title": "Diagnostica dell’istanza",
  "summary": "Esegui il doctor in sola lettura, associa sintomi e controlli e conserva dati e segreti durante la diagnosi.",
  "topic": "Gestire un’istanza",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
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
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Diagnosticare un’installazione self-hosted"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Diagnosticare un’installazione self-hosted {#self-hosted-diagnostics}

Esegui il doctor di sola lettura dalla release installata con il suo ambiente protetto. Per `--mode full` passa il Compose upstream; per managed fornisci la connessione del provider. Il doctor controlla compatibilità, configurazione, container, DNS, TLS, applicazione, disco, scheduler e runner. Le verifiche di database, migrazioni e Storage richiedono una connessione. Il rapporto oscura i segreti, ma devi comunque controllarlo prima di condividerlo. La salute dei servizi non prova consegna email, decifratura o recupero dei file.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Associare sintomi e controlli {#symptoms}

Se dopo un ripristino ricevi molti 401, verifica che JWT, chiavi anon e service-role appartengano allo stesso stack. Per upload falliti o 404 confronta policy, record, byte e chiavi. Se mancano relazioni, conserva il primo errore di migrazione e controlla spazio, lock e URL del database; ripeti il bootstrap dopo aver corretto la causa. Non segnare manualmente come applicate migrazioni fallite. Per Realtime controlla publication, JWT, WebSocket e log. Per cron inattivo o 401 verifica in privato scheduler, origine e `CRON_SECRET`.

## Preservare il recupero {#recovery}

Correggi Docker, CLI o valori API e ripeti l’installer idempotente mantenendo l’ambiente esistente. Dopo una correzione delle URL runtime, ricrea l’applicazione senza ricompilare OCI. Non cancellare bucket pieni, dati o chiavi radice per eliminare un avviso. Le funzionalità opzionali disattivate possono essere normali. Condividi release, profilo, orari, codici e log depurati; escludi password, token, header `Authorization`, cookie, URL private e contenuti degli utenti.



Se il primo download si interrompe con un lungo log di avanzamento e senza errori del registro, l’installer v0.11.0 può aver superato il buffer di output del sottoprocesso. Nel contesto Compose esatto dell’installazione, `compose pull --quiet` ha funzionato nella prova usa e getta. Ripeti poi lo stesso installer con `--skip-pull` per usare le immagini locali, conservando l’ambiente. Questo non risolve errori del registro né firme non valide.

Se la compilazione offline segnala una versione `jose` diversa dopo l’installazione bloccata, fermati: la release richiede 6.2.3, mentre la dipendenza diretta bloccata risolve 6.2.12. Ottieni una combinazione corretta di release e strumenti prima di accettare l’installazione standard; non allentare silenziosamente il controllo d’identità.


Anche il runner OCI v0.11.0 non si avvia: `agent-runner-storage.mjs` manca dall’immagine runtime. Il `Dockerfile` corrente ora include questa dipendenza. La prova di ingegneria usa e getta ha fornito il file dello stesso tag con un mount di sola lettura. È un profilo esplicitamente modificato, non l’accettazione dell’immagine firmata invariata. Non pubblicare la porta del runner né rimuoverne l’isolamento per aggirare un errore di avvio.
