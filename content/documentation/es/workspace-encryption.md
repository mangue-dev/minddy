---
{
  "id": "workspace-encryption",
  "locale": "es",
  "title": "Cifrado del espacio de trabajo",
  "summary": "Compruebe el cifrado de su versión y conserve las claves de recuperación de credenciales y contenido del espacio de trabajo.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "scripts/self-hosting-encryption.mjs",
      "lib/server/encryption/data-policy.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Configurar el cifrado y conservar las claves"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/es/workspace-encryption-flow.svg",
      "alt": "Diagrama: Raíz dedicada fuera de PostgreSQL. Claves de proyecto, usuario y sistema envueltas. Descifrado autorizado en servidor. Restaurar base + Storage + mismas claves.",
      "caption": "Conserve las claves correspondientes a los datos de la copia para que la instancia restaurada pueda descifrar su contenido.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Raíz dedicada fuera de PostgreSQL"
          },
          {
            "title": "Claves proyecto, usuario y sistema envueltas"
          },
          {
            "title": "Descifrado autorizado en servidor"
          },
          {
            "title": "Restaurar base + Storage + mismas claves"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "workspace-encryption-flow"
  ]
}
---

## Configurar el cifrado y conservar las claves {#workspace-encryption}

Las opciones --encryption del instalador y del bootstrap descritas aquí pertenecen a las herramientas del candidato 0.11.1 identificado. El instalador y el bootstrap publicados en v0.11.0 no las aceptan. El runtime de esa versión reconoce MINDDY_CONTENT_ENCRYPTION_ENABLED; el servicio Compose de referencia carga el archivo protegido mediante env_file. Un cambio explícito del flag exige, por tanto, recrear el servicio de la aplicación con el mismo entorno y comprobar el esquema y el comportamiento real. Una clave MINDDY_DATA_ROOT_KEY generada no demuestra que el contenido del espacio esté cifrado. Utilice herramientas y configuración correspondientes y verificadas explícitamente para la versión elegida antes de recibir usuarios o modificar una instancia existente.

Las instalaciones locales y de servidor nuevas activan el cifrado por defecto y generan una MINDDY_DATA_ROOT_KEY dedicada. Para un servidor nuevo puede elegir explícitamente --encryption enabled o --encryption disabled. Ambas opciones conservan el cifrado de credenciales y generan una raíz independiente: la elección afecta al contenido. Para la instalación local de escritorio, prepare la configuración antes de abrir el clon mediante el comando siguiente. La raíz es un valor aleatorio de 32 bytes, representado por exactamente 64 caracteres hexadecimales y conservado fuera de PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```

![Diagrama: Raíz dedicada fuera de PostgreSQL. Claves de proyecto, usuario y sistema envueltas. Descifrado autorizado en servidor. Restaurar base + Storage + mismas claves.](/documentation/es/workspace-encryption-flow.svg)

## Tratar datos existentes y repeticiones {#existing-data}

Una configuración existente sin el indicador permanece desactivada hasta que la cambie deliberadamente. Repetir el instalador conserva el indicador y la raíz; una elección explícita contradictoria se rechaza. No genere una clave nueva para reparar una instancia cifrada: recupere la original. Aplique el esquema requerido y la verificación antes de importar datos. La tarea de mantenimiento avanza por lotes en la conversión histórica y la rotación. Activar el indicador no demuestra que se hayan convertido todos los contenidos antiguos o sus copias. Desactivarlo no descifra los datos protegidos ni permite nuevas escrituras en claro en los ámbitos protegidos.

## Preservar la recuperación {#recovery}

El servidor descifra para los usuarios autorizados y el procesamiento de IA autorizado. Es cifrado en reposo, sin excluir al operador mediante cifrado de extremo a extremo. Los emails de inicio de sesión y los metadatos de enrutamiento siguen siendo legibles; las exportaciones y los proveedores externos necesitan protección propia. Conserve las raíces actuales e históricas necesarias para las copias retenidas. Cifre y restrinja el acceso a una copia completa que contiene tanto configuración como datos. Pruebe la restauración de la base de datos y Storage con las claves correspondientes. Cambiar la raíz exige volver a envolver las claves sin conexión y con las aplicaciones detenidas; sustituirla directamente hace ilegible el contenido protegido.
