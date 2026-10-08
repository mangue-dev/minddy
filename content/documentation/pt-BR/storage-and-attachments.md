---
{
  "id": "storage-and-attachments",
  "locale": "pt-BR",
  "title": "Manter Storage durável e diagnosticar anexos",
  "summary": "O PostgreSQL guarda metadados Storage e referências aos objetos; o backend Storage guarda os bytes.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
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
      "docs/self-hosting.md",
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/storage-and-attachments-flow.svg",
      "alt": "Diagrama: Acesso autorizado ao arquivo. Metadados PostgreSQL do objeto. Bytes brutos em arquivos ou S3. Configuração e chaves correspondentes.",
      "caption": "Estes componentes têm responsabilidades distintas. Acesso autorizado ao arquivo. Metadados PostgreSQL do objeto. Bytes brutos em arquivos ou S3. Configuração e chaves correspondentes.",
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
    "storage-and-attachments-flow"
  ]
}
---

## Manter Storage durável e diagnosticar anexos {#storage-and-attachments}

O PostgreSQL guarda metadados Storage e referências aos objetos; o backend Storage guarda os bytes. Ambos precisam pertencer à mesma instância e ao mesmo ponto de backup. O perfil full com backend filesystem persiste os arquivos em docker/volumes/storage da distribuição upstream fixada. Um backend compatível com S3 exige um snapshot bruto separado. Arquivos efêmeros de containers não são Storage durável. Confira a capacidade para banco, anexos e backups, mantendo as cópias fora do disco ativo.

![Diagrama: Acesso autorizado ao arquivo. Metadados PostgreSQL do objeto. Bytes brutos em arquivos ou S3. Configuração e chaves correspondentes.](/documentation/pt-BR/storage-and-attachments-flow.svg)

## Conferir acesso autorizado {#access}

Arquivos privados exigem autorização antes do download. Publicar uma página expõe apenas arquivos incluídos por URLs assinadas, sem abrir buckets ou rotas privadas. A existência de um objeto não comprova que metadados, políticas, chaves e permissões estejam corretos. Envie e baixe um arquivo com uma conta de demonstração e compare o SHA-256; repita após restaurar para cada bucket.

## Recuperar após uma falha {#recover}

Execute a verificação Supabase, confira se a stack e a chave service-role correspondem e compare registros, bytes e chaves. Corrija serviço, política ou configuração antes de tentar novamente. Não apague um bucket avatars preenchido para remover um aviso. Restaurar apenas SQL não recupera os bytes dos arquivos. Em S3, restaure o snapshot bruto, não por /storage/v1/s3, que cria metadados em conflito.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Storage em sistema de arquivos com Docker Desktop {#docker-desktop}

No perfil macOS com Docker Desktop testado, uma pasta do host montada por bind retornou ENOTSUP quando Storage gravou atributos estendidos. Um novo volume Linux nomeado evitou a falha. Para uma instalação nova sem bytes de objetos, o override persistente abaixo substitui apenas a montagem de Storage. Mantenha RESTORE_OVERRIDE no contexto Compose instalado. Não substitua uma montagem com dados por um volume vazio nem sobrescreva um override de restauração existente: interrompa as gravações e preserve os bytes primeiro com os procedimentos de backup e restauração.

```bash
: "${RESTORE_OVERRIDE:=/etc/minddy/storage-volume.yml}"
export RESTORE_OVERRIDE
test ! -e "$RESTORE_OVERRIDE"
export STORAGE_VOLUME=minddy-filesystem-storage
if docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "Refusing to replace an existing Storage volume." >&2
  exit 1
fi
cat > "$RESTORE_OVERRIDE" <<EOF
services:
  storage:
    volumes:
      - $STORAGE_VOLUME:/var/lib/storage
volumes:
  $STORAGE_VOLUME:
EOF
# Apply this overlay with the installed Compose context before the first start.
```
