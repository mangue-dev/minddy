---
{
  "id": "project-settings",
  "locale": "es",
  "title": "Configurar un proyecto",
  "summary": "Modifica su nombre, clave y apariencia como propietario y comprende el acceso de los miembros.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/es/project-general.png",
      "alt": "Configuración general del proyecto con nombre, clave, icono y una acción separada para la papelera.",
      "caption": "Comprueba el nombre y la clave antes de guardar. Mover el proyecto a la papelera es una acción separada.",
      "revision": 3,
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
    "project-settings-steps"
  ]
}
---

## Abrir los ajustes del proyecto {#project-settings}

Abre el proyecto y después sus ajustes. La propiedad del proyecto determina el acceso a los ajustes administrativos. Los miembros pueden consultar la sección general y abandonar el proyecto, pero no obtienen los controles de edición del propietario.

Como propietario, introduce un nombre que no esté vacío y una clave de proyecto válida, y guarda. La clave se normaliza a mayúsculas y utiliza de 2 a 5 letras o dígitos. Revisa los identificadores resultantes después de cambiarla. Usa los controles de icono y apariencia para distinguir el proyecto en la navegación; estas elecciones visuales no modifican la pertenencia al proyecto.

Otras secciones gestionan colaboradores, incidencias recurrentes, Git, importación, integraciones, automatización y comentarios. Sigue la guía correspondiente antes de activar un proveedor o trabajo automático. Las preferencias de la cuenta, como el idioma de la interfaz, son independientes de la configuración del proyecto.


![Configuración general del proyecto con nombre, clave, icono y una acción separada para la papelera.](/documentation/es/project-general.png)

## Abandonar y eliminar {#project-removal}

Un miembro puede abandonar el proyecto para retirar su propio acceso. Pide al propietario que vuelva a invitarte si lo necesitas más adelante. Abandonarlo no elimina el proyecto para todos.

Eliminar el proyecto es una acción del propietario en la zona de peligro. Lee las consecuencias y la confirmación antes de hacerlo, sobre todo si contiene incidencias, páginas, archivos o integraciones. Si falla un guardado normal, conserva los valores que querías introducir, lee el error y actualiza el proyecto antes de intentarlo de nuevo. Evita repetir una acción destructiva cuando no sepas cuál fue su primer resultado.
