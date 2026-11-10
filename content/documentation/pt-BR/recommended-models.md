---
{
  "id": "recommended-models",
  "locale": "pt-BR",
  "title": "Configuração de modelos recomendada",
  "summary": "Começar uma instância com a configuração de modelos de IA do minddy Cloud.",
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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
    "revision": 3,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 model roles: file contents sentence, source audit against lib/ai-model-config-file.ts; no browser walkthrough)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
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

## Começar pela configuração do minddy Cloud {#recommended-models}

O minddy Cloud publica a configuração de modelos de IA que usa, sempre atualizada: [baixe a configuração recomendada](https://www.minddy.app/api/recommended-models?download=1). O arquivo usa o formato versionado de **Exportar** na aba **Modelos** da administração (`minddy.instance-models`): o modelo de cada tipo, o nível de raciocínio e os modelos padrão das chaves pessoais. Ele não contém chaves, contas nem uso.

## Importá-la na sua instância {#import}

Baixe o arquivo, abra **Modelos** na administração da sua instância, escolha **Importar** e selecione-o. Cada mudança é listada antes de qualquer gravação; **Aplicar** grava todas, ou nenhuma quando um valor é recusado, por exemplo um modelo de decisão que seu provedor não oferece. As configurações que o arquivo não inclui voltam ao padrão. Um arquivo de uma versão mais recente do minddy é recusado até sua instância ser atualizada. Você também pode anexar o arquivo em uma conversa do Numo iniciada a partir de uma sessão de administrador e pedir que o Numo o importe: o Numo mostra a mesma lista de mudanças e pede sua confirmação. Veja [a administração da instância](/docs/instance-administration#models-file).

## Publicar sua própria configuração {#publish}

Uma instância auto-hospedada não publica nada por padrão. Defina `MINDDY_PUBLISH_MODEL_CONFIG=1` para servir a configuração em `/api/recommended-models`, por exemplo para configurar várias instâncias da mesma forma. O arquivo é público: ele só nomeia modelos e como são servidos.
