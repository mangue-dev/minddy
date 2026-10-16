---
{
  "id": "installation",
  "locale": "it",
  "title": "Riferimento per l’installazione",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
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
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx",
      "content/documentation/reviews/premerge-second-operations-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun); agent:/root (installation article labeled as supporting reference; primary wizard entry points verified; existing figures and procedural evidence retained); agent:/root/second_operations (managed runner blocker and key-volume recovery source review; existing helper evidence retained; no operational rerun); agent:/root/min-721 (code-runner removal checked against the edited Compose profiles, installer, doctor, scheduler and capability source; existing figures and procedural evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 it network guidance and terminology review); agent:/root (it installation-reference title review); agent:/root/second_operations (it added installation and recovery safeguards, full retained meaning); agent:/root/min-721 (it runner-removal edits and full retained meaning)",
    "date": "2026-10-16"
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
      "caption": "Segui le fasi in questo ordine. Tag sorgente annotato. Asset e `SHA256SUMS`. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.",
      "revision": 8,
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
            "title": "Tag sorgente annotato"
          },
          {
            "title": "Asset e `SHA256SUMS`"
          },
          {
            "title": "Firma e digest OCI ufficiali"
          },
          {
            "title": "Profilo di compatibilità scelto"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/it/install-a-server-flow.svg",
      "alt": "Schema: Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler. Verifica account, file e recupero.",
      "caption": "Segui le fasi in questo ordine. Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler. Verifica account, file e recupero.",
      "revision": 8,
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
            "title": "Release verificata e ambiente protetto"
          },
          {
            "title": "Installer: profilo full di riferimento"
          },
          {
            "title": "Supabase ufficiale, app, scheduler"
          },
          {
            "title": "Verifica account, file e recupero"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/it/install-a-server-wizard.png",
      "alt": "Assistente pubblico di installazione con Supabase sullo stesso server selezionato.",
      "caption": "Il profilo full mantiene applicazione e Supabase sul tuo server. In questo esempio, l’accesso tramite rete privata è limitato alla rete locale.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        1029
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/it/managed-or-source-installation-flow.svg",
      "alt": "Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.",
      "caption": "La scelta tra immagine OCI e compilazione dai sorgenti cambia la gestione dell’applicazione, mentre il provider gestisce il backend.",
      "revision": 8,
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
            "title": "Il tuo progetto Supabase gestito"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Profilo OCI O applicazione dal tag"
          },
          {
            "title": "Job e backup specifici del profilo"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Per installare minddy sul tuo server, scegli una release verificata e un profilo con Supabase completo, gestito o un’applicazione compilata dai sorgenti. Verifica prima la compatibilità, poi segui la procedura scelta. Prima di accogliere utenti, verifica autenticazione, file e ripristino.

## Disponibilità di MCP e accesso alla rete {#mcp-network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

Scegli un’origine raggiungibile dal client MCP e dal browser di autorizzazione. Sullo stesso computer, un client compatibile può usare `http://localhost:6463/api/mcp`. Da un altro computer della LAN/VPN, usa l’indirizzo configurato del server, per esempio `http://192.168.1.50/api/mcp`, con indirizzo di ascolto, porta dell’applicazione, firewall e instradamento che consentano l’accesso. `localhost` e `127.0.0.1` indicano sempre il computer che avvia la connessione, quindi l’URL localhost del server non funziona lì. Un processo limitato al loopback resta irraggiungibile direttamente. Fuori dalla rete privata, usa un endpoint HTTPS raggiungibile come `https://tickets.example.com/api/mcp` o un percorso di rete supportato, secondo i requisiti del client. Anche un agente ospitato ha bisogno di quel percorso; l’hosting locale non espone automaticamente l’istanza a Internet.

[Leggi la guida all’accesso di rete di MCP prima di collegare un client remoto](/docs/minddy-mcp#network-access).

## Scegliere una versione e un profilo supportati {#self-hosted-compatibility}

Usa una versione immutabile del repository pubblico `mangue-dev/minddy`. La voce v0.11.0 supporta server Linux amd64 e arm64, Node.js 24, `pnpm` 10.28.0, Docker Engine da 27.0.0 e plugin Compose da 2.29.0. full fissa Supabase ufficiale `self-hosted/v0.7.2` al commit `549db119c44c25167461812041ba198bde2b31a4`. Mantieni l’intero insieme di immagini: aggiornare un singolo servizio crea una variante gestita dall’operatore.

managed usa un progetto Supabase su supabase.com che deve fornire PostgreSQL, Auth, Storage e Realtime e superare la verifica della versione. PostgreSQL da solo non basta. Lo stack locale Supabase CLI serve a sviluppo e valutazione, non alla produzione pubblica.


![Schema: Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.](/documentation/it/self-hosted-compatibility-flow.svg)

### Verificare prima di eseguire {#verify-release}

Verifica tag annotato, file della release, `SHA256SUMS` e firma OCI ufficiale prima di installare dipendenze o eseguire codice. I comandi Bash partono dal checkout del tag scelto e impostano `IMAGE` con il digest verificato. Fermati se un controllo fallisce. Installa prima Cosign seguendo la documentazione ufficiale. La verifica dimostra l’identità di codice e immagine, non il funzionamento del sistema.

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

I profili pubblicati in v0.11.0 avviano anche un servizio `agent-runner` che fallisce prima che l’applicazione diventi integra. Le release successive rimuovono completamente questo runner e le sue sandbox di codice: Numo non esegue codice e nessun servizio riceve il socket Docker. Installa una di queste release invece di adattare v0.11.0.


## Installare il profilo server di riferimento {#install-a-server}

Parti da tag verificato e digest immutabile. Linux amd64 e arm64 sono supportati. Riserva 4 GB RAM, due core e 20 GB SSD con Supabase gestito; 8 GB, quattro core e 60 GB se condivide l’host. Il servizio pubblico richiede DNS e HTTPS su origini proprie. HTTP è consentito solo a `localhost` o IPv4 privata. Limitalo a una LAN affidabile senza inoltro porte del router. full espone in questo caso applicazione sulla porta 80 e API su 8000.


![Schema: Release verificata e ambiente protetto. Installer: profilo full di riferimento. Supabase ufficiale, app, scheduler. Verifica account, file e recupero.](/documentation/it/install-a-server-flow.svg)


![Assistente pubblico di installazione con Supabase sullo stesso server selezionato.](/documentation/it/install-a-server-wizard.png)

### Configurare e avviare l’installer {#install}

Esegui `pnpm self-host:install` dalla directory della release. Seleziona il profilo managed o full, l’origine dell’applicazione e l’indirizzo dell’amministratore. Per il profilo full, recupera prima il checkout upstream fissato. Il programma di installazione scrive un file di ambiente con permessi `0600`, genera i segreti mancanti con valori distinti, scarica le immagini del profilo scelto, avvia i servizi ed esegue un bootstrap idempotente. Mantiene il riferimento fissato dell’immagine e i segreti già presenti. L’esempio usa il digest `IMAGE` verificato nell’articolo sulla compatibilità. Per ricevere davvero le email di Auth, aggiungi inizialmente `--skip-start`, poi configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` e `SMTP_SENDER_NAME` nel file protetto prima di ripetere l’installazione. Mantieni `ENABLE_EMAIL_AUTOCONFIRM=false`. Il valore `supabase-mail` è un segnaposto e non corrisponde a una casella di posta per la produzione.


Prima dell’avvio, confronta `MINDDY_RELEASE` e `MINDDY_IMAGE` nel file protetto con la voce di compatibilità scelta e l’asset container verificato. Il modello di v0.11.0 indica ancora 0.10.30. `--image` cambia soltanto il riferimento dell’immagine e non esiste un’opzione `--release`. Per una nuova installazione v0.11.0 preparata con `--skip-start`, imposta esplicitamente `MINDDY_RELEASE=0.11.0` e conserva il riferimento immutabile verificato. Non sostituire le credenziali generate né le chiavi di cifratura. La versione del package candidato non dimostra un profilo 0.11.1 supportato: questo snapshot non contiene la relativa voce di compatibilità.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


Il comando precedente crea `deploy/self-hosted/.env` nella directory della release scelta. Modifica questo file protetto, poi esegui di nuovo lo stesso comando senza `--skip-start` per avviare il profilo ed eseguire il bootstrap. Origini, immagine e segreti esistenti rimangono nel file protetto.

Se esegui questo profilo full su macOS con Docker Desktop, applica l’[override del volume per Storage su filesystem](/it/documentazione/storage-and-attachments#docker-desktop) prima del primo avvio e conserva `RESTORE_OVERRIDE` in ogni operazione Compose successiva. Il bind mount su un host Linux e questo profilo con volume con nome richiedono archivi dei byte diversi: usa la procedura di backup e ripristino corrispondente.

### Verificare prima di accogliere utenti {#accept}

I profili di riferimento includono lo scheduler; non contengono alcun runner di codice e non montano il socket Docker. Non esporre su Internet PostgreSQL né le porte dei servizi interni. Esegui il doctor con il file di ambiente dell’istanza e il file Compose upstream del profilo full. Verifica la conferma dell’account, l’accesso, l’autenticazione MFA, la reimpostazione della password, la creazione di progetti e ticket, il caricamento e il download degli allegati e Realtime in due sessioni. Una risposta 200 da `/api/health` dimostra soltanto che l’applicazione è attiva. Se l’installazione si interrompe, esegui di nuovo l’installer con lo stesso contesto Compose e il file di ambiente protetto; non azzerare i dati. Prima di accogliere un team, prepara un backup su un altro host e verifica il ripristino su una destinazione vuota.




## Installare con Supabase gestito o dai sorgenti {#managed-or-source-installation}

Supabase gestito indica chi opera il backend. Può essere usato sia con l’immagine OCI ufficiale sia con un server compilato dai sorgenti. Distingui questi deployment nei registri di installazione e accettazione. Il backend deve fornire PostgreSQL, Auth, Storage e Realtime. Il percorso OCI managed guidato richiede un progetto su supabase.com, la sua URL pubblica, le chiavi anon e service-role e una connessione PostgreSQL raggiungibile dagli strumenti di bootstrap. Usa un progetto di tua proprietà, mai credenziali minddy Cloud.

![Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.](/documentation/it/managed-or-source-installation-flow.svg)

### Configurare Supabase gestito {#managed}

Esegui il comando seguente dalla release verificata. `IMAGE` è il digest controllato nell’articolo sulla compatibilità; ... indica valori di esempio che devi sostituire. Recupera le credenziali reali in privato e tienile fuori dalla cronologia della shell e dai log condivisi. L’installer conserva l’ambiente esistente, include lo scheduler e non attiva servizi opzionali senza configurazione. Configura separatamente SMTP Auth e i redirect esatti nel progetto Supabase.

Il profilo OCI `managed` pubblicato in v0.11.0 contiene lo stesso runner difettoso del profilo `full`, quindi l’installer invariato non può completare l’avvio. Usa una release successiva senza runner. Il comando seguente prepara la configurazione con `--skip-start`. Rileggi il file protetto conservando l’immagine verificata e i segreti generati, poi esegui di nuovo il comando senza `--skip-start`. Verifica il profilo `managed` prima di ammettere utenti. Non eseguire i comandi di backend locale del profilo full su un progetto del provider.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Completare il deployment dai sorgenti {#source}

Per installare dai sorgenti, installa le dipendenze bloccate del tag, fornisci l’ambiente minddy e Supabase, esegui bootstrap e build e avvia il server di produzione dietro un proxy. Imposta `MINDDY_PUBLIC_*` prima dell’avvio. Devi fornire uno scheduler persistente con le chiamate autenticate descritte nell’articolo sulla rete: un build non esegue i job. Verifica migrazioni e Storage, poi Auth, ticket, byte degli allegati e Realtime. Per il backup usa la procedura logica o del provider. Un server dai sorgenti non valida l’installazione OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
