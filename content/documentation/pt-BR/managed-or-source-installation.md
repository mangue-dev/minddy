---
{
  "id": "managed-or-source-installation",
  "locale": "pt-BR",
  "title": "Instalar com Supabase gerenciado ou pelo código-fonte",
  "summary": "Supabase gerenciado indica quem opera o backend.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
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
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.",
      "caption": "Estes componentes têm responsabilidades distintas. Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.",
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
    "managed-or-source-installation-flow"
  ]
}
---

## Instalar com Supabase gerenciado ou pelo código-fonte {#managed-or-source-installation}

Supabase gerenciado indica quem opera o backend. Pode ser usado com a imagem OCI oficial ou com um servidor compilado a partir do código. Separe esses tipos de implantação nos registros de instalação e aceitação. O backend precisa fornecer PostgreSQL, Auth, Storage e Realtime. O caminho OCI managed guiado exige um projeto em supabase.com, sua URL pública, chaves anon e service-role e uma conexão PostgreSQL acessível pelas ferramentas de bootstrap. Use seu próprio projeto, nunca credenciais do Minddy Cloud.

![Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.](/documentation/pt-BR/managed-or-source-installation-flow.svg)

## Configurar Supabase gerenciado {#managed}

Execute o comando abaixo a partir da versão verificada. IMAGE é o digest conferido no artigo de compatibilidade; ... indica valores de exemplo que você deve substituir. Obtenha as credenciais reais em privado e mantenha-as fora do histórico do shell e de logs compartilhados. O instalador conserva o ambiente existente, inclui agendador e runner e não ativa serviços opcionais sem configuração. Configure SMTP Auth e os redirects exatos separadamente no projeto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Concluir implantação pelo código-fonte {#source}

Para instalar a partir do código, instale as dependências fixadas da tag, forneça o ambiente Minddy e Supabase, execute bootstrap e build e inicie o servidor de produção atrás de um proxy. Defina MINDDY_PUBLIC_* antes de iniciar. Você precisa fornecer um agendador persistente com as chamadas autenticadas descritas no artigo de rede: um build não executa jobs. Verifique migrações e Storage, depois Auth, issues, bytes dos anexos e Realtime. Use o procedimento lógico ou do provedor para backup. Um servidor de código não valida a instalação OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
