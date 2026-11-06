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
  "revision": 14,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-06",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
    "revision": 14,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-924: routine runs never ask questions, and when they notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-06"
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
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Solo el propietario del proyecto puede crear, modificar o activar una rutina. Abre Rutinas, elige un proyecto propio y redacta las instrucciones para Numo. Menciona las incidencias, páginas u objetivos relevantes. Cada ejecución tiene una conversación privada de Numo, historial y herramientas minddy. Las rutinas organizan y siguen el trabajo, por ejemplo una clasificación semanal, una revisión de incidencias estancadas o un resumen semanal; no modifican el código del repositorio.

Elige **Programado** o **Evento**. Las llegadas a una base son una opción de la lista de eventos.

- **Programado:** frecuencia diaria, semanal o mensual, hora y tu zona horaria. Comprueba la vista previa del primer inicio.
- **Evento:** creación de incidencia, entrada en un estado objetivo, asignación, comentario en una incidencia seguida, recepción de feedback o una nueva entrada en una base. Elige el estado, persona o incidencia que se solicite. El evento de estado incluye incidencias creadas directamente en ese estado. Una asignación requiere un cambio real de persona asignada.

Para una llegada a una base, elige **Nueva entrada en una base de datos** en la lista de eventos y después una base de páginas del proyecto. La creación, duplicación, importación de una base o traslado hacia esa base cuentan como llegada. Restaurar una entrada no genera una nueva llegada.

Las **Condiciones** son opcionales: sin filtros, cada evento coincidente puede iniciar la rutina. Define el retraso por separado en **Momento de inicio**. Los pequeños botones de información explican la espera y el retraso. Los selectores usan los mismos indicadores de estado, prioridad, categoría y persona que minddy. Usa las flechas y Entrar; las listas largas incluyen una búsqueda.

Si hace falta, configura una espera tras el evento de 0 a 120 minutos. Tu zona horaria sigue formando parte del contexto de Numo. Las rutinas de evento y base esperan futuras llegadas sin fecha planificada. El procesamiento automático necesita el scheduler de la instancia; el inicio manual sigue disponible.

## Crear condiciones que pueden esperar {#conditions}

Usa **Añadir condición** para crear un solo grupo de hasta 16 condiciones. Elige **Todas las condiciones** (Y) o **Cualquier condición** (O) para todo el grupo. Selecciona estado, persona asignada, categoría, prioridad o esfuerzo; para una base, su propiedad tipada. Elige un operador compatible y un valor. Las personas, categorías y bases deben pertenecer al proyecto. No se pueden añadir grupos anidados. Las reglas anidadas guardadas conservan su lógica; si no pueden mostrarse como un solo grupo equivalente, **Reemplazar condiciones** las borra para crear un grupo nuevo.

Ejemplo: entrada en Clasificación, con todas las condiciones exigiendo la categoría Backend y la prioridad Alta. Una incidencia que llega sin categoría sigue esperando. Añadir Backend después puede iniciar la ejecución. Una espera ya consumida no puede iniciar otra ejecución. Salir del estado objetivo la cancela; volver a entrar crea una nueva. Una reasignación también sustituye la espera anterior.

Una entrada sin su propiedad obligatoria espera hasta que una edición cumpla el filtro. Eliminar una propiedad referenciada o cambiar su tipo muestra un error de filtro: corrige las condiciones antes de continuar. La espera configurada se respeta aunque el filtro se cumpla más tarde. La recepción de feedback incluye contenido privado y pendiente; Numo no lo publica ni evita su moderación.

![Modos Programado y Evento, un grupo de condiciones, iconos de la aplicación y botones de información discretos.](/documentation/es/scheduled-routines-workflow.png)

## Gestionar y comprobar ejecuciones {#runs}

Abre la rutina para ver sus esperas, cambiar instrucciones o desencadenante, pausarla o leer sus ejecuciones. En su página, el propietario escribe la instrucción directamente (se guarda mientras escribes y se mantiene igual en tus pestañas y dispositivos abiertos, incluso cuando Numo la reescribe), despliega **Activador** para cambiarlo, elige el **Límite de gasto** y cambia entre **Activa** y **En pausa** desde la insignia de estado de arriba. Pausar, eliminar o modificar su configuración invalida las esperas. Reactivar escucha eventos futuros sin repetir llegadas antiguas. El inicio manual funciona con todos los desencadenantes sin esperar su evento y también consume presupuesto.

Haz clic derecho en una rutina de la lista para abrir su última ejecución sin seleccionarla primero; **Abrir la última ejecución** no está disponible hasta que la rutina se haya ejecutado. El propietario del proyecto también puede elegir **Ejecutar ahora**, **Pausar** o **Reanudar**, **Editar** o **Mover a la papelera** en el mismo menú. **Reanudar** no está disponible cuando la instancia no puede programar rutinas. Los demás miembros solo ven entradas que no modifican la rutina. Para crear una rutina, haz clic derecho en **Rutinas** en la barra lateral y elige **Nueva rutina**.

Mantén pulsada Mayús y haz clic en rutinas de la lista para seleccionar varias; un clic en el espacio vacío de la lista borra la selección. **Acciones** en la barra flotante, o Command+K en macOS o Ctrl+K en otros sistemas, ejecuta ahora las rutinas seleccionadas de las que eres propietario, las pausa o las reanuda, o las mueve a la papelera tras una confirmación; las rutinas de proyectos que no son tuyos no cambian, y cada ejecución consume uso. **Pregúntale a Numo** abre Numo con todas las rutinas seleccionadas en su contexto.

Cada ejecución usa el presupuesto de IA del propietario con un límite predeterminado del 15 % del presupuesto mensual, incluidas todas las llamadas a Numo de esa ejecución. Abre su conversación para ver el origen y el resultado. Una ejecución funciona sin ti y nunca hace preguntas: cuando una decisión no le corresponde a Numo, como mover a la papelera o fusionar, te la deja en un mensaje. Escribe instrucciones que no esperen tu respuesta. Revisa los resultados guardados antes de cambiar el límite o volver a intentarlo. Cuando se [transfiere la propiedad](/docs/projects#transfer-ownership), las rutinas del propietario anterior en el proyecto se pausan y no pueden iniciar nuevo trabajo; el nuevo propietario crea las rutinas que deban continuar.

Una ejecución que termina con normalidad no te avisa. Cuando encuentra algo que requiere tu acción, Numo te deja un [mensaje](/docs/notifications-and-inbox#notifications-and-inbox) que abre el elemento en cuestión. Recibes una notificación automática cuando una ejecución falla, se detiene o agota su presupuesto, y cuando una ejecución programada o activada por un evento no puede iniciarse. El interruptor **Rutinas** de tu [configuración de notificaciones](/docs/notifications-and-inbox#notification-preferences) controla estas notificaciones, y **Mensajes de Numo** controla los mensajes.

Las automatizaciones de proyecto de versiones anteriores ya no se ejecutan y no se convierten en rutinas. Lee la [guía de transición](/docs/automation-settings) para recrear un flujo como rutina.

El límite se aplica cuando hay presupuesto mensual incluido; el modo sin límite con clave personal no recibe un presupuesto mensual artificial.
