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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "v0.11.0",
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
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
  "figures": [
    {
      "id": "responsibilities",
      "kind": "diagram",
      "src": "/documentation/es/responsibilities.svg",
      "alt": "Responsabilidad de gestión: Gestionado por Minddy, Gestionado por ti.",
      "caption": "Los mismos servicios del núcleo necesitan un operador en ambos modelos. Los proveedores opcionales siguen siendo servicios separados.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        360,
        520
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "responsibilities"
  ]
}
---

## Elegir un modelo de gestión {#choose-an-instance}

Minddy Cloud y Minddy autoalojado ejecutan el mismo núcleo público. Elige Cloud si quieres que Minddy gestione la aplicación, la base de datos, Storage y el planificador. Elige el autoalojamiento si necesitas controlar la ubicación, los proveedores o el calendario de actualizaciones y puedes gestionar esos servicios.

Una cuenta Cloud pertenece a Cloud. Para una instancia autoalojada, crea una cuenta en esa instancia; no necesitas una cuenta de Minddy Cloud. Comprueba la dirección antes de iniciar sesión o invitar a alguien. Dos instancias de Minddy no comparten automáticamente cuentas ni credenciales.

![Responsabilidad de gestión: Gestionado por Minddy, Gestionado por ti.](/documentation/es/responsibilities.svg)

## Responsabilidades y costes {#responsibilities}

| Responsabilidad | Cloud | Autoalojamiento |
| --- | --- | --- |
| Infraestructura, actualizaciones e incidentes | Minddy gestiona el servicio. | Mantienes los servidores, TLS, la supervisión y las actualizaciones de versiones. |
| Copias y recuperación | Minddy gestiona el servicio Cloud. | Conservas los datos de la base, los archivos de Storage, la configuración y las claves de cifrado, y pruebas las restauraciones. |
| Cuentas de proveedores | Minddy es titular de las cuentas de los servicios que gestiona. | Eliges y pagas la infraestructura y los proveedores opcionales. |
| Asistencia | Se aplican las condiciones de asistencia Cloud. | Las herramientas de versiones y la ayuda comunitaria, según disponibilidad, cubren defectos reproducibles del núcleo; no se incluye un SLA para gestionar tu infraestructura. |

Por ejemplo, un equipo sin capacidad para gestionar bases de datos puede usar Cloud. Un operador con requisitos de residencia de datos puede elegir el autoalojamiento y revisar los destinos de cada proveedor activado. Alojar la aplicación no convierte en local a un proveedor externo de IA, correo o Git.

## Servicios necesarios y opcionales {#services}

Una instalación compatible necesita la aplicación y Supabase con PostgreSQL, Auth, Storage y Realtime. PostgreSQL por sí solo no basta. Usa una versión etiquetada y su matriz de compatibilidad. Las variantes derivadas de Supabase sin versión fijada y los adaptadores autogestionados de GitHub Enterprise o GitLab quedan fuera del contrato compatible.

La IA, el correo, Git, las notificaciones push y la analítica dependen de la configuración. El autoalojamiento no exige Stripe, PostHog, una clave de IA gestionada por Minddy ni una cuenta Cloud. La configuración opcional ausente se comunica en lugar de sustituirse silenciosamente por un proveedor. Las claves personales de IA y los puntos de acceso locales de IA son opciones posibles; su disponibilidad y coste dependen de la capacidad configurada.

Revisa los permisos y las condiciones sobre datos del proveedor antes de activar una integración. Las conexiones Git pueden usar el servicio de retransmisión de forjas gestionado cuando inicias explícitamente la integración; también puedes usar aplicaciones del proveedor propias o desactivar la retransmisión. El autoalojamiento no es una modalidad reducida de las funciones del núcleo.

## Fuente y siguiente paso {#next-step}

El repositorio de referencia es [mangue-dev/minddy](https://github.com/mangue-dev/minddy), bajo GNU AGPL v3.0 exclusivamente. Respeta la licencia y las reglas de nombres en despliegues modificados o alojados. Para instalar, abre la guía pública de autoalojamiento y su asistente. Antes de trasladar trabajo existente, consulta la guía de transferencia entre instancias: las credenciales y suscripciones no se transfieren con los datos de la cuenta.
