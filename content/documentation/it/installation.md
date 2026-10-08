---
{
  "id": "installation",
  "locale": "it",
  "title": "Installazione self-hosted",
  "summary": "Scegli una versione e un profilo verificati, installa il profilo completo, gestito o dai sorgenti e verifica i suoi limiti operativi.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Scegliere una versione e un profilo supportati",
    "Installare il profilo server di riferimento",
    "Installare con Supabase gestito o dai sorgenti"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/it/self-hosted-compatibility-flow.svg",
      "alt": "Schema: Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.",
      "caption": "Segui le fasi in questo ordine. Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/it/install-a-server-flow.svg",
      "alt": "Schema: Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler, runner. Verifica account, file e recupero.",
      "caption": "Segui le fasi in questo ordine. Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler, runner. Verifica account, file e recupero.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/it/install-a-server-wizard.png",
      "alt": "Assistente pubblico di installazione con Supabase sullo stesso server selezionato.",
      "caption": "Il profilo full mantiene applicazione e Supabase sul tuo server. In questo esempio, l’accesso tramite rete privata è limitato alla rete locale.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/it/managed-or-source-installation-flow.svg",
      "alt": "Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.",
      "caption": "Questi componenti hanno responsabilità distinte. Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.",
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
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Per installare minddy sul tuo server, scegli una release verificata e un profilo con Supabase completo, gestito o un’applicazione compilata dai sorgenti. Questa guida distingue le procedure e i limiti della versione pubblicata dagli adattamenti tecnici espliciti. Prima di accogliere utenti, verifica autenticazione, file, lavoro sul codice se abilitato e ripristino.

## Scegliere una versione e un profilo supportati {#self-hosted-compatibility}

Usa una versione immutabile del repository pubblico mangue-dev/minddy. La voce v0.11.0 supporta server Linux amd64 e arm64, Node.js 24, pnpm 10.28.0, Docker Engine da 27.0.0 e plugin Compose da 2.29.0. full fissa Supabase ufficiale self-hosted/v0.7.2 al commit 549db119c44c25167461812041ba198bde2b31a4. Mantieni l’intero insieme di immagini: aggiornare un singolo servizio crea una variante gestita dall’operatore.

managed usa un progetto Supabase su supabase.com che deve fornire PostgreSQL, Auth, Storage e Realtime e superare la verifica della versione. PostgreSQL da solo non basta. Lo stack locale Supabase CLI serve a sviluppo e valutazione, non alla produzione pubblica.


![Schema: Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.](/documentation/it/self-hosted-compatibility-flow.svg)

### Verificare prima di eseguire {#verify-release}

Verifica tag annotato, file della release, SHA256SUMS e firma OCI ufficiale prima di installare dipendenze o eseguire codice. I comandi Bash partono dal checkout del tag scelto e impostano IMAGE con il digest verificato. Fermati se un controllo fallisce. Installa prima Cosign seguendo la documentazione ufficiale. La verifica dimostra l’identità di codice e immagine, non il funzionamento del sistema.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Pianificare gestione e aggiornamenti {#support}

Installa una versione pubblicata alla volta. Le migrazioni procedono solo in avanti; un rollback incompatibile ripristina insieme database, Storage, configurazione e applicazione corrispondenti. minddy mantiene gli strumenti di release e offre assistenza senza garanzia per difetti riproducibili del nucleo. Gestisci tu DNS, TLS, capacità, backup, prove di ripristino e fornitori opzionali. Tag mobili e stack Supabase derivati non ereditano il contratto di supporto.

### Limiti noti del runner nella versione pubblicata {#known-runner-limits}

Il runner pubblicato con v0.11.0 presenta altri impedimenti all’esecuzione del codice: rifiuta i nomi delle sandbox con il suffisso di allocazione, scrive blocchi base64 troppo grandi per un singolo valore d’ambiente Linux e inizializza come root un archivio temporaneo con UID 10001 e modalità 0700 dopo aver rimosso tutte le capability. Quest’ultimo comando può fallire senza che il risultato venga controllato, lasciando inesistente la directory di lavoro. Un endpoint del runner sano non dimostra quindi né la clonazione né l’esecuzione del codice. Il candidato attuale corregge questi percorsi; la prova isolata ha utilizzato il runner e il relativo helper di archiviazione attuali tramite montaggi espliciti in sola lettura sull’immagine v0.11.0. Questo non crea un’immagine pubblicata corretta né una nuova voce di compatibilità supportata. Utilizza una combinazione corretta di release e strumenti e verifica il percorso di lavoro sul codice prima di attivare questi agenti per un team.

Il relay Git di v0.11.0 omette anche la richiesta HTTP Basic, impedendo a un normale client Git di inviare le credenziali. La [soluzione tecnica fissata al commit](/it/documentazione/installation#runner-workaround) fornisce i file corrispondenti del runner e i loro hash; non modifica l’immagine pubblicata e non crea una versione supportata.

L’immagine pubblicata dell’applicazione include Node.js e Git, ma rimuove intenzionalmente npm, npx e Corepack. Il profilo Compose di riferimento sceglie questa immagine anche per i worker tramite AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Non basta per un nuovo worker di codice: il bootstrap OpenCode usa npm per installare il runtime e il plugin fissati, anche in un repository senza dipendenze di progetto. Senza npm, l’esecuzione si ferma al bootstrap; dalla conversazione non si può dedurre che un file del progetto sia stato modificato o che un test sia riuscito. Usa un’immagine dedicata ai worker, costruita e verificata dall’operatore, con Node.js 24, npm, Git e gli strumenti richiesti dal progetto, sovrascrivendo AGENT_RUNNER_SANDBOX_IMAGE nel servizio runner. Mantieni i vincoli di isolamento. Verifica bootstrap, clonazione, test effettivi e diff risultante prima di abilitare la delega di codice. Correggere i file del runner non fornisce questi strumenti al worker.

L’helper di storage fissato rende eseguibile anche l’area di lavoro della sandbox. Altrimenti Docker monta questo tmpfs con noexec, impedendo l’avvio del binario nativo OpenCode e causando potenzialmente un errore fuorviante relativo al pacchetto musl usato come alternativa. La correzione mantiene nosuid, nodev, UID/GID 10001, modalità 0700, filesystem radice in sola lettura, capability rimosse e storage temporaneo distinto per ogni sandbox. Non rende eseguibili i dati dell’host e non trasforma l’immagine dell’applicazione in un’immagine adatta ai worker.

## Installare il profilo server di riferimento {#install-a-server}

Parti da tag verificato e digest immutabile. Linux amd64 e arm64 sono supportati. Riserva 4 GB RAM, due core e 20 GB SSD con Supabase gestito; 8 GB, quattro core e 60 GB se condivide l’host. Il servizio pubblico richiede DNS e HTTPS su origini proprie. HTTP è consentito solo a localhost o IPv4 privata. Limitalo a una LAN affidabile senza inoltro porte del router. full espone in questo caso applicazione sulla porta 80 e API su 8000.


![Schema: Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler, runner. Verifica account, file e recupero.](/documentation/it/install-a-server-flow.svg)


![Assistente pubblico di installazione con Supabase sullo stesso server selezionato.](/documentation/it/install-a-server-wizard.png)

### Configurare e avviare l’installer {#install}

Esegui pnpm self-host:install dalla directory della release. Seleziona il profilo managed o full, l’origine dell’applicazione e l’indirizzo dell’amministratore. Per il profilo full, recupera prima il checkout upstream fissato. Il programma di installazione scrive un file di ambiente con permessi 0600, genera i segreti mancanti con valori distinti, scarica le immagini del profilo scelto, avvia i servizi ed esegue un bootstrap idempotente. Mantiene il riferimento fissato dell’immagine e i segreti già presenti. L’esempio usa il digest IMAGE verificato nell’articolo sulla compatibilità. Per ricevere davvero le email di Auth, aggiungi inizialmente --skip-start, poi configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL e SMTP_SENDER_NAME nel file protetto prima di ripetere l’installazione. Mantieni ENABLE_EMAIL_AUTOCONFIRM=false. Il valore supabase-mail è un segnaposto e non corrisponde a una casella di posta per la produzione.


Prima dell’avvio, confronta MINDDY_RELEASE e MINDDY_IMAGE nel file protetto con la voce di compatibilità scelta e l’asset container verificato. Il modello di v0.11.0 indica ancora 0.10.30. --image cambia soltanto il riferimento dell’immagine e non esiste un’opzione --release. Per una nuova installazione v0.11.0 preparata con --skip-start, imposta esplicitamente MINDDY_RELEASE=0.11.0 e conserva il riferimento immutabile verificato. Non sostituire le credenziali generate né le chiavi di cifratura. La versione del package candidato non dimostra un profilo 0.11.1 supportato: questo snapshot non contiene la relativa voce di compatibilità.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


Il comando precedente crea deploy/self-hosted/.env nella directory della release scelta. Modifica questo file protetto prima dell’avvio. Per la variante tecnica v0.11.0 descritta qui, ferma il programma automatico dopo la configurazione: segui [la procedura fissata del runner e dei worker](/it/documentazione/installation#runner-workaround), poi [l’avvio esplicito del profilo full](/it/documentazione/installation#adapted-start). Non eseguire nuovamente il vecchio programma senza --skip-start: omette l’overlay necessario e non può completare questa variante. Origini, immagine e segreti esistenti rimangono nel file protetto.

### Verificare prima di accogliere utenti {#accept}

I profili di riferimento includono lo scheduler e il runner di sandbox fidato. Non esporre su Internet la porta 6464 del runner né PostgreSQL. Esegui il doctor con il file di ambiente dell’istanza e il file Compose upstream del profilo full. Verifica la conferma dell’account, l’accesso, l’autenticazione MFA, la reimpostazione della password, la creazione di progetti e ticket, il caricamento e il download degli allegati e Realtime in due sessioni. Una risposta 200 da /api/health dimostra soltanto che l’applicazione è attiva. Se l’installazione si interrompe, riprendi la sequenza adattata esplicita con lo stesso contesto Compose e il file di ambiente protetto; non azzerare i dati. Prima di accogliere un team, prepara un backup su un altro host e verifica il ripristino su una destinazione vuota.

### Prerequisiti del runner per il profilo server {#install-a-server-known-runner-limits}

Prima di abilitare il lavoro sul codice, leggi i [limiti del runner v0.11.0](#known-runner-limits) e applica la [variante tecnica fissata](#runner-workaround). Un endpoint sano non prova clonazione o esecuzione; questa variante non crea una nuova release supportata.

### Applicare la soluzione tecnica fissata al commit {#runner-workaround}

Per l’immagine pubblicata v0.11.0, questa variante esplicita degli strumenti fornisce anche la richiesta di autenticazione Basic necessaria ai client Git HTTP. È fissata al commit sorgente 89ab340cb10ec729948fc6e596fb7ab0326fc470: non è una nuova immagine pubblicata né una nuova voce di compatibilità. Prepara prima la configurazione di base e applica questa variante prima di avviare lo stack full. I due file devono rimanere insieme, con gli hash verificati, su storage persistente. Questi comandi non espongono alcuna porta del runner.

Imposta prima il contesto dell’istanza nella [procedura di backup del profilo di riferimento](/it/documentazione/backups-and-restoration#context). La sua funzione Compose deve includere RUNNER_FIX_OVERRIDE. Poi scarica e verifica i due file pubblici riportati sotto. Se un hash non corrisponde, interrompi la procedura.

Questa procedura costruisce anche un’immagine separata per i worker di codice. L’immagine di base è fissata, ma i pacchetti Debian vengono risolti durante la build: ricava l’ID dell’immagine Docker risultante e conserva esattamente questa immagine con il backup. Non sostituirla mai con l’immagine dell’applicazione dopo un ripristino. La build richiede l’accesso al registro dell’immagine di base e ai repository Debian; un nuovo bootstrap OpenCode richiede anche il registro npm. La ricetta fornisce gli strumenti del bootstrap, non tutte le dipendenze dei progetti. Altri strumenti di compilazione richiedono una variante mantenuta esplicitamente. L’overlay Compose seguente imposta direttamente la variabile dell’immagine nel servizio runner, perché il file Compose storico ignora un valore AGENT_RUNNER_SANDBOX_IMAGE isolato nel file protetto.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

Il comando compose up ricrea soltanto il runner. La risposta dello stato non basta comunque per la verifica: controlla una nuova sandbox, la clonazione del repository, un file di oltre 1 MiB, i test e il diff risultante prima di abilitare gli agenti di codice. Mantieni RUNNER_FIX_OVERRIDE e RUNNER_FIX_DIR in ogni shell operativa. Il vecchio programma di installazione e lo strumento di aggiornamento non usano questo override della shell; se uno dei due modifica o ricrea il runner, applica nuovamente questo comando Compose. Includi entrambi i file e l’override nel backup cifrato e ripristina i loro percorsi assoluti prima di riavviare il runner.

La procedura richiede l’immagine dedicata ai worker descritta nei [limiti della versione pubblicata](#known-runner-limits). L’immagine dell’applicazione resta priva di npm, npx e Corepack: correggere i file del runner non basta per il bootstrap del codice. Conserva l’isolamento e verifica bootstrap, clonazione, test e diff prima di abilitare la delega.

### Avviare il profilo full adattato esplicitamente {#adapted-start}

Il programma di installazione v0.11.0 non modificato non può completare questa variante tecnica: l’immagine non contiene l’helper, il pin della funzione non coincide con la dipendenza fissata e non accetta l’overlay del runner riportato sopra. Per questa variante, prepara la configurazione con --skip-start e applica gli strumenti fissati prima del primo avvio. Usa la sequenza full seguente invece di eseguire nuovamente il vecchio programma senza --skip-start. La sostituzione del pin modifica esplicitamente gli strumenti di distribuzione, non il tag pubblicato. Conserva il pin originale insieme alle prove della release.

Se esegui questo profilo full su macOS con Docker Desktop, applica l’[override del volume per Storage su filesystem](/it/documentazione/storage-and-attachments#docker-desktop) prima del primo avvio e conserva RESTORE_OVERRIDE insieme all’override del runner. Il bind mount su un host Linux e questo profilo con volume con nome richiedono archivi dei byte diversi: usa la procedura di backup e ripristino corrispondente.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

Il wrapper legge il file protetto come dati, ricava gli URL privati di manutenzione con gli stessi helper esportati dal programma di installazione e avvia il bootstrap originale con i prerequisiti dello scheduler. Il log diagnostico mantiene i permessi 0600: non allegarlo a un rapporto pubblico senza averlo controllato e ripulito dai dati sensibili. Una fase non riuscita deve interrompere la procedura. Il doctor deve usare lo stesso contesto adattato; verifica i servizi, non la validazione del worker di codice né la consegna da parte dei fornitori esterni.

L’helper di storage fissato rende eseguibile anche l’area di lavoro della sandbox. Altrimenti Docker monta questo tmpfs con noexec, impedendo l’avvio del binario nativo OpenCode e causando potenzialmente un errore fuorviante relativo al pacchetto musl usato come alternativa. La correzione mantiene nosuid, nodev, UID/GID 10001, modalità 0700, filesystem radice in sola lettura, capability rimosse e storage temporaneo distinto per ogni sandbox. Non rende eseguibili i dati dell’host e non trasforma l’immagine dell’applicazione in un’immagine adatta ai worker.

## Installare con Supabase gestito o dai sorgenti {#managed-or-source-installation}

Supabase gestito indica chi opera il backend. Può essere usato sia con l’immagine OCI ufficiale sia con un server compilato dai sorgenti. Distingui questi deployment nei registri di installazione e accettazione. Il backend deve fornire PostgreSQL, Auth, Storage e Realtime. Il percorso OCI managed guidato richiede un progetto su supabase.com, la sua URL pubblica, le chiavi anon e service-role e una connessione PostgreSQL raggiungibile dagli strumenti di bootstrap. Usa un progetto di tua proprietà, mai credenziali minddy Cloud.

![Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.](/documentation/it/managed-or-source-installation-flow.svg)

### Configurare Supabase gestito {#managed}

Esegui il comando seguente dalla release verificata. IMAGE è il digest controllato nell’articolo sulla compatibilità; ... indica valori di esempio che devi sostituire. Recupera le credenziali reali in privato e tienile fuori dalla cronologia della shell e dai log condivisi. L’installer conserva l’ambiente esistente, include scheduler e runner e non attiva servizi opzionali senza configurazione. Configura separatamente SMTP Auth e i redirect esatti nel progetto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

### Completare il deployment dai sorgenti {#source}

Per installare dai sorgenti, installa le dipendenze bloccate del tag, fornisci l’ambiente minddy e Supabase, esegui bootstrap e build e avvia il server di produzione dietro un proxy. Imposta MINDDY_PUBLIC_* prima dell’avvio. Devi fornire uno scheduler persistente con le chiamate autenticate descritte nell’articolo sulla rete: un build non esegue i job. Verifica migrazioni e Storage, poi Auth, ticket, byte degli allegati e Realtime. Per il backup usa la procedura logica o del provider. Un server dai sorgenti non valida l’installazione OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
