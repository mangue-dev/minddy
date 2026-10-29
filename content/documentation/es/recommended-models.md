---
{
  "id": "recommended-models",
  "locale": "es",
  "title": "Configuración de modelos recomendada",
  "summary": "Empezar una instancia con la configuración de modelos de IA de Minddy Cloud.",
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
    "language": "agent:claude-code (es MIN-829 article with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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

## Partir de la configuración de Minddy Cloud {#recommended-models}

Minddy Cloud publica la configuración de modelos de IA que usa, siempre actualizada: [descarga la configuración recomendada](https://www.minddy.app/api/recommended-models?download=1). El archivo usa el formato versionado de **Exportar** en la pestaña **Modelos** de la administración (`minddy.instance-models`): modelos predeterminados de las categorías, modelos de las tareas, atajos de enrutamiento, nivel de razonamiento, modelos recomendados y valores predeterminados de proveedor para las claves personales. No contiene claves, cuentas ni uso.

## Importarla en tu instancia {#import}

Descarga el archivo, abre **Modelos** en la administración de tu instancia, elige **Importar** y selecciónalo. Cada cambio se lista antes de escribir nada; **Aplicar** los escribe todos, o ninguno cuando se rechaza un valor, por ejemplo un modelo de decisión que tu proveedor no ofrece. Los ajustes que el archivo no incluye vuelven a su valor predeterminado. Un archivo de una versión más reciente de minddy se rechaza hasta que se actualiza tu instancia. También puedes adjuntar el archivo en una conversación de Numo iniciada desde una sesión de administrador y pedir a Numo que lo importe: Numo muestra la misma lista de cambios y te pide confirmar. Consulta [la administración de la instancia](/docs/instance-administration#models-file).

## Publicar tu propia configuración {#publish}

Una instancia autoalojada no publica nada por defecto. Define `MINDDY_PUBLISH_MODEL_CONFIG=1` para servir su configuración en `/api/recommended-models`, por ejemplo para configurar varias instancias igual. El archivo es público: solo nombra modelos y cómo se sirven.
