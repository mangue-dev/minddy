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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Fermare scritture e job"
          },
          {
            "title": "Sigillare backup completo precedente"
          },
          {
            "title": "Migrazioni destinazione, poi applicazione"
          },
          {
            "title": "Verificare recupero e riaprire"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Aggiornare conservando la possibilità di recupero {#update-an-instance}

Aggiorna una release pubblicata alla volta. Leggi note di release, migrazioni e matrice di compatibilità. Non combinare l’aggiornamento di minddy con una nuova versione principale di PostgreSQL o con la sostituzione di singole immagini Supabase. Quando la voce di destinazione fissa una nuova release ufficiale di Supabase, [sposta la copia di Supabase](#supabase-release) durante la stessa interruzione. Verifica sorgenti, asset e digest della destinazione e prepara una directory separata con dipendenze bloccate. Annuncia la finestra di manutenzione e il termine per annullare l’intervento. Conferma un backup esterno utilizzabile e una prova di ripristino recente. Mantieni l’applicazione e l’ambiente attuali pronti per il recupero.

Alcune migrazioni eliminano definitivamente i dati di funzionalità dismesse. L’aggiornamento da v0.11.0 a v0.20.0 rimuove i record dei domini personalizzati, le esecuzioni e le conversazioni dell’agente di codice con cronologia e connessioni, e le viste salvate della palette dei comandi (segnalibri personali; le viste delle board restano). Dopo queste migrazioni, solo il backup completo precedente all’aggiornamento può recuperarli.

![Schema: Fermare scritture e job. Sigillare backup completo precedente. Migrazioni destinazione, poi applicazione. Verificare recupero e riaprire.](/documentation/it/update-an-instance-flow.svg)

## Aggiornare il profilo full {#full}

Usa il contesto Compose full dell’articolo sul backup a freddo. Ferma ingressi, scritture, worker e scheduler, poi crea una copia sigillata completa. Copia l’ambiente con permessi `0600` in `TARGET_ENV_FILE` e modifica solo `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` e `MINDDY_ENV_FILE` secondo le identità verificate della destinazione. Conserva URL, credenziali, chiavi e scelte di funzionalità. Elimina `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` e le variabili Vercel Sandbox `VERCEL_TOKEN`, `VERCEL_TEAM_ID` e `VERCEL_PROJECT_ID` se una release precedente li ha lasciati: l’applicazione non li legge più e `--remove-orphans` rimuove il container dismesso `agent-runner`. La sequenza avvia il backend, applica le migrazioni e controlla l’applicazione mentre Caddy e scheduler rimangono fermi.

Nell’aggiornamento da v0.10.30 a v0.11.0, la versione di destinazione introduce `MINDDY_DATA_ROOT_KEY`. Aggiungi la chiave soltanto se la configurazione esistente non contiene una radice e conserva tutti i segreti già usati per cifrare le credenziali. Il comando seguente scrive una nuova radice di 32 byte direttamente nel file di destinazione protetto, senza mostrarla, e rifiuta di sostituire un valore salvato non valido. Se l’origine è v0.11.0 o successiva, la radice normalmente esiste già e il comando si limita a verificarla. La sola radice non attiva la cifratura dei contenuti: un ambiente senza `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` la mantiene disattivata.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access api-gw auth rest storage imgproxy
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
node -- scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node -- scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy
compose up -d --wait --remove-orphans minddy
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Passare a una nuova release fissata di Supabase {#supabase-release}

La v0.20.1 fissa Supabase ufficiale `self-hosted/v0.8.3` al posto di `self-hosted/v0.7.2` e risolve così gli avvisi di sicurezza di Storage e Realtime di ottobre 2026. Quando la voce di destinazione fissa un’altra release di Supabase, esegui i comandi seguenti nel profilo full, dopo il backup sigillato e prima della sequenza di aggiornamento precedente. Non estrarre mai il nuovo commit nella directory di Supabase esistente, che contiene i file del database e di Storage. Scaricalo in una nuova directory con gli strumenti della destinazione, poi sposta i dati mentre tutti i servizi sono fermi. Da `self-hosted/v0.8.3` Envoy sostituisce Kong e il servizio gateway si chiama `api-gw`, quindi la sequenza rimuove il container fermo `supabase-kong`. L’ambiente protetto non richiede nuove variabili.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_SUPABASE_DIR=/srv/minddy/supabase-vX.Y.NEXT
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node scripts/fetch-official-supabase.mjs --destination "$TARGET_SUPABASE_DIR"
compose stop
SOURCE_VOLUMES="$SUPABASE_DIR/docker/volumes"
TARGET_VOLUMES="$TARGET_SUPABASE_DIR/docker/volumes"
test ! -e "$TARGET_VOLUMES/db/data"
sudo mv "$SOURCE_VOLUMES/db/data" "$TARGET_VOLUMES/db/data"
if [ -d "$SOURCE_VOLUMES/storage" ]; then
  sudo find "$SOURCE_VOLUMES/storage" -mindepth 1 -maxdepth 1 ! -name .gitkeep \
    -exec mv -t "$TARGET_VOLUMES/storage" {} +
fi
if [ -d "$SOURCE_VOLUMES/snippets" ]; then
  sudo mv "$SOURCE_VOLUMES/snippets" "$TARGET_VOLUMES/snippets"
fi
docker rm supabase-kong 2>/dev/null || true
export SUPABASE_DIR="$TARGET_SUPABASE_DIR"
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
```

Esegui poi la sequenza di aggiornamento del profilo full. Conserva la directory di Supabase precedente finché l’istanza riaperta non supera i controlli. Per tornare indietro, ripristina il backup sigillato con la release precedente e il suo commit di Supabase salvato.

## Distinguere managed e sorgenti {#managed-source}

Per managed OCI, segui la stessa sequenza di ambiente e immagine usando backup e migrazioni del database e dello Storage gestiti dal provider, senza avviare servizi database locali. Dai sorgenti, compila il tag scelto, blocca le API, salva un backup logico o del provider, applica il bootstrap della destinazione e avvia il server dietro la manutenzione. Non sostituire OCI con un server dai sorgenti per verificarne il funzionamento. Usa il vecchio codice sul nuovo schema solo se la release ne garantisce esplicitamente la compatibilità.


I comandi Compose locali della procedura dai sorgenti seguente riguardano solo un backend controllato dall’operatore. Con Supabase gestito sostituisci arresto, avvio e accesso alle migrazioni del backend con le operazioni supportate dal provider. Conserva l’ambiente minddy protetto e il backup completo del provider, poi avvia l’applicazione di destinazione verificata.


Per la procedura dai sorgenti, imposta `MINDDY_REPO` sul repository versionato, `SUPABASE_COMPOSE_DIR` sul backend controllato descritto nel [contesto del backup logico](/it/documentazione/backups-and-restoration#outage), `TO_TAG` sul prossimo tag effettivamente pubblicato e verificato e `TARGET_RELEASE_DIR` sul suo checkout distinto già compilato. Fornisci in privato le variabili database e API pubblica corrispondenti. Dopo bootstrap e verifica, avvia la destinazione con `pnpm start` o con il supervisore esistente dietro la manutenzione; riapri solo dopo i controlli seguenti.

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
