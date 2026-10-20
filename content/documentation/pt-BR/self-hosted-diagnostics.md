---
{
  "id": "self-hosted-diagnostics",
  "locale": "pt-BR",
  "title": "Diagnóstico da instância",
  "summary": "Execute o doctor em modo somente leitura, associe sintomas e verificações e preserve dados e segredos durante o diagnóstico.",
  "topic": "Operar uma instância",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Diagnosticar uma instalação self-hosted"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Diagnosticar uma instalação self-hosted {#self-hosted-diagnostics}

Execute o doctor em modo somente leitura a partir da versão instalada com seu ambiente protegido. Para `--mode full`, forneça o Compose upstream; para managed, forneça a conexão do provedor. O doctor verifica compatibilidade, configuração, containers, DNS, TLS, aplicação, disco e agendador. As verificações de banco, migrações e Storage exigem uma conexão. O relatório oculta segredos, mas você ainda precisa revisá-lo antes de compartilhar. A saúde dos serviços não comprova entrega de email, decifragem ou recuperação de arquivos.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Associar sintomas e verificações {#symptoms}

Se receber muitos 401 após restaurar, confira se JWT, chaves anon e service-role pertencem à mesma stack. Para uploads com falha ou 404, compare políticas, registros, bytes e chaves. Se faltarem relações, preserve o primeiro erro de migração e confira espaço, bloqueios e URL do banco; repita o bootstrap depois de corrigir a causa. Não marque manualmente como aplicadas as migrações que falharam. Para Realtime, confira publication, JWT, WebSocket e logs. Para cron inativo ou 401, verifique em privado agendador, origem e `CRON_SECRET`. Se a compatibilidade de versão falhar, compare `MINDDY_RELEASE` com uma linha de `deploy/self-hosted/compatibility.json` e `MINDDY_IMAGE` com essa linha ou com o digest imutável verificado. O instalador copia `MINDDY_RELEASE` do modelo de implantação.

## Preservar a recuperação {#recovery}

Corrija Docker, CLI ou valores API e repita o instalador idempotente preservando o ambiente existente. Depois de corrigir URLs de runtime, recrie a aplicação sem recompilar OCI. Não apague buckets preenchidos, dados ou chaves raiz para eliminar um aviso. Recursos opcionais desativados podem ser normais. Compartilhe versão, perfil, horários, códigos e logs sanitizados; exclua senhas, tokens, cabeçalhos `Authorization`, cookies, URLs privadas e conteúdo de usuários.



Se o primeiro download parar com um log longo de progresso e sem erro do registro de imagens, o instalador v0.11.0 pode ter excedido o buffer de saída do subprocesso. Os instaladores posteriores baixam em modo silencioso com um buffer maior e, se a saída ainda o exceder, param com uma instrução explícita. Em ambos os casos, execute `compose pull --quiet` no contexto Compose exato da instalação e depois repita o mesmo instalador com `--skip-pull` para usar as imagens locais, preservando o ambiente. Isso não corrige erros do registro nem assinaturas inválidas.

Se a compilação offline indicar uma versão `jose` diferente, pare. As ferramentas de v0.11.0 exigem 6.2.3, mas sua dependência direta fixada resolve 6.2.12; obtenha uma combinação corrigida de versão e ferramentas antes de aceitar essa instalação. Nas releases seguintes, a versão fixada corresponde à dependência fixada, então uma diferença indica que `pnpm install --frozen-lockfile` não terminou nesse checkout. Não afrouxe silenciosamente a verificação de identidade.


O runner OCI de v0.11.0 também não inicia: `agent-runner-storage.mjs` falta na imagem de execução, então a aplicação nunca fica saudável. As releases seguintes removem esse runner e suas sandboxes de código. Atualize para uma dessas releases em vez de montar arquivos do runner ou enfraquecer o isolamento dos containers.
