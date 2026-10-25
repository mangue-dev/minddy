---
{
  "id": "workspace-encryption",
  "locale": "es",
  "title": "Cifrado del espacio de trabajo",
  "summary": "Comprueba el cifrado de tu versión y conserva las claves de recuperación de credenciales y contenido del espacio de trabajo.",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "desktop/src/local-installer.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the local paragraph now distinguishes the desktop app's built-in installer, which keeps the default, from a clone you prepare yourself; no installation run, no screenshot recaptured, existing figures carried forward unchanged)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "caption": "Conserva las claves correspondientes a los datos de la copia para que la instancia restaurada pueda descifrar su contenido.",
      "revision": 8,
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

Las opciones `--encryption` del instalador y del bootstrap descritas aquí se incluyen en las herramientas de esta versión. El instalador y el bootstrap de v0.11.0 no las aceptan. El runtime de esa versión reconoce `MINDDY_CONTENT_ENCRYPTION_ENABLED`; el servicio Compose de referencia carga el archivo protegido mediante `env_file`. Un cambio explícito del flag exige, por tanto, recrear el servicio de la aplicación con el mismo entorno y comprobar el esquema y el comportamiento real. Una clave `MINDDY_DATA_ROOT_KEY` generada no demuestra que el contenido del espacio esté cifrado. Utiliza herramientas y configuración correspondientes y verificadas explícitamente para la versión elegida antes de recibir usuarios o modificar una instancia existente.

Las instalaciones locales y de servidor nuevas activan el cifrado por defecto y generan una `MINDDY_DATA_ROOT_KEY` dedicada. Para un servidor nuevo puedes elegir explícitamente `--encryption enabled` o `--encryption disabled`. Ambas opciones conservan el cifrado de credenciales y generan una raíz independiente: la elección afecta al contenido. El instalador local integrado en la aplicación de escritorio mantiene el valor predeterminado. Para un clon que preparas tú, registra la configuración elegida con el comando siguiente antes de abrir el clon en la aplicación. La raíz es un valor aleatorio de 32 bytes, representado por exactamente 64 caracteres hexadecimales y conservado fuera de PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```

![Diagrama: Raíz dedicada fuera de PostgreSQL. Claves de proyecto, usuario y sistema envueltas. Descifrado autorizado en servidor. Restaurar base + Storage + mismas claves.](/documentation/es/workspace-encryption-flow.svg)

## Tratar datos existentes y repeticiones {#existing-data}

Una configuración existente sin el indicador permanece desactivada hasta que la cambies deliberadamente. Repetir el instalador conserva el indicador y la raíz; una elección explícita contradictoria se rechaza. No generes una clave nueva para reparar una instancia cifrada: recupera la original. Aplica el esquema requerido y la verificación antes de importar datos. La tarea de mantenimiento avanza por lotes en la conversión histórica y la rotación. Activar el indicador no demuestra que se hayan convertido todos los contenidos antiguos o sus copias. Desactivarlo no descifra los datos protegidos ni permite nuevas escrituras en claro en los ámbitos protegidos.

## Preservar la recuperación {#recovery}

El servidor descifra para los usuarios autorizados y el procesamiento de IA autorizado. Es cifrado en reposo, sin excluir al operador mediante cifrado de extremo a extremo. Los emails de inicio de sesión y los metadatos de enrutamiento siguen siendo legibles; las exportaciones y los proveedores externos necesitan protección propia. Conserva las raíces actuales e históricas necesarias para las copias retenidas. Cifra y restringe el acceso a una copia completa que contiene tanto configuración como datos. Prueba la restauración de la base de datos y Storage con las claves correspondientes. Cambiar la raíz exige volver a envolver las claves sin conexión y con las aplicaciones detenidas; sustituirla directamente hace ilegible el contenido protegido.
