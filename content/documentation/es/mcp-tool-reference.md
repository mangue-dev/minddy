---
{
  "id": "mcp-tool-reference",
  "locale": "es",
  "title": "Usar Minddy MCP y descubrir herramientas actuales",
  "summary": "Minddy expone /api/mcp mediante Streamable HTTP, herramientas sin estado y OAuth 2.1.",
  "topic": "Conceptos técnicos",
  "type": "reference",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T06"
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "numo-execution-model",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---
## Usar Minddy MCP y descubrir herramientas actuales {#mcp-tool-reference}

Minddy expone /api/mcp mediante Streamable HTTP, herramientas sin estado y OAuth 2.1. Conecte su propia cuenta mediante el consentimiento en el navegador; las antiguas claves estáticas mdyk_ no se aceptan. Empiece con minddy_list_projects para obtener los UUID de proyectos accesibles y lea los esquemas del servidor conectado. /llms-full.txt se genera a partir de esos registros y proporciona los parámetros actuales exactos. No deduzca herramientas de una lista antigua. Las herramientas de proyecto vuelven a comprobar el acceso y devuelven códigos de error estables.



## Leer antes de cambiar planes {#issue-plans}

minddy_get_issue acepta un UUID de incidencia, un identificador como DEMO-42 o un número de incidencia con project_id. Sus plan_tasks proporcionan task_index desde cero. minddy_update_plan_task recibe un lote tasks con estados pending, in_progress, completed o cancelled; un índice inválido rechaza todo el lote. Añada contenido con minddy_append_to_plan y cambie un pasaje con minddy_edit_issue_text usando old_string/new_string exactos y únicos. Relea si el texto ha cambiado: reemplazar todo el plan puede sobrescribir el progreso de otra persona. Las preguntas bajo ## Questions no cuentan como tareas del plan.



## Respetar revisiones y propiedad {#pages-and-routines}

minddy_list_pages muestra la jerarquía, minddy_search_pages encuentra extractos y minddy_get_page lee el Markdown completo, los comentarios y los valores de base de datos. Prefiera cambios parciales y utilice la versión actual para un reemplazo completo. Conserve exactamente las URL de archivos e imágenes. minddy_create_page con database=true crea una base de datos de páginas. minddy_update_page_database exige la revisión del esquema, el valor anterior de las celdas y los tokens de vista previa y aplicación para las conversiones. Los propietarios pueden crear, pausar, reprogramar o eliminar sus rutinas. Lea las existentes antes de crear para evitar duplicados. minddy_add_resource limita los archivos a 10 MB; las herramientas de páginas no inventan URL.



## Comprobar con un ejemplo {#example}

El ejemplo cambia la primera tarea de un plan ya leído. Sustituya el UUID del proyecto y la incidencia por los valores obtenidos mediante descubrimiento; task_index debe proceder de la última lectura. Compruebe los plan_tasks y plan_progress devueltos. Ante un error de acceso, revise la cuenta y la autorización del proyecto; ante un conflicto de versión, vuelva a leer y aplique solo el cambio previsto. No repita una modificación externa de resultado incierto antes de comprobarlo.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
