---
{
  "id": "projects",
  "locale": "es",
  "title": "Proyectos y miembros",
  "summary": "Configura un proyecto, invita a colaboradores, elige sus roles y transfiere la propiedad.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles; MIN-737 project settings reorganization; MIN-689 project creation invitations",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "components/settings/project-settings-page.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "content/documentation/reviews/min-689-project-invitations.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root with agent:/root/review_de_es (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; es translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (hide-project confirmation from the sidebar menu: source and unit-test review of components/project-context-actions.tsx; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 project settings: source review of the General identity header edited in place (icon menu, name and key fields or phone sheet, no Save button), the Categories card, the three Members cards and the Hidden projects account tab; project-settings-steps and project-members-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-refresh screens project-general and project-members) and inspected; no other browser walkthrough); agent:/root (MIN-689 project creation invitations: source and unit-test review of the wizard's optional members step, the Member role and per-address sending after creation, and the persistent notification for refused invitations (components/create-project-wizard.tsx, lib/project-draft.ts, lib/members-api.ts and their tests); no browser walkthrough, no new captures; project-settings-steps and project-members-steps retained because neither shows the wizard)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/review_de_es with agent:/root (es pre-merge wording, correction and retained-meaning review); agent:/root (es translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root/min693_es with agent:/root (es MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (es hide-project confirmation sentence, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (es translation of the MIN-737 project-settings second-pass passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (es translation of the MIN-689 passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configurar un proyecto",
    "Invitar personas a un proyecto"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/es/project-general.png",
      "alt": "Cabecera del proyecto con el icono y su distintivo de edición, el nombre, la clave y las cifras Incidencias, Miembros, Objetivos, Categorías y Creado.",
      "caption": "Selecciona el icono, el nombre o la clave para cambiarlos ahí mismo; mover el proyecto a la papelera sigue siendo una acción aparte, más abajo.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        359
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/es/project-members.png",
      "alt": "Tarjeta «Invitar por correo electrónico» sobre la tarjeta Miembros, que lista tres miembros de demostración con la persona propietaria identificada.",
      "caption": "Invita con el correo de la cuenta e identifica al propietario antes de retirar el acceso de un miembro.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        430
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Un proyecto reúne incidencias, objetivos, páginas y las personas que trabajan en ellos. Su único propietario gestiona los ajustes administrativos, las invitaciones y los roles. Los miembros trabajan con el contenido y los lectores lo siguen; unos y otros pueden abandonar el proyecto. Consulta el apartado correspondiente para configurar el proyecto, decidir quién puede hacer qué, transferir la propiedad o resolver un problema de invitación.

## Configurar un proyecto {#project-settings}

Abre el proyecto y después sus ajustes. La propiedad del proyecto determina el acceso a los ajustes administrativos. Los miembros y los lectores pueden consultar la sección general, ocultar el proyecto para sí mismos y abandonarlo, pero no obtienen los controles de edición del propietario.

La pestaña **General** empieza con la identidad del proyecto: su icono, su nombre y su clave, y después cinco cifras: **Incidencias**, **Miembros**, **Objetivos**, **Categorías** y **Creado**. Como propietario, cambias el icono, el nombre y la clave donde se muestran; ya no hay botón Guardar. Selecciona el icono y elige **Nueva esfera** (solo aparece mientras ninguna imagen cubra la esfera), **Cargar una imagen**, **Importar desde un sitio web…**, que pide la dirección del sitio e importa su icono al elegir **Importación**, o, si hay una imagen, **Quitar la imagen**. Selecciona el nombre o la clave para editarlos: en un ordenador se convierten en un campo donde Intro o salir del campo guarda y Escape cancela; en un teléfono se abre una hoja con **Guardar**. El nombre no puede quedar vacío. La clave se normaliza a mayúsculas y debe tener de 2 a 5 letras (A–Z); si no, aparece un error y la clave no se guarda. Revisa los identificadores resultantes después de cambiarla. El icono solo distingue el proyecto en la navegación; no modifica la pertenencia al proyecto. Los miembros y los lectores ven el mismo encabezado sin estos controles.

Otras secciones gestionan categorías, colaboradores, incidencias recurrentes, Git, importación, integraciones, automatización y sugerencias. Sigue la guía correspondiente antes de activar un proveedor o trabajo automático. Las preferencias de la cuenta, como el idioma de la interfaz, son independientes de la configuración del proyecto.

En **Categorías**, el propietario y los miembros gestionan las categorías que clasifican las incidencias. Elige **Nueva categoría** en la línea de título de la tarjeta: aparece arriba de la lista una fila con un punto de color y un campo de nombre. Pulsa Intro o elige **Añadir** para crear la categoría; Escape cierra la fila sin crearla. Selecciona el punto de color de una categoría para elegir otro color, que se aplica al instante (en un teléfono los colores se abren en una hoja), o selecciona su nombre para renombrarla allí mismo. El botón de eliminar pide confirmación y después quita la categoría de todas las incidencias.


![Cabecera del proyecto con el icono y su distintivo de edición, el nombre, la clave y las cifras Incidencias, Miembros, Objetivos, Categorías y Creado.](/documentation/es/project-general.png)

### Ocultar un proyecto para ti {#hide-project}

Oculta un proyecto que ya no sigues a diario para quitarlo de tu barra lateral y de tu inicio sin abandonarlo. En la configuración general del proyecto, elige **Ocultar** en la **Zona de peligro**, o haz clic derecho en el proyecto en la barra lateral y elige **Ocultar proyecto** y confirma. El menú pide confirmación porque el proyecto sale de tu navegación; el botón de la configuración lo oculta al instante. Cualquier persona del proyecto puede ocultarlo, incluidos el propietario y los lectores.

Ocultarlo solo cambia tu propia navegación. La preferencia se guarda en tu cuenta, así que se mantiene al volver a iniciar sesión y en tus otros dispositivos. Conservas tu acceso y puedes seguir abriendo y editando el proyecto desde un enlace directo o desde la pestaña **Proyectos ocultos** de la **Configuración de la cuenta**. Los demás miembros siguen viendo el proyecto, y sus rutinas, integraciones y notificaciones siguen funcionando. Abrir un proyecto oculto no lo devuelve a tu barra lateral.

Para recuperarlo, elige **Mostrar** en **Proyectos ocultos** o en la configuración general del proyecto, o elige **Mostrar proyecto** en su menú de la barra lateral. Si el cambio no se puede guardar, aparece un error y el proyecto vuelve a su estado anterior; inténtalo de nuevo. A diferencia de abandonar el proyecto o moverlo a la papelera, ocultarlo nunca retira acceso ni contenido.

### Abandonar y eliminar {#project-removal}

Un miembro o un lector puede abandonar el proyecto para retirar su propio acceso. Pide al propietario que vuelva a invitarte si lo necesitas más adelante. Abandonarlo no elimina el proyecto para todos. El propietario no puede abandonarlo: antes debe [transferir la propiedad](#transfer-ownership) a un miembro.

Eliminar el proyecto es una acción del propietario en la zona de peligro. Lee las consecuencias y la confirmación antes de hacerlo, sobre todo si contiene incidencias, páginas, archivos o integraciones. Si falla un guardado normal, conserva los valores que querías introducir, lee el error y actualiza el proyecto antes de intentarlo de nuevo. Evita repetir una acción destructiva cuando no sepas cuál fue su primer resultado.

El propietario también puede hacer clic derecho en el proyecto en la barra lateral y elegir **Mover a la papelera**. Aparece la misma confirmación y solo se ve afectado el proyecto en el que hiciste clic.

## Invitar personas a un proyecto {#project-members}

El propietario del proyecto gestiona la pertenencia en **Configuración del proyecto** → **Miembros**. Pide a la persona colaboradora el correo que utiliza en esta instancia, y después, en la tarjeta **Invitar por correo electrónico**, introduce esa dirección, elige su rol y elige **Invitar**. La invitación aparece en la tarjeta **Invitaciones pendientes** hasta que se acepta; los miembros actuales figuran en la tarjeta **Miembros**, cuyo título indica cuántos son. Elige **Miembro** para alguien que trabaja en el proyecto, o **Lector** para alguien que solo lo sigue. Para un lector, activa **Puede comentar** si debe participar en las conversaciones. Mientras la invitación esté pendiente, el propietario puede cambiar su rol y la opción de comentar. Ese mismo correo en otra instancia no concede acceso aquí.

La persona invitada inicia sesión con esa cuenta y abre la bandeja de entrada. Acepta la invitación pendiente para unirte con el rol que indica, o recházala si no esperabas ese proyecto. El diálogo de incorporación inicial ayuda a compartir tu correo con el propietario; no permite unirse a proyectos sin invitación.

También puedes invitar a personas al crear el proyecto. En el paso **Invita a tu equipo** del asistente, introduce cada dirección y elige **Añadir**, o pulsa Intro; el límite de invitados de tu plan se aplica igual que aquí. La lista se guarda con el borrador del proyecto si retomas la creación más tarde. No se envía nada hasta que eliges **Acabar**: primero se crea el proyecto y después cada dirección recibe una invitación con el rol **Miembro**. Estas invitaciones aparecen en la tarjeta **Invitaciones pendientes**, donde puedes cambiar su rol, y se aceptan en la bandeja de entrada como cualquier otra. Si se rechaza alguna, por ejemplo por el límite de invitados del plan, las demás se envían igualmente y una notificación indica cada dirección no invitada y el motivo. Revisa la tarjeta **Invitaciones pendientes** antes de volver a invitar a esas direcciones. Una invitación pendiente queda registrada, lo que no garantiza que su correo se haya entregado.


![Tarjeta «Invitar por correo electrónico» sobre la tarjeta Miembros, que lista tres miembros de demostración con la persona propietaria identificada.](/documentation/es/project-members.png)

### Roles de propietario, miembro y lector {#member-permissions}

| Rol | Acceso al proyecto |
| --- | --- |
| Propietario | Uno por proyecto. Todo lo que puede hacer un miembro, más los ajustes del proyecto, las invitaciones y los roles, las integraciones, el vínculo con Git, las rutinas, la transferencia de la propiedad y la eliminación del proyecto. |
| Miembro | Todo el trabajo sobre el contenido: incidencias, planes, objetivos, sugerencias, páginas y bases de datos, comentarios, archivos, vistas compartidas y enlaces de publicación, acciones de Git y de pull requests, Numo y MCP. Puede abandonar el proyecto. |
| Lector | Lee el contenido, los miembros y las rutinas del proyecto. Puede ocultar el proyecto, aparecer en los avatares de presencia de una página, usar vistas personales y notificaciones, y abandonar el proyecto. No puede editar contenido, recibir asignaciones, liderar un objetivo ni publicar enlaces, y no ve las integraciones ni los tokens de compartición y de tablero. |
| Lector con **Puede comentar** | El acceso de lector más los comentarios en incidencias, objetivos, hilos internos de sugerencias y páginas: respuestas, menciones, archivos adjuntos a sus propios comentarios, y edición o eliminación de sus propios comentarios. Las respuestas públicas en el tablero de feedback y los comentarios o reacciones en pull requests siguen sin estar disponibles. |
| Visitante de un enlace público | Solo el contenido publicado expresamente mediante ese enlace; sin pertenencia al proyecto. |

Los lectores cuentan para el límite de invitados por proyecto del plan igual que los miembros, y también las invitaciones pendientes. No hay facturación por puesto.

Revisa la lista de miembros antes de retirar a alguien. La fila del propietario no ofrece una acción de retirada; solo una [transferencia](#transfer-ownership) cambia el propietario. El propietario puede cancelar una invitación pendiente antes de que se acepte; ese estado no revela si la dirección ya tiene una cuenta. La retirada termina el acceso como miembro; no recupera exportaciones, capturas o copias ya recibidas. Las credenciales personales de Git, IA y MCP siguen perteneciendo a la cuenta y no se transfieren por cambiar la propiedad del proyecto.

### Cambiar el rol de un miembro {#change-role}

Como propietario, abre **Configuración del proyecto** → **Miembros** y elige el nuevo rol de la persona: **Miembro** o **Lector**. Para un lector, elige si **Puede comentar** está activado. Esta opción está desactivada de forma predeterminada y se desactiva cada vez que alguien pasa a ser lector, así que revísala después de cambiar un miembro a Lector. Tu propio rol de propietario solo cambia mediante una transferencia.

Cambiar un miembro a Lector también le retira la asignación de sus incidencias abiertas y lo quita como responsable de sus objetivos, lo que saca esas incidencias de su ciclo personal. Reasigna ese trabajo si debe continuar.

Un cambio de rol se aplica a la siguiente solicitud de la persona, en la aplicación, en Numo y a través de MCP. El contenido que ya cargó o descargó no se recupera, y un enlace firmado a un archivo que ya abrió puede seguir siendo válido unos minutos.

### Resolver la falta de acceso {#invitation-recovery}

Si una invitación no aparece, compara el correo invitado con la cuenta que ha iniciado sesión y verifica la URL de la instancia. Pide al propietario que compruebe las invitaciones pendientes en lugar de crear cuentas repetidamente. Si tu rol cambia durante una sesión abierta, recarga el destino y comprueba tu rol antes de volver a intentar una escritura. Un lector que necesita editar pide al propietario que cambie su rol a Miembro. No compartas la sesión de otra persona para eludir un error de acceso.

## Transferir la propiedad {#transfer-ownership}

Un proyecto tiene exactamente un propietario. Para cederlo, abre **Configuración del proyecto** → **Miembros** como propietario, elige **Transferir la propiedad del proyecto** para un miembro existente y confirma. Solo un Miembro puede recibir la propiedad; invita antes a la persona o cambia un lector a Miembro. Después de la transferencia, sigues en el proyecto como Miembro.

### Qué cambia con la propiedad {#transfer-effects}

- Tus rutinas en este proyecto se pausan y no pueden iniciar trabajo nuevo. El nuevo propietario crea las rutinas que deban continuar con su propio presupuesto.
- Los límites del plan para incidencias e invitados por proyecto, el almacenamiento y la IA en segundo plano, como Smart Assign y la revisión de sugerencias, pasan a usar el plan y el presupuesto del nuevo propietario. Las incidencias y los miembros existentes se conservan.
- Las suscripciones, los métodos de pago y las claves y conexiones personales se quedan en cada cuenta.
- Las invitaciones pendientes siguen siendo válidas.

La transferencia falla sin cambiar nada si el almacenamiento del nuevo propietario no puede albergar los archivos del proyecto, o si ya es propietario de un proyecto con la misma clave. Libera almacenamiento o cambia la clave del proyecto e inténtalo de nuevo.
