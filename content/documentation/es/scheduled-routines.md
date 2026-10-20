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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of code delegation in routines; MIN-685 sidebar context menus; MIN-693 project roles",
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
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root (MIN-677 source review and single-group editor keyboard/mobile follow-up; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; es translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 8; es translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (es translation, label and retained-meaning self-review); agent:/root/min721_es (es translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (es translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_es with agent:/root (es MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "alt": "Modos Programado y Evento, un grupo de condiciones, iconos de la aplicación y botones de información discretos.",
      "caption": "Demostración local del editor real de desencadenantes. No se guardó ni ejecutó ninguna rutina.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        788,
        910
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

Solo el propietario del proyecto puede crear, modificar o activar una rutina. Abre Rutinas, elige un proyecto propio y redacta las instrucciones para Numo. Menciona las incidencias, páginas u objetivos relevantes. Cada ejecución tiene una conversación privada de Numo, historial y herramientas Minddy. Las rutinas organizan y siguen el trabajo, por ejemplo una clasificación semanal, una revisión de incidencias estancadas o un resumen semanal; no modifican el código del repositorio.

Elige **Programado** o **Evento**. Las llegadas a una base son una opción de la lista de eventos.

- **Programado:** frecuencia diaria, semanal o mensual, hora y tu zona horaria. Comprueba la vista previa del primer inicio.
- **Evento:** creación de incidencia, entrada en un estado objetivo, asignación, comentario en una incidencia seguida, recepción de feedback o una nueva entrada en una base. Elige el estado, persona o incidencia que se solicite. El evento de estado incluye incidencias creadas directamente en ese estado. Una asignación requiere un cambio real de persona asignada.

Para una llegada a una base, elige **Nueva entrada en una base de datos** en la lista de eventos y después una base de páginas del proyecto. La creación, duplicación, importación de una base o traslado hacia esa base cuentan como llegada. Restaurar una entrada no genera una nueva llegada.

Las **Condiciones** son opcionales: sin filtros, cada evento coincidente puede iniciar la rutina. Define el retraso por separado en **Momento de inicio**. Los pequeños botones de información explican la espera y el retraso. Los selectores usan los mismos indicadores de estado, prioridad, categoría y persona que Minddy. Usa las flechas y Entrar; las listas largas incluyen una búsqueda.

Si hace falta, configura una espera tras el evento de 0 a 120 minutos. Tu zona horaria sigue formando parte del contexto de Numo. Las rutinas de evento y base esperan futuras llegadas sin fecha planificada. El procesamiento automático necesita el scheduler de la instancia; el inicio manual sigue disponible.

## Crear condiciones que pueden esperar {#conditions}

Usa **Añadir condición** para crear un solo grupo de hasta 16 condiciones. Elige **Todas las condiciones** (Y) o **Cualquier condición** (O) para todo el grupo. Selecciona estado, persona asignada, categoría, prioridad o esfuerzo; para una base, su propiedad tipada. Elige un operador compatible y un valor. Las personas, categorías y bases deben pertenecer al proyecto. No se pueden añadir grupos anidados. Las reglas anidadas guardadas conservan su lógica; si no pueden mostrarse como un solo grupo equivalente, **Reemplazar condiciones** las borra para crear un grupo nuevo.

Ejemplo: entrada en Triage, con todas las condiciones exigiendo la categoría Backend y la prioridad Alta. Una incidencia que llega sin categoría sigue esperando. Añadir Backend después puede iniciar la ejecución. Una espera ya consumida no puede iniciar otra ejecución. Salir del estado objetivo la cancela; volver a entrar crea una nueva. Una reasignación también sustituye la espera anterior.

Una entrada sin su propiedad obligatoria espera hasta que una edición cumpla el filtro. Eliminar una propiedad referenciada o cambiar su tipo muestra un error de filtro: corrige las condiciones antes de continuar. La espera configurada se respeta aunque el filtro se cumpla más tarde. La recepción de feedback incluye contenido privado y pendiente; Numo no lo publica ni evita su moderación.

![Modos Programado y Evento, un grupo de condiciones, iconos de la aplicación y botones de información discretos.](/documentation/es/scheduled-routines-workflow.png)

## Gestionar y comprobar ejecuciones {#runs}

Abre la rutina para ver sus esperas, cambiar instrucciones o desencadenante, pausarla o leer sus ejecuciones. Pausar, eliminar o modificar su configuración invalida las esperas. Reactivar escucha eventos futuros sin repetir llegadas antiguas. El inicio manual funciona con todos los desencadenantes sin esperar su evento y también consume presupuesto.

Haz clic derecho en una rutina de la lista para abrir su última ejecución sin seleccionarla primero; **Abrir la última ejecución** no está disponible hasta que la rutina se haya ejecutado. El propietario del proyecto también puede elegir **Ejecutar ahora**, **Pausar** o **Reactivar**, **Editar** o **Mover a la papelera** en el mismo menú. **Reactivar** no está disponible cuando la instancia no puede programar rutinas. Los demás miembros solo ven entradas que no modifican la rutina. Para crear una rutina, haz clic derecho en **Rutinas** en la barra lateral y elige **Nueva rutina**.

Cada ejecución usa el presupuesto de IA del propietario con un límite predeterminado del 15 % del presupuesto mensual, incluidas todas las llamadas a Numo de esa ejecución. Abre su conversación para ver el origen, el resultado y las preguntas. Si necesitas responder, hazlo en esa conversación; se conserva el presupuesto restante. Revisa los resultados guardados antes de cambiar el límite o volver a intentarlo. Cuando se [transfiere la propiedad](/docs/projects#transfer-ownership), las rutinas del propietario anterior en el proyecto se pausan y no pueden iniciar nuevo trabajo; el nuevo propietario crea las rutinas que deban continuar.

Las automatizaciones archivadas aparecen como propuestas pausadas cuando su propietario abre Rutinas. Lee la [guía de transición](/docs/automation-settings) antes de activarlas.

El límite se aplica cuando hay presupuesto mensual incluido; el modo sin límite con clave personal no recibe un presupuesto mensual artificial.
