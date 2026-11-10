---
{
  "id": "recommended-models",
  "locale": "es",
  "title": "Configuración de modelos recomendada",
  "summary": "Empezar una instancia con la configuración de modelos de IA de minddy Cloud.",
  "topic": "Administrar una instancia",
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
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Importar la configuración de modelos recomendada"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Partir de la configuración de minddy Cloud {#recommended-models}

minddy Cloud publica la configuración de modelos de IA que usa, siempre actualizada: [descarga la configuración recomendada](https://www.minddy.app/api/recommended-models?download=1). El archivo usa el formato versionado de **Exportar** en la pestaña **Modelos** de la administración (`minddy.instance-models`): el modelo de cada tipo, el nivel de razonamiento y los modelos predeterminados de las claves personales. No contiene claves, cuentas ni uso.

## Importarla en tu instancia {#import}

Descarga el archivo, abre **Modelos** en la administración de tu instancia, elige **Importar** y selecciónalo. Cada cambio se lista antes de escribir nada; **Aplicar** los escribe todos, o ninguno cuando se rechaza un valor, por ejemplo un modelo de decisión que tu proveedor no ofrece. Los ajustes que el archivo no incluye vuelven a su valor predeterminado. Un archivo de una versión más reciente de minddy se rechaza hasta que se actualiza tu instancia. También puedes adjuntar el archivo en una conversación de Numo iniciada desde una sesión de administrador y pedir a Numo que lo importe: Numo muestra la misma lista de cambios y te pide confirmar. Consulta [la administración de la instancia](/docs/instance-administration#models-file).

## Publicar tu propia configuración {#publish}

Una instancia autoalojada no publica nada por defecto. Define `MINDDY_PUBLISH_MODEL_CONFIG=1` para servir su configuración en `/api/recommended-models`, por ejemplo para configurar varias instancias igual. El archivo es público: solo nombra modelos y cómo se sirven.
