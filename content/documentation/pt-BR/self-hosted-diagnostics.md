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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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

Execute o doctor em modo somente leitura a partir da versão instalada com seu ambiente protegido. Para --mode full, forneça o Compose upstream; para managed, forneça a conexão do provedor. O doctor verifica compatibilidade, configuração, containers, DNS, TLS, aplicação, disco, agendador e runner. As verificações de banco, migrações e Storage exigem uma conexão. O relatório oculta segredos, mas você ainda precisa revisá-lo antes de compartilhar. A saúde dos serviços não comprova entrega de email, decifragem ou recuperação de arquivos.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Associar sintomas e verificações {#symptoms}

Se receber muitos 401 após restaurar, confira se JWT, chaves anon e service-role pertencem à mesma stack. Para uploads com falha ou 404, compare políticas, registros, bytes e chaves. Se faltarem relações, preserve o primeiro erro de migração e confira espaço, bloqueios e URL do banco; repita o bootstrap depois de corrigir a causa. Não marque manualmente como aplicadas as migrações que falharam. Para Realtime, confira publication, JWT, WebSocket e logs. Para cron inativo ou 401, verifique em privado agendador, origem e CRON_SECRET.

## Preservar a recuperação {#recovery}

Corrija Docker, CLI ou valores API e repita o instalador idempotente preservando o ambiente existente. Depois de corrigir URLs de runtime, recrie a aplicação sem recompilar OCI. Não apague buckets preenchidos, dados ou chaves raiz para eliminar um aviso. Recursos opcionais desativados podem ser normais. Compartilhe versão, perfil, horários, códigos e logs sanitizados; exclua senhas, tokens, cabeçalhos Authorization, cookies, URLs privadas e conteúdo de usuários.



Se o primeiro download parar com um log longo de progresso e sem erro do registro de imagens, o instalador v0.11.0 pode ter excedido o buffer de saída do subprocesso. No contexto Compose exato da instalação, compose pull --quiet funcionou no teste descartável. Depois repita o mesmo instalador com --skip-pull para usar as imagens locais, preservando o ambiente. Isso não corrige erros do registro nem assinaturas inválidas. Se a compilação offline indicar uma versão jose diferente após instalar dependências fixadas, pare: a versão exige 6.2.3, mas sua dependência direta fixada resolve 6.2.12. Obtenha uma combinação corrigida de versão e ferramentas antes de aceitar a instalação padrão; não afrouxe silenciosamente a verificação de identidade.


O runner OCI de v0.11.0 também não inicia: agent-runner-storage.mjs falta na imagem de execução. O Dockerfile atual já inclui essa dependência. O ensaio de engenharia descartável forneceu o arquivo da mesma tag por montagem somente leitura; esse perfil modificado não valida a imagem assinada intacta. Não publique a porta do runner nem retire seu isolamento para contornar falhas de início.
