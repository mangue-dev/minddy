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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of transfer-between-instances-workflow, transfer-between-instances-export-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/transfer-between-instances-export-workflow.png",
      "alt": "Controle de exportação da conta.",
      "caption": "Controle de exportação da conta. O arquivo exclui chaves e tokens; a captura mostra o botão antes do download.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Exportar e importar {#transfer-between-instances}

Entre na instância de origem e abra a aba **Privacidade e dados** nas configurações da conta. Escolha **Baixar meus dados** e guarde o arquivo JSON de forma privada: ele contém dados da conta e dos projetos, incluindo os bytes dos arquivos. Crie sua conta na instância de destino ou entre na conta existente, confira o endereço, abra a mesma aba e escolha **Importar um arquivo de transferência**. Selecione o arquivo exportado sem modificá-lo e aguarde o resultado antes de fechar a página.

A importação acrescenta dados sem substituir os que já existem no destino. Os identificadores são mantidos quando podem ser reutilizados com segurança; os conflitos recebem novos identificadores. O resultado informa os identificadores remapeados e as associações a projetos ignoradas. As referências de associação a projetos existentes só são restauradas quando o projeto de destino já existe e a referência é autorizada. Após o recarregamento da página, confira projetos, tickets, páginas e dados pessoais.

![Configurações de transferência com botão para importar um arquivo.](/documentation/pt-BR/transfer-between-instances-workflow.png)

## Reconectar serviços {#exclusions}

Senhas, chaves de API, tokens OAuth, credenciais de repositórios e assinaturas não são transferidos. Configure e autorize novamente os serviços necessários no destino; um projeto exportado não comprova que o acesso ao provedor funciona. Examine os recursos de arquivo e sua disponibilidade, sem tratar o JSON como um backup operacional do banco de dados e dos bytes do Storage. Uma exportação criada pela v0.11.0 ou anterior pode conter visualizações salvas da paleta de comandos e conversas do agente de código; esta release não tem mais esses recursos e as ignora na importação.

Mantenha a instância de origem até verificar o trabalho transferido. Se a importação falhar, guarde a mensagem de erro e confira o estado do destino antes de repetir a operação. Exclua ou proteja os arquivos de transferência quando não forem mais necessários; nunca os anexe a um relato público de erro.

![Controle de exportação da conta.](/documentation/pt-BR/transfer-between-instances-export-workflow.png)

O resultado permanece aberto até você selecionar Recarregar a conta ou fechar a janela. Ambas as ações recarregam a conta depois que você conferir as contagens.
