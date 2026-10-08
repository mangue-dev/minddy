---
{
  "id": "transfer-between-instances",
  "locale": "pt-BR",
  "title": "Transferência de dados da conta",
  "summary": "Exporte os dados da sua conta em um JSON privado, importe-os sem substituir os existentes e confira conflitos e exclusões.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Transferir dados entre instâncias"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/transfer-between-instances-workflow.png",
      "alt": "Configurações de transferência com botão para importar um arquivo.",
      "caption": "Escolha o JSON íntegro exportado da conta de origem; confira o resultado antes de fechar.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/transfer-between-instances-export-workflow.png",
      "alt": "Controle de exportação da conta.",
      "caption": "Controle de exportação da conta. O arquivo exclui chaves e tokens; a captura mostra o botão antes do download.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-result-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/transfer-between-instances-result.png",
      "alt": "Resultado da importação com zero IDs remapeados e zero participações não restauradas.",
      "caption": "Esta importação real de dados pessoais não apresenta conflitos de IDs nem participações não restauradas. Confira as contagens e selecione Recarregar a conta ou feche a janela para recarregá-la.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow",
    "transfer-between-instances-result-workflow"
  ]
}
---

## Exportar e importar {#transfer-between-instances}

Entre na instância de origem e abra a seção Dados nas configurações da conta. Baixe a exportação JSON e guarde-a de forma privada: ela contém dados da conta e dos projetos. Crie sua conta na instância de destino ou entre na conta existente, confira o endereço e escolha ali o controle de importação. Selecione o arquivo exportado sem modificá-lo e aguarde o resultado antes de fechar a página.

A importação acrescenta dados sem substituir os que já existem no destino. Os identificadores são mantidos quando podem ser reutilizados com segurança; os conflitos recebem novos identificadores. O resultado informa os identificadores remapeados e as associações a projetos ignoradas. As referências de associação a projetos existentes só são restauradas quando o projeto de destino já existe e a referência é autorizada. Após o recarregamento da página, confira projetos, tarefas, páginas e dados pessoais.

![Configurações de transferência com botão para importar um arquivo.](/documentation/pt-BR/transfer-between-instances-workflow.png)

## Reconectar serviços {#exclusions}

Senhas, chaves de API, tokens OAuth, credenciais de repositórios e assinaturas não são transferidos. Configure e autorize novamente os serviços necessários no destino; um projeto exportado não comprova que o acesso ao provedor funciona. Examine os recursos de arquivo e sua disponibilidade, sem tratar o JSON como um backup operacional do banco de dados e dos bytes do Storage.

Mantenha a instância de origem até verificar o trabalho transferido. Se a importação falhar, guarde a mensagem de erro e confira o estado do destino antes de repetir a operação. Exclua ou proteja os arquivos de transferência quando não forem mais necessários; nunca os anexe a um relato público de erro.

![Controle de exportação da conta.](/documentation/pt-BR/transfer-between-instances-export-workflow.png)

O resultado permanece aberto até você selecionar Recarregar a conta ou fechar a janela. Ambas as ações recarregam a conta depois que você conferir as contagens.

![Resultado da importação com zero IDs remapeados e zero participações não restauradas.](/documentation/pt-BR/transfer-between-instances-result.png)
