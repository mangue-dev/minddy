---
{
  "id": "managed-or-source-installation",
  "locale": "es",
  "title": "Instalar con Supabase gestionado o desde el código fuente",
  "summary": "Supabase gestionado describe quién opera el backend.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/es/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Su proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.",
      "caption": "Estos componentes tienen responsabilidades distintas. Su proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "managed-or-source-installation-flow"
  ]
}
---
## Instalar con Supabase gestionado o desde el código fuente {#managed-or-source-installation}

Supabase gestionado describe quién opera el backend. Puede acompañar al perfil de aplicación OCI oficial o a un servidor compilado desde el código. Distinga ambos despliegues en los registros de instalación y aceptación. El backend debe proporcionar PostgreSQL, Auth, Storage y Realtime. Para el perfil OCI managed guiado necesita un proyecto en supabase.com, su URL pública, las claves anon y service-role y una conexión PostgreSQL accesible desde las herramientas de bootstrap. Utilice un proyecto propio; las credenciales de Minddy Cloud no son datos de instalación.

![Diagrama: Su proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.](/documentation/es/managed-or-source-installation-flow.svg)

## Configurar Supabase gestionado {#managed}

Ejecute el comando siguiente desde el directorio de la versión verificada. IMAGE es el digest comprobado en el artículo de compatibilidad. Los valores ... son ejemplos que debe sustituir, no credenciales utilizables. Obtenga los valores reales de forma privada y evite que aparezcan en el historial del terminal o en registros compartidos. El instalador conserva el entorno protegido existente, incluye el planificador y el runner y mantiene los servicios opcionales desactivados hasta que se configuren. Configure por separado el SMTP de Auth y las redirecciones exactas en su proyecto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Completar el despliegue desde fuentes {#source}

Para instalar desde el código, instale las dependencias fijadas de la etiqueta, proporcione el entorno de Minddy y Supabase, ejecute bootstrap, compile e inicie el servidor de producción detrás de un proxy inverso. Establezca los valores MINDDY_PUBLIC_* antes de iniciar. Debe proporcionar un planificador persistente con las llamadas autenticadas de [la configuración de red](/es/documentacion/proxy-network-and-jobs#schedules): compilar no pone en marcha los trabajos. Verifique migraciones y Storage y pruebe Auth, creación de incidencias, bytes de los archivos y Realtime. Utilice el procedimiento lógico o del proveedor para las copias. Un servidor compilado desde el código no valida una instalación OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
