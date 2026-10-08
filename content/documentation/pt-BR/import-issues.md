---
{
  "id": "import-issues",
  "locale": "pt-BR",
  "title": "Importar um backlog CSV após conferir o mapeamento",
  "summary": "Conferir colunas, pessoas, status e referências pai antes de criar tarefas.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/import-issues-preview-workflow.png",
      "alt": "Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas.",
      "caption": "Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas. A importação não foi enviada; o planejamento opcional com IA foi bloqueado para a captura.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "import-issues-workflow"
  ]
}
---

## Preparar e conferir {#import-issues}

O proprietário do projeto abre Importação nas configurações do projeto e seleciona uma exportação CSV. Os formatos do Linear e do Jira são reconhecidos; os demais CSVs usam o mapeamento genérico. O limite por importação é de 5 MiB e 5.000 tarefas. Divida uma exportação maior de forma planejada e, quando possível, mantenha as referências às tarefas pai no mesmo lote.

Mapeie a coluna de título antes de importar. Confira descrição, status, prioridade, esforço, prazo, categorias e responsáveis. Associe as pessoas a membros reais do projeto e examine as novas categorias. As referências aos pais correspondem a chaves externas no lote e permitem um único nível. Os CSVs não importam os bytes dos arquivos anexos.

Uma proposta de IA só é solicitada para lacunas no mapeamento. Ela pode ser editada; se o provedor falhar ou estiver indisponível, o mapeamento manual continua disponível. Uma correção manual impede que uma proposta tardia sobrescreva suas escolhas.


## Importar e verificar {#result}

Depois de cada mudança de mapeamento, leia as contagens de tarefas, a distribuição de status e os avisos. Corrija as linhas ignoradas ou inválidas antes de confirmar. A importação cria novas tarefas; não suponha que enviar o arquivo novamente seja uma atualização que elimina duplicatas. Após o sucesso, confira tarefas representativas, responsáveis, datas e vínculos com pais. Se a resposta se perder, examine o projeto antes de reenviar o arquivo inteiro, para evitar trabalho duplicado.

![Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas.](/documentation/pt-BR/import-issues-preview-workflow.png)
