---
{
  "id": "page-history",
  "locale": "pt-BR",
  "title": "Inspecionar e restaurar uma versão de página",
  "summary": "Veja o histórico salvo antes de substituir o documento atual.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-history-preview.png",
      "alt": "Aba Versões com um estado anterior expandido, autor, Restaurar e aviso de retenção por 30 dias.",
      "caption": "Confira a prévia de um estado salvo e compare com a página atual antes de restaurá-lo.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-history-steps"
  ]
}
---

## Inspecionar versões salvas {#page-history}

Abra o indicador de salvamento ou histórico da página para ver versões, ou o controle de comentários e atividade para inspecionar ações. Essas abas respondem a perguntas diferentes: uma versão salva é um estado do documento, enquanto a atividade pode incluir renomeação, exclusão ou restauração sem a mesma cópia de conteúdo.

Selecione uma versão para visualizar antes de restaurar. O histórico identifica autores e atividade de agentes, então compare o conteúdo com a mudança que quer desfazer. A interface anuncia uma janela de histórico de 30 dias; não trate o histórico como backup externo permanente.

## Restaurar e verificar {#restore-page-version}

Como membro autorizado do projeto, restaure a versão selecionada somente depois de revisar o conteúdo atual que será substituído. O estado anterior à restauração também entra no histórico, permitindo recuperá-lo depois enquanto for mantido.

Reabra ou atualize o editor depois da restauração e confira o corpo real da página. Um editor já aberto mantém uma versão desatualizada e não deve sobrescrever cegamente o estado restaurado. Versões de página não são backups completos da instância: bytes de anexos, arquivos excluídos e objetos relacionados podem ter ciclos de vida separados. Use os guias de recuperação de arquivos e do operador quando a informação ausente estiver fora do corpo salvo.


![Aba Versões com um estado anterior expandido, autor, Restaurar e aviso de retenção por 30 dias.](/documentation/pt-BR/page-history-preview.png)
