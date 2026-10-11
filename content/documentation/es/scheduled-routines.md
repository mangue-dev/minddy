---
{
  "id": "scheduled-routines",
  "locale": "es",
  "title": "Rutinas",
  "summary": "Inicia Numo mediante un horario, un evento de incidencia, feedback recibido o una entrada de base de datos.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (es translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Programar y revisar una rutina de Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/scheduled-routines-workflow.png",
      "alt": "Rutina por evento con condiciones Y/O anidadas.",
      "caption": "Demostración local del editor real de desencadenantes. No se guardó ni ejecutó ninguna rutina.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        788,
        1339
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Crear una rutina {#scheduled-routines}

Solo el propietario del proyecto puede crear, modificar o activar una rutina. Abre Rutinas, elige un proyecto propio y redacta las instrucciones para Numo. Menciona las incidencias, páginas u objetivos relevantes. Cada ejecución tiene una conversación privada de Numo, historial, herramientas Minddy y delegación de código opcional. Los workers usan los valores del propietario; solo hace falta un repositorio para trabajar en su código.

Elige un desencadenante:

- **Horario:** frecuencia diaria, semanal o mensual, hora y tu zona horaria. Comprueba la vista previa del primer inicio.
- **Evento:** creación de incidencia, entrada en un estado objetivo, asignación, comentario en una incidencia seguida o recepción de feedback. Elige el estado, persona o incidencia que se solicite. El evento de estado incluye incidencias creadas directamente en ese estado. Una asignación requiere un cambio real de persona asignada.
- **Entrada de base:** elige una base de páginas del proyecto. La creación, duplicación, importación de una base o traslado hacia esa base cuentan como llegada. Restaurar una entrada no genera una nueva llegada.

Si hace falta, configura una espera tras el evento de 0 a 120 minutos. Tu zona horaria sigue formando parte del contexto de Numo. Las rutinas de evento y base esperan futuras llegadas sin fecha planificada. El procesamiento automático necesita el scheduler de la instancia; el inicio manual sigue disponible.

## Crear condiciones que pueden esperar {#conditions}

Usa **Añadir condición** y **Añadir grupo** para combinar **Todas las condiciones** (Y) y **Cualquier condición** (O). Selecciona estado, persona asignada, categoría, prioridad o esfuerzo; en una base, su propiedad tipada. Elige un operador compatible y un valor. Personas, categorías y bases deben pertenecer al proyecto. Las condiciones se limitan a seis niveles anidados y 64 nodos, sin expresiones ejecutables.

Ejemplo: entrada en Triaje Y categoría Backend Y (hay una persona asignada O la prioridad es Alta). Una incidencia sin categoría queda esperando. Añadir Backend después puede iniciar la ejecución. Una espera ya consumida no puede iniciar otra ejecución. Salir del estado objetivo la cancela; volver a entrar crea una nueva. Una reasignación también sustituye la espera anterior.

Una entrada sin su propiedad obligatoria espera hasta que una edición cumpla el filtro. Eliminar una propiedad referenciada o cambiar su tipo muestra un error de filtro: corrige las condiciones antes de continuar. La espera configurada se respeta aunque el filtro se cumpla más tarde. La recepción de feedback incluye contenido privado y pendiente; Numo no lo publica ni evita su moderación.

![Rutina por evento con condiciones Y/O anidadas.](/documentation/es/scheduled-routines-workflow.png)

## Gestionar y comprobar ejecuciones {#runs}

Abre la rutina para ver sus esperas, cambiar instrucciones o desencadenante, pausarla o leer sus ejecuciones. Pausar, eliminar o modificar su configuración invalida las esperas. Reactivar escucha eventos futuros sin repetir llegadas antiguas. El inicio manual funciona con todos los desencadenantes sin esperar su evento y también consume presupuesto.

Cada ejecución usa el presupuesto de IA del propietario con un límite predeterminado del 15 % del presupuesto mensual, incluyendo Numo y workers delegados. Abre su conversación para ver el origen, resultado, comprobaciones, preguntas y trabajo delegado. Si necesitas responder, hazlo en esa conversación; se conserva el presupuesto restante. Revisa los resultados guardados antes de cambiar el límite o volver a intentarlo. Tras un cambio de propietario, la rutina anterior no puede iniciar nuevo trabajo; crea una como propietario actual.

Las automatizaciones archivadas aparecen como propuestas pausadas cuando su propietario abre Rutinas. Lee la [guía de transición](/docs/automation-settings) antes de activarlas.

El límite se aplica cuando hay presupuesto mensual incluido; el modo sin límite con clave personal no recibe un presupuesto mensual artificial.
