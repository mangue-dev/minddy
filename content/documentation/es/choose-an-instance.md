---
{
  "id": "choose-an-instance",
  "locale": "es",
  "title": "Instancias Cloud y autoalojadas",
  "summary": "Compara quién gestiona el servicio, adónde van los datos y qué proveedores opcionales debes configurar.",
  "topic": "Primeros pasos",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md",
      "app/(marketing)/self-hosting/install/page.tsx",
      "lib/public-routes.ts",
      "desktop/src/local-installer.ts",
      "desktop/src/local-account.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the account paragraph and the next step now point local instances to the desktop app's built-in installer; no installation run, no screenshot recaptured, existing figures carried forward unchanged)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Elegir Cloud o tu propia instancia"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Elegir un modelo de gestión {#choose-an-instance}

minddy Cloud y minddy autoalojado ejecutan el mismo núcleo público. Elige Cloud si quieres que minddy gestione la aplicación, la base de datos, Storage y el planificador. Elige el autoalojamiento si necesitas controlar la ubicación, los proveedores o el calendario de actualizaciones y puedes gestionar esos servicios.

Una cuenta Cloud pertenece a Cloud. Para una instancia autoalojada, crea una cuenta en esa instancia; no necesitas una cuenta de minddy Cloud. Una instancia local instalada por la aplicación de escritorio crea esa cuenta por ti. Comprueba la dirección antes de iniciar sesión o invitar a alguien. Dos instancias de minddy no comparten automáticamente cuentas ni credenciales.


## Responsabilidades y costes {#responsibilities}

| Responsabilidad | Cloud | Autoalojamiento |
| --- | --- | --- |
| Infraestructura, actualizaciones e incidentes | minddy gestiona el servicio. | Mantienes los servidores, TLS, la supervisión y las actualizaciones de versiones. |
| Copias y recuperación | minddy gestiona el servicio Cloud. | Conservas los datos de la base, los archivos de Storage, la configuración y las claves de cifrado, y pruebas las restauraciones. |
| Cuentas de proveedores | minddy es titular de las cuentas de los servicios que gestiona. | Eliges y pagas la infraestructura y los proveedores opcionales. |
| Asistencia | Se aplican las condiciones de asistencia Cloud. | Las herramientas de versiones y la ayuda comunitaria, según disponibilidad, cubren defectos reproducibles del núcleo; no se incluye un SLA para gestionar tu infraestructura. |

Por ejemplo, un equipo sin capacidad para gestionar bases de datos puede usar Cloud. Un operador con requisitos de residencia de datos puede elegir el autoalojamiento y revisar los destinos de cada proveedor activado. Alojar la aplicación no convierte en local a un proveedor externo de IA, correo o Git.

## Servicios necesarios y opcionales {#services}

Una instalación compatible necesita la aplicación y Supabase con PostgreSQL, Auth, Storage y Realtime. PostgreSQL por sí solo no basta. Usa una versión etiquetada y su matriz de compatibilidad. Las variantes derivadas de Supabase sin versión fijada y los adaptadores autogestionados de GitHub Enterprise o GitLab quedan fuera del contrato compatible.

La IA, el correo, Git, las notificaciones push y la analítica dependen de la configuración. El autoalojamiento no exige Stripe, PostHog, una clave de IA gestionada por minddy ni una cuenta Cloud. La configuración opcional ausente se comunica en lugar de sustituirse silenciosamente por un proveedor. Las claves personales de IA y, en la aplicación de escritorio, los puntos de acceso locales de IA son opciones posibles; su disponibilidad y coste dependen de la capacidad configurada.

Revisa los permisos y las condiciones sobre datos del proveedor antes de activar una integración. Las conexiones Git pueden usar el servicio de retransmisión de forjas gestionado cuando inicias explícitamente la integración; también puedes usar aplicaciones del proveedor propias o desactivar la retransmisión. El autoalojamiento no es una modalidad reducida de las funciones del núcleo.

## Fuente y siguiente paso {#next-step}

El repositorio de referencia es [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy), bajo GNU AGPL v3.0 exclusivamente. Respeta la licencia y las reglas de nombres en despliegues modificados o alojados. Para ejecutar minddy en tu propio equipo, usa la aplicación de escritorio: **Autoalojar minddy** › **Instalar en este equipo** instala e inicia una [instancia local](/es/documentacion/install-locally#install-locally) por ti. Para un servidor, empieza con el [asistente de autoalojamiento paso a paso](/es/autoalojamiento/instalar). Consulta la [referencia de instalación](/es/documentacion/installation) para los detalles técnicos y las comprobaciones adicionales. Antes de trasladar trabajo existente, consulta la guía de transferencia entre instancias: las credenciales y suscripciones no se transfieren con los datos de la cuenta.
