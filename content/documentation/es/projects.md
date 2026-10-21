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
  "revision": 16,
  "sourceRevision": 15,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-21",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "lib/server/categories.ts",
      "components/settings/project-settings-page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "lib/server/collaborators.ts",
      "lib/collaborator-search.ts",
      "components/collaborator-suggestions.tsx",
      "app/api/me/collaborators/route.ts",
      "components/ui/confirm-delete-dialog.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:claude (MIN-760: category reordering paragraph checked against components/project-categories.tsx, the order route and the Numo/MCP tools; existing figures unaffected and kept; no browser walkthrough of the procedure)",
    "language": "agent:claude (es translation of the added en paragraph, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-21"
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Tarjeta «Invitar a personas» sobre la tarjeta Miembros, que lista tres miembros de demostración con la persona propietaria identificada.",
      "caption": "Invita con el correo de la cuenta e identifica al propietario antes de retirar el acceso de un miembro.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

La pestaña **General** empieza con la identidad del proyecto: su icono, su nombre y su clave, y después cinco cifras: **Incidencias**, **Miembros**, **Objetivos**, **Categorías** y **Creado**. Como propietario, cambias el icono, el nombre y la clave donde se muestran; ya no hay botón Guardar. Selecciona el icono y elige **Nueva esfera** (solo aparece mientras ninguna imagen cubra la esfera), **Cargar una imagen**, **Importar desde un sitio web…**, que pide la dirección del sitio e importa su icono al elegir **Importación**, o, si hay una imagen, **Quitar la imagen**, que pide confirmación antes porque la imagen se elimina. Selecciona el nombre o la clave para editarlos: en un ordenador se convierten en un campo donde Intro o salir del campo guarda y Escape cancela; en un teléfono se abre una hoja con **Guardar**. El nombre no puede quedar vacío. La clave se normaliza a mayúsculas y debe tener de 2 a 5 letras (A–Z); si no, aparece un error y la clave no se guarda. Revisa los identificadores resultantes después de cambiarla. El icono solo distingue el proyecto en la navegación; no modifica la pertenencia al proyecto. Los miembros y los lectores ven el mismo encabezado sin estos controles.

Las demás pestañas son **Categorías**, **Miembros**, **Recurrencias**, **Asignar inteligentemente**, **Sugerencias**, **Git**, **Importación** e **Integraciones**. Sigue la guía correspondiente antes de activar un proveedor o trabajo automático. Las preferencias de la cuenta, como el idioma de la interfaz, son independientes de la configuración del proyecto.

En **Categorías**, el propietario y los miembros gestionan las categorías que clasifican las incidencias. Elige **Nueva categoría** en la línea de título de la tarjeta: aparece arriba de la lista una fila con un punto de color y un campo de nombre. Pulsa Intro o elige **Añadir** para crear la categoría; Escape cierra la fila sin crearla. Selecciona el punto de color de una categoría para elegir otro color, que se aplica al instante (en un teléfono los colores se abren en una hoja), o selecciona su nombre para renombrarla allí mismo. El botón de eliminar pide confirmación y después quita la categoría de todas las incidencias. En cuanto el proyecto tiene dos categorías o más, cada fila muestra un asa a la izquierda: arrástrala para subir o bajar la categoría. Con el teclado, enfoca el asa, pulsa Espacio, mueve la categoría con las flechas Arriba y Abajo y pulsa Espacio de nuevo para soltarla; Escape cancela. Este orden es el que muestran todos los menús y filtros de categorías a todo el proyecto. Numo y los clientes MCP de Minddy también pueden leerlo y cambiarlo, por ejemplo cuando pides a Numo que ponga una categoría en primer lugar.


![Cabecera del proyecto con el icono y su distintivo de edición, el nombre, la clave y las cifras Incidencias, Miembros, Objetivos, Categorías y Creado.](/documentation/es/project-general.png)

### Ocultar un proyecto para ti {#hide-project}

Oculta un proyecto que ya no sigues a diario para quitarlo de tu barra lateral y de tu inicio sin abandonarlo. En la configuración general del proyecto, elige **Ocultar** en la **Zona de peligro**, o haz clic derecho en el proyecto en la barra lateral y elige **Ocultar proyecto** y confirma. En ambos casos, un diálogo que nombra el proyecto pide confirmación porque sale de tu navegación; volver a mostrarlo no requiere confirmación. Cualquier persona del proyecto puede ocultarlo, incluidos el propietario y los lectores.

