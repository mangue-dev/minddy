---
{
  "id": "import-issues",
  "locale": "es",
  "title": "Importar un backlog CSV tras revisar correspondencias",
  "summary": "Comprobar columnas, personas, estados y referencias padre antes de crear incidencias.",
  "topic": "Cuenta y aplicaciones",
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
      "src": "/documentation/es/import-issues-preview-workflow.png",
      "alt": "Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas.",
      "caption": "Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas. No se envió la importación; la planificación opcional con IA se bloqueó para la captura.",
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

## Preparar y revisar {#import-issues}

El propietario abre Importación en la configuración del proyecto y selecciona una exportación CSV. Los formatos de Linear y Jira se detectan; los demás CSV usan el mapeo genérico. El límite por importación es de 5 MiB y 5.000 incidencias. Divida una exportación mayor de forma planificada y, cuando sea posible, mantenga las referencias a incidencias padre en el mismo lote.

Asocie la columna del título antes de importar. Revise descripción, estado, prioridad, esfuerzo, fecha límite, categorías y responsables. Asocie las personas a miembros reales del proyecto y examine las categorías nuevas. Las referencias a padres corresponden a claves externas del lote y admiten un solo nivel. Los CSV no importan los bytes de los archivos adjuntos.

Solo se solicita una propuesta de IA para los huecos del mapeo. Puede editarla; un proveedor fallido o no disponible deja utilizable el mapeo manual. Una corrección manual impide que una propuesta tardía sobrescriba sus decisiones.


## Importar y comprobar {#result}

Tras cada cambio de mapeo, lea las cantidades de incidencias, la distribución de estados y los avisos. Corrija las filas omitidas o inválidas antes de confirmar. La importación crea incidencias nuevas; no suponga que reenviar el archivo sea una actualización que elimina duplicados. Después del éxito, compruebe incidencias representativas, responsables, fechas y vínculos con padres. Si se pierde la respuesta, revise el proyecto antes de reenviar el archivo completo para evitar trabajo duplicado.

![Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas.](/documentation/es/import-issues-preview-workflow.png)
