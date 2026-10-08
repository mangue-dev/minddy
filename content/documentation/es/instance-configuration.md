---
{
  "id": "instance-configuration",
  "locale": "es",
  "title": "Configurar orígenes, secretos y capacidades de la instancia",
  "summary": "Defina MINDDY_PUBLIC_APP_URL como una única URL de origen absoluta, sin ruta ni barra final.",
  "topic": "Administrar una instancia",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---
## Configurar orígenes, secretos y capacidades de la instancia {#instance-configuration}

Defina MINDDY_PUBLIC_APP_URL como una única URL de origen absoluta, sin ruta ni barra final. Los despliegues públicos usan HTTPS; localhost y una red IPv4 privada de confianza pueden usar HTTP. MINDDY_PUBLIC_SUPABASE_URL y MINDDY_PUBLIC_SUPABASE_ANON_KEY deben corresponder al mismo entorno Supabase. Esos valores llegan al navegador. SUPABASE_SERVICE_ROLE_KEY es exclusiva del servidor y obligatoria en producción: no la coloque en variables públicas ni en un bundle cliente. La URL de la base de datos sirve a las herramientas y no sustituye la configuración de la API.



## Conservar los secretos {#secrets}

El instalador genera los valores ausentes de GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET y AGENT_RUNNER_SECRET. La clave raíz de contenido debe tener exactamente 64 caracteres hexadecimales. Consérvela fuera de PostgreSQL con una copia de recuperación protegida. Mantenga todo el archivo de entorno con permisos 0600 y fuera de Git. No lo ejecute como código shell ni lo imprima. Repetir la instalación no rota los secretos. Perder claves de cifrado puede hacer ilegibles los datos existentes; una rotación deliberada exige el procedimiento de recuperación correspondiente.



## Aplicar y comprobar un cambio {#capabilities}

MINDDY_PUBLIC_SITE_NAME y MINDDY_PUBLIC_CONTACT_EMAIL identifican la instancia. ADMIN_EMAILS contiene las direcciones de los administradores, separadas por comas; el acceso privilegiado también exige MFA. OAUTH_ISSUER normalmente queda vacío, salvo que publique OAuth de forma intencionada en otra URL de origen estable. Mantenga desactivadas la IA y la facturación gestionadas en self-hosted. Active los servicios opcionales solo cuando su configuración esté completa. Reinicie o recree la aplicación tras cambiar los valores públicos de ejecución; la imagen OCI no requiere recompilación. Ejecute doctor para distinguir capacidades incompletas de fallos del núcleo y pruebe los enlaces de cuenta y callbacks en la URL de origen prevista.
