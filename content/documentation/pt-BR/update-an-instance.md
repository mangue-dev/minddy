---
{
  "id": "update-an-instance",
  "locale": "pt-BR",
  "title": "Atualizações da instância",
  "summary": "Atualize a instância uma versão por vez, preserve um backup completo e verifique migrações e recuperação antes de reabrir o serviço.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Atualizar preservando a recuperação"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/update-an-instance-flow.svg",
      "alt": "Diagrama: Parar escritas e tarefas. Selar backup completo anterior. Migrações alvo, depois aplicação. Verificar recuperação e reabrir.",
      "caption": "Siga as etapas nesta ordem. Parar escritas e tarefas. Selar backup completo anterior. Migrações alvo, depois aplicação. Verificar recuperação e reabrir.",
      "revision": 3,
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
            "title": "Parar escritas e tarefas"
          },
          {
            "title": "Selar backup completo anterior"
          },
          {
            "title": "Migrações alvo, depois aplicação"
          },
          {
            "title": "Verificar recuperação e reabrir"
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

## Atualizar preservando a recuperação {#update-an-instance}

Atualize uma versão publicada por vez. Leia notas da versão, migrações e matriz de compatibilidade. Não combine a atualização do minddy com uma versão principal nova do PostgreSQL ou alterações nas imagens do Supabase. Verifique código, assets e digest do destino e prepare um diretório separado com dependências fixadas. Avise sobre a janela de manutenção e o prazo para cancelar a intervenção. Confirme um backup externo utilizável e um teste recente de restauração. Mantenha a aplicação e o ambiente atuais prontos para recuperação.

![Diagrama: Parar escritas e tarefas. Selar backup completo anterior. Migrações alvo, depois aplicação. Verificar recuperação e reabrir.](/documentation/pt-BR/update-an-instance-flow.svg)

## Atualizar o perfil full {#full}

Use o contexto Compose full do artigo sobre backup a frio. Pare entradas públicas, gravações, workers e agendador, depois crie uma cópia selada completa. Copie o ambiente com permissões `0600` para `TARGET_ENV_FILE` e altere apenas `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` e `MINDDY_ENV_FILE` conforme as identidades verificadas do destino. Preserve URLs, credenciais, chaves e escolhas de recursos. A sequência inicia o backend, aplica migrações e verifica aplicação e runner enquanto Caddy e agendador continuam parados.

Na atualização de v0.10.30 para v0.11.0, a versão de destino introduz `MINDDY_DATA_ROOT_KEY`. Adicione a chave somente se a configuração existente não tiver uma raiz e preserve todos os segredos já usados para criptografar credenciais. O comando abaixo grava uma nova raiz de 32 bytes diretamente no arquivo de destino protegido, sem exibi-la, e recusa a substituição de um valor salvo inválido. A raiz, por si só, não ativa a criptografia de conteúdo. Antes de iniciar o destino, aplique as [adaptações fixadas do runner e das funções offline](/pt-br/documentacao/installation#runner-workaround) e mantenha `RUNNER_FIX_OVERRIDE` em toda operação Compose. Esse perfil é explicitamente adaptado e não comprova uma instalação bem-sucedida da tag histórica sem alterações.

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

## Distinguir managed e código-fonte {#managed-source}

Para managed OCI, siga a mesma sequência de ambiente e imagem usando backup e migrações do banco e Storage gerenciados pelo provedor, sem iniciar serviços locais de banco. A partir do código, compile a tag escolhida, bloqueie APIs, salve um backup lógico ou do provedor, aplique o bootstrap do destino e inicie o servidor atrás da manutenção. Não substitua OCI por um servidor de código para validar seu funcionamento. Só use código antigo sobre esquema novo quando a versão garantir explicitamente a compatibilidade.


Os comandos Compose locais do procedimento de código abaixo servem apenas para backend controlado pelo operador. Com Supabase gerenciado, substitua parada, início e acesso às migrações do backend por operações suportadas pelo provedor. Preserve o ambiente minddy protegido e o backup completo do provedor e depois inicie a aplicação de destino verificada.


Para o procedimento de código, defina `MINDDY_REPO` como o repositório versionado, `SUPABASE_COMPOSE_DIR` como o backend controlado descrito no [contexto de backup lógico](/pt-br/documentacao/backups-and-restoration#outage), `TO_TAG` como a próxima tag realmente publicada e verificada, e `TARGET_RELEASE_DIR` como seu checkout separado já compilado. Forneça as variáveis correspondentes de banco e API pública em privado. Após bootstrap e verificação, inicie o destino com `pnpm start` ou seu supervisor existente atrás da manutenção; reabra apenas após as verificações abaixo.

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

## Verificar o resultado {#verify}

Execute doctor em manutenção antes de reabrir entradas e jobs, e execute normalmente depois da reabertura. Entre, confira identificadores preservados, crie ou altere dados de demonstração e transfira um anexo conferindo seu SHA-256. Teste Realtime e um job inofensivo; uma chave revogada deve continuar falhando. Registre digest e histórico de migrações. Se a verificação falhar, mantenha a stack parada. Um rollback incompatível restaura o conjunto completo anterior em um destino vazio. Migrações inversas não são geradas.
