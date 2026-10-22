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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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

Esegui il doctor di sola lettura dalla release installata con il suo ambiente protetto. Per `--mode full` passa il Compose upstream; per managed fornisci la connessione del provider. Il doctor controlla compatibilità, configurazione, container, DNS, TLS, applicazione, disco e scheduler. Le verifiche di database, migrazioni e Storage richiedono una connessione. Il rapporto oscura i segreti, ma devi comunque controllarlo prima di condividerlo. La salute dei servizi non prova consegna email, decifratura o recupero dei file.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Associare sintomi e controlli {#symptoms}

Se dopo un ripristino ricevi molti 401, verifica che JWT, chiavi anon e service-role appartengano allo stesso stack. Per upload falliti o 404 confronta policy, record, byte e chiavi. Se mancano relazioni, conserva il primo errore di migrazione e controlla spazio, lock e URL del database; ripeti il bootstrap dopo aver corretto la causa. Non segnare manualmente come applicate migrazioni fallite. Per Realtime controlla publication, JWT, WebSocket e log. Per cron inattivo o 401 verifica in privato scheduler, origine e `CRON_SECRET`. Se il controllo di compatibilità della versione fallisce, confronta `MINDDY_RELEASE` con una voce di `deploy/self-hosted/compatibility.json` e `MINDDY_IMAGE` con quella voce o con il digest immutabile verificato. Il programma di installazione copia `MINDDY_RELEASE` dal modello di distribuzione.

## Preservare il recupero {#recovery}

Correggi Docker, CLI o valori API e ripeti l’installer idempotente mantenendo l’ambiente esistente. Dopo una correzione delle URL runtime, ricrea l’applicazione senza ricompilare OCI. Non cancellare bucket pieni, dati o chiavi radice per eliminare un avviso. Le funzionalità opzionali disattivate possono essere normali. Condividi release, profilo, orari, codici e log depurati; escludi password, token, header `Authorization`, cookie, URL private e contenuti degli utenti.



Se il primo download si interrompe con un lungo log di avanzamento e senza errori del registro, l’installer v0.11.0 può aver superato il buffer di output del sottoprocesso. Gli installer successivi scaricano in modalità silenziosa con un buffer più ampio e, se l’output lo supera comunque, si fermano con un’istruzione esplicita. In entrambi i casi esegui `compose pull --quiet` nel contesto Compose esatto dell’installazione, poi ripeti lo stesso installer con `--skip-pull` per usare le immagini locali, conservando l’ambiente. Questo non risolve errori del registro né firme non valide.

Se la compilazione offline segnala una versione `jose` diversa, fermati. Gli strumenti di v0.11.0 richiedono 6.2.3, mentre la dipendenza diretta bloccata risolve 6.2.12; ottieni una combinazione corretta di release e strumenti prima di accettare quell’installazione. Nelle release successive il riferimento fissato corrisponde alla dipendenza bloccata, quindi una differenza indica che `pnpm install --frozen-lockfile` non è terminato in quel checkout. Non allentare silenziosamente il controllo d’identità.


Anche il runner OCI v0.11.0 non si avvia: `agent-runner-storage.mjs` manca dall’immagine runtime, quindi l’applicazione non diventa mai integra. Le release successive rimuovono questo runner e le sue sandbox di codice. Aggiorna a una di queste release invece di montare file del runner o indebolire l’isolamento dei container.
