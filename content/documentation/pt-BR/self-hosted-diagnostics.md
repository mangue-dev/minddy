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
  "revision": 5,
  "sourceRevision": 5,
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root/min-721 (code-runner removal checked against the edited Compose profiles, installer, doctor, scheduler and capability source; existing figures and procedural evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/min-721 (pt-BR runner-removal edits and full retained meaning)",
    "date": "2026-10-16"
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

Se receber muitos 401 após restaurar, confira se JWT, chaves anon e service-role pertencem à mesma stack. Para uploads com falha ou 404, compare políticas, registros, bytes e chaves. Se faltarem relações, preserve o primeiro erro de migração e confira espaço, bloqueios e URL do banco; repita o bootstrap depois de corrigir a causa. Não marque manualmente como aplicadas as migrações que falharam. Para Realtime, confira publication, JWT, WebSocket e logs. Para cron inativo ou 401, verifique em privado agendador, origem e `CRON_SECRET`.

## Preservar a recuperação {#recovery}

Corrija Docker, CLI ou valores API e repita o instalador idempotente preservando o ambiente existente. Depois de corrigir URLs de runtime, recrie a aplicação sem recompilar OCI. Não apague buckets preenchidos, dados ou chaves raiz para eliminar um aviso. Recursos opcionais desativados podem ser normais. Compartilhe versão, perfil, horários, códigos e logs sanitizados; exclua senhas, tokens, cabeçalhos `Authorization`, cookies, URLs privadas e conteúdo de usuários.



Se o primeiro download parar com um log longo de progresso e sem erro do registro de imagens, o instalador v0.11.0 pode ter excedido o buffer de saída do subprocesso. No contexto Compose exato da instalação, `compose pull --quiet` funcionou no teste descartável. Depois repita o mesmo instalador com `--skip-pull` para usar as imagens locais, preservando o ambiente. Isso não corrige erros do registro nem assinaturas inválidas.

Se a compilação offline indicar uma versão `jose` diferente após instalar dependências fixadas, pare: a versão exige 6.2.3, mas sua dependência direta fixada resolve 6.2.12. Obtenha uma combinação corrigida de versão e ferramentas antes de aceitar a instalação padrão; não afrouxe silenciosamente a verificação de identidade.


O runner OCI de v0.11.0 também não inicia: `agent-runner-storage.mjs` falta na imagem de execução, então a aplicação nunca fica saudável. As releases seguintes removem esse runner e suas sandboxes de código. Atualize para uma dessas releases em vez de montar arquivos do runner ou enfraquecer o isolamento dos containers.
