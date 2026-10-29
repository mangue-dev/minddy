---
{
  "id": "recommended-models",
  "locale": "pt-BR",
  "title": "Configuração de modelos recomendada",
  "summary": "Começar uma instância com a configuração de modelos de IA do Minddy Cloud.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "MIN-829 instance administration",
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
      "app/api/recommended-models/route.ts",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "components/admin/admin-models-dashboard.tsx",
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:claude-code (MIN-829 article checked against app/api/recommended-models/route.ts, lib/ai-model-config-file.ts and lib/server/admin-model-config.ts; no figure)",
    "language": "agent:claude-code (pt-BR MIN-829 article with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Importar a configuração de modelos recomendada"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Começar pela configuração do Minddy Cloud {#recommended-models}

O Minddy Cloud publica a configuração de modelos de IA que usa, sempre atualizada: [baixe a configuração recomendada](https://www.minddy.app/api/recommended-models?download=1). O arquivo usa o formato versionado de **Exportar** na aba **Modelos** da administração (`minddy.instance-models`): modelos padrão das categorias, modelos das tarefas, atalhos de roteamento, nível de raciocínio, modelos recomendados e padrões de provedor para chaves pessoais. Ele não contém chaves, contas nem uso.

## Importá-la na sua instância {#import}

Baixe o arquivo, abra **Modelos** na administração da sua instância, escolha **Importar** e selecione-o. Cada mudança é listada antes de qualquer gravação; **Aplicar** grava todas, ou nenhuma quando um valor é recusado, por exemplo um modelo de decisão que seu provedor não oferece. As configurações que o arquivo não inclui voltam ao padrão. Um arquivo de uma versão mais recente do minddy é recusado até sua instância ser atualizada. Você também pode anexar o arquivo em uma conversa do Numo iniciada a partir de uma sessão de administrador e pedir que o Numo o importe: o Numo mostra a mesma lista de mudanças e pede sua confirmação. Veja [a administração da instância](/docs/instance-administration#models-file).

## Publicar sua própria configuração {#publish}

Uma instância auto-hospedada não publica nada por padrão. Defina `MINDDY_PUBLISH_MODEL_CONFIG=1` para servir a configuração em `/api/recommended-models`, por exemplo para configurar várias instâncias da mesma forma. O arquivo é público: ele só nomeia modelos e como são servidos.