Ocultarlo solo cambia tu propia navegación. La preferencia se guarda en tu cuenta, así que se mantiene al volver a iniciar sesión y en tus otros dispositivos. Conservas tu acceso y puedes seguir abriendo y editando el proyecto desde un enlace directo o desde la pestaña **Proyectos ocultos** de la **Configuración de la cuenta**. Los demás miembros siguen viendo el proyecto, y sus rutinas, integraciones y notificaciones siguen funcionando. Abrir un proyecto oculto no lo devuelve a tu barra lateral.

Para recuperarlo, elige **Mostrar** en **Proyectos ocultos** o en la configuración general del proyecto, o elige **Mostrar proyecto** en su menú de la barra lateral. Si el cambio no se puede guardar, aparece un error y el proyecto vuelve a su estado anterior; inténtalo de nuevo. A diferencia de abandonar el proyecto o moverlo a la papelera, ocultarlo nunca retira acceso ni contenido.

### Abandonar y eliminar {#project-removal}

Un miembro o un lector puede elegir **Dejar** en la zona de peligro para retirar su propio acceso; antes, un diálogo que nombra el proyecto pide confirmación. Pide al propietario que vuelva a invitarte si lo necesitas más adelante. Abandonarlo no elimina el proyecto para todos. El propietario no puede abandonarlo: antes debe [transferir la propiedad](#transfer-ownership) a un miembro.

Quitar el proyecto es una acción del propietario: en la zona de peligro, elige **Mover a la papelera** junto a **Mueva el proyecto a la basura**. La confirmación nombra el proyecto e indica que sus incidencias, objetivos y sugerencias se van con él; el proyecto se puede restaurar desde la [papelera](/es/documentacion/trash-and-recovery) durante 30 días, y su clave queda libre de inmediato. Lee la confirmación antes de hacerlo, sobre todo si contiene incidencias, páginas, archivos o integraciones. Si falla un guardado normal, conserva los valores que querías introducir, lee el error y actualiza el proyecto antes de intentarlo de nuevo. Evita repetir una acción destructiva cuando no sepas cuál fue su primer resultado.

El propietario también puede hacer clic derecho en el proyecto en la barra lateral y elegir **Mover a la papelera**. Aparece la misma confirmación y solo se ve afectado el proyecto en el que hiciste clic.

## Invitar personas a un proyecto {#project-members}

El propietario del proyecto gestiona la pertenencia en **Configuración del proyecto** → **Miembros**. En la tarjeta **Invitar a personas**, busca un nombre o introduce el correo que la persona utiliza en esta instancia. Mientras escribes, **De tus proyectos** propone a las personas que ya se han unido a alguno de tus otros proyectos, como propietario, miembro o lector, con un correo verificado; quien solo ha sido invitado nunca se propone, ni tampoco los miembros actuales ni las invitaciones pendientes. Elige a una persona para colocarla en el campo con su avatar y su nombre, o pulsa Intro cuando el nombre solo coincida con una persona. Cualquier otra persona se invita por correo. Después elige su rol y **Invitar**. Una persona elegida de tus proyectos se invita por su cuenta: Minddy vuelve a comprobar que se ha unido a alguno de tus proyectos y, si no, lo rechaza con «Esta persona no forma parte de tus proyectos.» La invitación aparece en la tarjeta **Invitaciones pendientes** hasta que se acepta; los miembros actuales figuran en la tarjeta **Miembros**, cuyo título indica cuántos son. Elige **Miembro** para alguien que trabaja en el proyecto, o **Lector** para alguien que solo lo sigue. Para un lector, activa **Puede comentar** si debe participar en las conversaciones. Mientras la invitación esté pendiente, el propietario puede cambiar su rol y la opción de comentar. Ese mismo correo en otra instancia no concede acceso aquí.

La persona invitada inicia sesión con esa cuenta y abre la bandeja de entrada. Acepta la invitación pendiente para unirte con el rol que indica, o recházala si no esperabas ese proyecto. El diálogo de incorporación inicial ayuda a compartir tu correo con el propietario; no permite unirse a proyectos sin invitación.

También puedes invitar a personas al crear el proyecto. En el paso **Invita a tu equipo** del asistente, busca un nombre o introduce un correo. Debajo del campo, **De tus proyectos** propone a las mismas personas que la tarjeta **Invitar a personas**, incluso antes de escribir, y se filtra mientras escribes. Elige a una persona, o pulsa Intro cuando solo coincida una; escribir la dirección de una de esas personas también la añade por su nombre. Añade a cualquier otra persona por correo con **Añadir** o Intro. El límite de invitados de tu plan se aplica igual que aquí, y la lista se guarda con el borrador del proyecto si retomas la creación más tarde.

No se envía nada hasta que eliges **Acabar**: primero se crea el proyecto y después cada persona recibe una invitación con el rol **Miembro**. Las personas elegidas de tus proyectos se invitan por su cuenta: Minddy vuelve a comprobar que se han unido a alguno de tus proyectos y usa su dirección verificada. Las demás se invitan por correo. Estas invitaciones aparecen en la tarjeta **Invitaciones pendientes**, donde puedes cambiar su rol, y se aceptan en la bandeja de entrada como cualquier otra. Si se rechaza alguna, por ejemplo por el límite de invitados del plan o porque alguien ha dejado entretanto el proyecto que compartíais («Esta persona no forma parte de tus proyectos.»), las demás se envían igualmente y una notificación indica cada persona no invitada y el motivo. Revisa la tarjeta **Invitaciones pendientes** antes de volver a invitarlas. Una invitación pendiente queda registrada, lo que no garantiza que su correo se haya entregado.


![Tarjeta «Invitar a personas» sobre la tarjeta Miembros, que lista tres miembros de demostración con la persona propietaria identificada.](/documentation/es/project-members.png)

### Roles de propietario, miembro y lector {#member-permissions}

| Rol | Acceso al proyecto |
| --- | --- |
| Propietario | Uno por proyecto. Todo lo que puede hacer un miembro, más los ajustes del proyecto, las invitaciones y los roles, las integraciones, el vínculo con Git, las rutinas, la transferencia de la propiedad y la eliminación del proyecto. |
| Miembro | Todo el trabajo sobre el contenido: incidencias, planes, objetivos, sugerencias, páginas y bases de datos, comentarios, archivos, vistas compartidas y enlaces de publicación, acciones de Git y de pull requests, Numo y MCP. Puede abandonar el proyecto. |
| Lector | Lee el contenido, los miembros y las rutinas del proyecto. Puede ocultar el proyecto, aparecer en los avatares de presencia de una página, usar vistas personales y notificaciones, y abandonar el proyecto. No puede editar contenido, recibir asignaciones, liderar un objetivo ni publicar enlaces, y no ve las integraciones ni los tokens de compartición y de tablero. |
| Lector con **Puede comentar** | El acceso de lector más los comentarios en incidencias, objetivos, hilos internos de sugerencias y páginas: respuestas, menciones, archivos adjuntos a sus propios comentarios, y edición o eliminación de sus propios comentarios. Las respuestas públicas en el tablero de feedback y los comentarios o reacciones en pull requests siguen sin estar disponibles. |
| Visitante de un enlace público | Solo el contenido publicado expresamente mediante ese enlace; sin pertenencia al proyecto. |

Los lectores cuentan para el límite de invitados por proyecto del plan igual que los miembros, y también las invitaciones pendientes. No hay facturación por puesto.

Revisa la lista de miembros antes de retirar a alguien. La fila del propietario no ofrece una acción de retirada; solo una [transferencia](#transfer-ownership) cambia el propietario. El propietario puede cancelar una invitación pendiente antes de que se acepte, tras confirmarlo en un diálogo que nombra la dirección invitada; el enlace del correo deja entonces de funcionar, y se puede volver a invitar a esa persona más adelante. El estado pendiente no revela si la dirección ya tiene una cuenta. La retirada termina el acceso como miembro; no recupera exportaciones, capturas o copias ya recibidas. Las credenciales personales de Git, IA y MCP siguen perteneciendo a la cuenta y no se transfieren por cambiar la propiedad del proyecto.

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
