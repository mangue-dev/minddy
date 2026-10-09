---
{
  "id": "projects",
  "locale": "es",
  "title": "Proyectos y miembros",
  "summary": "Configura un proyecto, invita a colaboradores y gestiona los miembros con los permisos necesarios.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "alt": "Configuración general del proyecto con nombre, clave, icono y una acción separada para la papelera.",
      "caption": "Comprueba el nombre y la clave antes de guardar. Mover el proyecto a la papelera es una acción separada.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/es/project-members.png",
      "alt": "Invitación por correo y tres miembros de demostración, con la persona propietaria identificada.",
      "caption": "Invita con el correo de la cuenta e identifica al propietario antes de retirar el acceso de un miembro.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Un proyecto reúne incidencias, objetivos, páginas y miembros. Su propietario gestiona los ajustes administrativos y las invitaciones. Los miembros trabajan con el contenido y pueden abandonar el proyecto. Consulta el apartado correspondiente para configurar el proyecto o resolver un problema de invitación.

## Configurar un proyecto {#project-settings}

Abre el proyecto y después sus ajustes. La propiedad del proyecto determina el acceso a los ajustes administrativos. Los miembros pueden consultar la sección general y abandonar el proyecto, pero no obtienen los controles de edición del propietario.

Como propietario, introduce un nombre que no esté vacío y una clave de proyecto válida, y guarda. La clave se normaliza a mayúsculas y utiliza de 2 a 5 letras o dígitos. Revisa los identificadores resultantes después de cambiarla. Usa los controles de icono y apariencia para distinguir el proyecto en la navegación; estas elecciones visuales no modifican la pertenencia al proyecto.

Otras secciones gestionan colaboradores, incidencias recurrentes, Git, importación, integraciones, automatización y sugerencias. Sigue la guía correspondiente antes de activar un proveedor o trabajo automático. Las preferencias de la cuenta, como el idioma de la interfaz, son independientes de la configuración del proyecto.


![Configuración general del proyecto con nombre, clave, icono y una acción separada para la papelera.](/documentation/es/project-general.png)

### Abandonar y eliminar {#project-removal}

Un miembro puede abandonar el proyecto para retirar su propio acceso. Pide al propietario que vuelva a invitarte si lo necesitas más adelante. Abandonarlo no elimina el proyecto para todos.

Eliminar el proyecto es una acción del propietario en la zona de peligro. Lee las consecuencias y la confirmación antes de hacerlo, sobre todo si contiene incidencias, páginas, archivos o integraciones. Si falla un guardado normal, conserva los valores que querías introducir, lee el error y actualiza el proyecto antes de intentarlo de nuevo. Evita repetir una acción destructiva cuando no sepas cuál fue su primer resultado.

## Invitar personas a un proyecto {#project-members}

El propietario del proyecto gestiona la pertenencia en los ajustes de miembros. Pide a la persona colaboradora el correo que utiliza en esta instancia, envía la invitación y comprueba que figure como pendiente. Ese mismo correo en otra instancia no concede acceso aquí.

La persona invitada inicia sesión con esa cuenta y abre la bandeja de entrada. Acepta la invitación pendiente para unirte o recházala si no esperabas ese proyecto. El diálogo de incorporación inicial ayuda a compartir tu correo con el propietario; no permite unirse a proyectos sin invitación.


![Invitación por correo y tres miembros de demostración, con la persona propietaria identificada.](/documentation/es/project-members.png)

### Responsabilidades del propietario y los miembros {#member-permissions}

| Persona | Acceso habitual al proyecto |
| --- | --- |
| Miembro | Trabajar con incidencias, páginas y espacios de colaboración del proyecto; gestionar sus propias preferencias de cuenta. |
| Propietario | Los recorridos de miembro más ajustes del proyecto, invitaciones y configuración de integraciones o automatización reservada al propietario. |
| Visitante de un enlace público | Solo el contenido publicado expresamente mediante ese enlace; sin pertenencia al proyecto. |

Revisa la lista de miembros antes de retirar a alguien. La fila del propietario no ofrece una acción de retirada, y estos controles no transfieren la propiedad del proyecto. El propietario puede cancelar una invitación pendiente antes de que se acepte; ese estado no revela si la dirección ya tiene una cuenta. La retirada termina el acceso como miembro; no recupera exportaciones, capturas o copias ya recibidas. Las credenciales personales de Git, IA y MCP siguen perteneciendo a la cuenta y no se transfieren por cambiar la propiedad del proyecto.

### Resolver la falta de acceso {#invitation-recovery}

Si una invitación no aparece, compara el correo invitado con la cuenta que ha iniciado sesión y verifica la URL de la instancia. Pide al propietario que compruebe las invitaciones pendientes en lugar de crear cuentas repetidamente. Si cambian los permisos durante una sesión abierta, recarga el destino y comprueba la pertenencia antes de volver a intentar una escritura. No compartas la sesión de otra persona para eludir un error de acceso.
