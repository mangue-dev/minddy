---
{
  "id": "project-members",
  "locale": "es",
  "title": "Invitar personas a un proyecto",
  "summary": "Usa el correo de la cuenta prevista, acepta invitaciones y gestiona el acceso al proyecto.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/es/project-members.png",
      "alt": "Invitación por correo y tres miembros de demostración, con la persona propietaria identificada.",
      "caption": "Invita con el correo de la cuenta e identifica al propietario antes de retirar el acceso de un miembro.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "project-members-steps"
  ]
}
---

## Enviar y aceptar una invitación {#project-members}

El propietario del proyecto gestiona la pertenencia en los ajustes de miembros. Pide a la persona colaboradora el correo que utiliza en esta instancia, envía la invitación y comprueba que figure como pendiente. Ese mismo correo en otra instancia no concede acceso aquí.

La persona invitada inicia sesión con esa cuenta y abre la bandeja de entrada. Acepta la invitación pendiente para unirte o recházala si no esperabas ese proyecto. El diálogo de incorporación inicial ayuda a compartir tu correo con el propietario; no permite unirse a proyectos sin invitación.


![Invitación por correo y tres miembros de demostración, con la persona propietaria identificada.](/documentation/es/project-members.png)

## Responsabilidades del propietario y los miembros {#member-permissions}

| Persona | Acceso habitual al proyecto |
| --- | --- |
| Miembro | Trabajar con incidencias, páginas y espacios de colaboración del proyecto; gestionar sus propias preferencias de cuenta. |
| Propietario | Los recorridos de miembro más ajustes del proyecto, invitaciones y configuración de integraciones o automatización reservada al propietario. |
| Visitante de un enlace público | Solo el contenido publicado expresamente mediante ese enlace; sin pertenencia al proyecto. |

Revisa la lista de miembros antes de retirar a alguien. La fila del propietario no ofrece una acción de retirada, y estos controles no transfieren la propiedad del proyecto. El propietario puede cancelar una invitación pendiente antes de que se acepte; ese estado no revela si la dirección ya tiene una cuenta. La retirada termina el acceso como miembro; no recupera exportaciones, capturas o copias ya recibidas. Las credenciales personales de Git, IA y MCP siguen perteneciendo a la cuenta y no se transfieren por cambiar la propiedad del proyecto.

## Resolver la falta de acceso {#invitation-recovery}

Si una invitación no aparece, compara el correo invitado con la cuenta que ha iniciado sesión y verifica la URL de la instancia. Pide al propietario que compruebe las invitaciones pendientes en lugar de crear cuentas repetidamente. Si cambian los permisos durante una sesión abierta, recarga el destino y comprueba la pertenencia antes de volver a intentar una escritura. No compartas la sesión de otra persona para eludir un error de acceso.
