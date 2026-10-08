---
{
  "id": "update-an-instance",
  "locale": "it",
  "title": "Aggiornamenti dell’istanza",
  "summary": "Aggiorna l’istanza una release alla volta, conserva un backup completo e verifica migrazioni e recupero prima di riaprire il servizio.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Aggiornare conservando la possibilità di recupero"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/it/update-an-instance-flow.svg",
      "alt": "Schema: Fermare scritture e job. Sigillare backup completo precedente. Migrazioni destinazione, poi applicazione. Verificare recupero e riaprire.",
      "caption": "Segui le fasi in questo ordine. Fermare scritture e job. Sigillare backup completo precedente. Migrazioni destinazione, poi applicazione. Verificare recupero e riaprire.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Aggiornare conservando la possibilità di recupero {#update-an-instance}

Aggiorna una release pubblicata alla volta. Leggi note di release, migrazioni e matrice di compatibilità. Non combinare l’aggiornamento di Minddy con una nuova versione principale di PostgreSQL o cambiamenti delle immagini Supabase. Verifica sorgenti, asset e digest della destinazione e prepara una directory separata con dipendenze bloccate. Annuncia la finestra di manutenzione e il termine per annullare l’intervento. Conferma un backup esterno utilizzabile e una prova di ripristino recente. Mantieni l’applicazione e l’ambiente attuali pronti per il recupero.

![Schema: Fermare scritture e job. Sigillare backup completo precedente. Migrazioni destinazione, poi applicazione. Verificare recupero e riaprire.](/documentation/it/update-an-instance-flow.svg)

## Aggiornare il profilo full {#full}

Usa il contesto Compose full dell’articolo sul backup a freddo. Ferma ingressi, scritture, worker e scheduler, poi crea una copia sigillata completa. Copia l’ambiente con permessi 0600 in TARGET_ENV_FILE e modifica solo MINDDY_RELEASE, MINDDY_IMAGE, MINDDY_DEPLOY_DIR e MINDDY_ENV_FILE secondo le identità verificate della destinazione. Conserva URL, credenziali, chiavi e scelte di funzionalità. La sequenza avvia il backend, applica le migrazioni e controlla applicazione e runner mentre Caddy e scheduler rimangono fermi.

Nell’aggiornamento da v0.10.30 a v0.11.0, la versione di destinazione introduce MINDDY_DATA_ROOT_KEY. Aggiungi la chiave soltanto se la configurazione esistente non contiene una radice e conserva tutti i segreti già usati per cifrare le credenziali. Il comando seguente scrive una nuova radice di 32 byte direttamente nel file di destinazione protetto, senza mostrarla, e rifiuta di sostituire un valore salvato non valido. La sola radice non attiva la cifratura dei contenuti. Prima di avviare la destinazione, applica gli [adattamenti vincolati del runner e delle funzioni offline](/it/documentazione/installation#runner-workaround) e conserva RUNNER_FIX_OVERRIDE in ogni operazione Compose. Il profilo è esplicitamente adattato e non dimostra l’installazione riuscita del tag storico invariato.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnvironment} from './scripts/self-hosting-install.mjs';
const file = process.env.TARGET_ENV_FILE;
const text = readFileSync(file, 'utf8');
const values = parseEnvironment(text);
if (Object.hasOwn(values, 'MINDDY_DATA_ROOT_KEY')) {
  if (!/^[a-f0-9]{64}$/i.test(values.MINDDY_DATA_ROOT_KEY)) {
    throw new Error('Recover the valid existing root key; do not replace it.');
  }
} else {
  writeFileSync(file, text + '\nMINDDY_DATA_ROOT_KEY=' + randomBytes(32).toString('hex') + '\n', {mode: 0o600});
  chmodSync(file, 0o600);
}
NODE
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy agent-runner
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Distinguere managed e sorgenti {#managed-source}

Per managed OCI, segui la stessa sequenza di ambiente e immagine usando backup e migrazioni del database e dello Storage gestiti dal provider, senza avviare servizi database locali. Dai sorgenti, compila il tag scelto, blocca le API, salva un backup logico o del provider, applica il bootstrap della destinazione e avvia il server dietro la manutenzione. Non sostituire OCI con un server dai sorgenti per verificarne il funzionamento. Usa il vecchio codice sul nuovo schema solo se la release ne garantisce esplicitamente la compatibilità.


I comandi Compose locali della procedura dai sorgenti seguente riguardano solo un backend controllato dall’operatore. Con Supabase gestito sostituisci arresto, avvio e accesso alle migrazioni del backend con le operazioni supportate dal provider. Conserva l’ambiente Minddy protetto e il backup completo del provider, poi avvia l’applicazione di destinazione verificata.


Per la procedura dai sorgenti, imposta MINDDY_REPO sul repository versionato, SUPABASE_COMPOSE_DIR sul backend controllato descritto nel [contesto del backup logico](/it/documentazione/backups-and-restoration#outage), TO_TAG sul prossimo tag effettivamente pubblicato e verificato e TARGET_RELEASE_DIR sul suo checkout distinto già compilato. Fornisci in privato le variabili database e API pubblica corrispondenti. Dopo bootstrap e verifica, avvia la destinazione con pnpm start o con il supervisore esistente dietro la manutenzione; riapri solo dopo i controlli seguenti.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
```

## Verificare il risultato {#verify}

Esegui doctor in manutenzione prima di riaprire ingressi e job, poi eseguilo normalmente dopo la riapertura. Accedi, controlla gli identificatori conservati, crea o modifica dati demo e trasferisci un allegato verificandone lo SHA-256. Prova Realtime e un job innocuo; una chiave revocata deve ancora fallire. Registra digest e storia delle migrazioni. Se la verifica fallisce, mantieni lo stack fermo. Un rollback incompatibile ripristina l’insieme completo precedente su una destinazione vuota. Non vengono generate migrazioni inverse.
