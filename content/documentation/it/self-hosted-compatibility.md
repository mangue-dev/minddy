---
{
  "id": "self-hosted-compatibility",
  "locale": "it",
  "title": "Scegliere una versione e un profilo supportati",
  "summary": "Usa una versione immutabile del repository pubblico mangue-dev/minddy.",
  "topic": "Gestire un’istanza",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/it/self-hosted-compatibility-flow.svg",
      "alt": "Schema: Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.",
      "caption": "Segui le fasi in questo ordine. Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.",
      "revision": 1,
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
    "self-hosted-compatibility-flow"
  ]
}
---

## Scegliere una versione e un profilo supportati {#self-hosted-compatibility}

Usa una versione immutabile del repository pubblico mangue-dev/minddy. La voce v0.11.0 supporta server Linux amd64 e arm64, Node.js 24, pnpm 10.28.0, Docker Engine da 27.0.0 e plugin Compose da 2.29.0. full fissa Supabase ufficiale self-hosted/v0.7.2 al commit 549db119c44c25167461812041ba198bde2b31a4. Mantieni l’intero insieme di immagini: aggiornare un singolo servizio crea una variante gestita dall’operatore.

managed usa un progetto Supabase su supabase.com che deve fornire PostgreSQL, Auth, Storage e Realtime e superare la verifica della versione. PostgreSQL da solo non basta. Lo stack locale Supabase CLI serve a sviluppo e valutazione, non alla produzione pubblica.


![Schema: Tag sorgente annotato. Asset e SHA256SUMS. Firma e digest OCI ufficiali. Profilo di compatibilità scelto.](/documentation/it/self-hosted-compatibility-flow.svg)

## Verificare prima di eseguire {#verify-release}

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

## Pianificare gestione e aggiornamenti {#support}

Installa una versione pubblicata alla volta. Le migrazioni procedono solo in avanti; un rollback incompatibile ripristina insieme database, Storage, configurazione e applicazione corrispondenti. Minddy mantiene gli strumenti di release e offre assistenza senza garanzia per difetti riproducibili del nucleo. Gestisci tu DNS, TLS, capacità, backup, prove di ripristino e fornitori opzionali. Tag mobili e stack Supabase derivati non ereditano il contratto di supporto.

## Limiti noti del runner nella versione pubblicata {#known-runner-limits}

Il runner pubblicato con v0.11.0 presenta altri impedimenti all’esecuzione del codice: rifiuta i nomi delle sandbox con il suffisso di allocazione, scrive blocchi base64 troppo grandi per un singolo valore d’ambiente Linux e inizializza come root un archivio temporaneo con UID 10001 e modalità 0700 dopo aver rimosso tutte le capability. Quest’ultimo comando può fallire senza che il risultato venga controllato, lasciando inesistente la directory di lavoro. Un endpoint del runner sano non dimostra quindi né la clonazione né l’esecuzione del codice. Il candidato attuale corregge questi percorsi; la prova isolata ha utilizzato il runner e il relativo helper di archiviazione attuali tramite montaggi espliciti in sola lettura sull’immagine v0.11.0. Questo non crea un’immagine pubblicata corretta né una nuova voce di compatibilità supportata. Utilizza una combinazione corretta di release e strumenti e verifica il percorso di lavoro sul codice prima di attivare questi agenti per un team.

Il relay Git di v0.11.0 omette anche la richiesta HTTP Basic, impedendo a un normale client Git di inviare le credenziali. La [soluzione tecnica fissata al commit](/it/documentazione/install-a-server#runner-workaround) fornisce i file corrispondenti del runner e i loro hash; non modifica l’immagine pubblicata e non crea una versione supportata.

L’immagine pubblicata dell’applicazione include Node.js e Git, ma rimuove intenzionalmente npm, npx e Corepack. Il profilo Compose di riferimento sceglie questa immagine anche per i worker tramite AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Non basta per un nuovo worker di codice: il bootstrap OpenCode usa npm per installare il runtime e il plugin fissati, anche in un repository senza dipendenze di progetto. Senza npm, l’esecuzione si ferma al bootstrap; dalla conversazione non si può dedurre che un file del progetto sia stato modificato o che un test sia riuscito. Usa un’immagine dedicata ai worker, costruita e verificata dall’operatore, con Node.js 24, npm, Git e gli strumenti richiesti dal progetto, sovrascrivendo AGENT_RUNNER_SANDBOX_IMAGE nel servizio runner. Mantieni i vincoli di isolamento. Verifica bootstrap, clonazione, test effettivi e diff risultante prima di abilitare la delega di codice. Correggere i file del runner non fornisce questi strumenti al worker.

L’helper di storage fissato rende eseguibile anche l’area di lavoro della sandbox. Altrimenti Docker monta questo tmpfs con noexec, impedendo l’avvio del binario nativo OpenCode e causando potenzialmente un errore fuorviante relativo al pacchetto musl usato come alternativa. La correzione mantiene nosuid, nodev, UID/GID 10001, modalità 0700, filesystem radice in sola lettura, capability rimosse e storage temporaneo distinto per ogni sandbox. Non rende eseguibili i dati dell’host e non trasforma l’immagine dell’applicazione in un’immagine adatta ai worker.
