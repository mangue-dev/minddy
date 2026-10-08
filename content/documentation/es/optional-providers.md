---
{
  "id": "optional-providers",
  "locale": "es",
  "title": "Activar proveedores opcionales de forma explícita",
  "summary": "El núcleo no exige Stripe, PostHog, una cuenta Cloud ni una clave de IA gestionada por Minddy.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
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
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/es/optional-providers-flow.svg",
      "alt": "Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.",
      "caption": "Estos componentes tienen responsabilidades distintas. Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.",
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
    "optional-providers-flow"
  ]
}
---
## Activar proveedores opcionales de forma explícita {#optional-providers}

El núcleo no exige Stripe, PostHog, una cuenta Cloud ni una clave de IA gestionada por Minddy. Los servicios externos tienen costes, permisos y destinos de datos propios. Revise sus condiciones antes de activarlos. El diagnóstico informa de valores ausentes sin elegir un proveedor alternativo. Una instancia self-hosted puede usar claves de IA personales o endpoints locales accesibles. Mantenga MINDDY_MANAGED_AI y MINDDY_MANAGED_BILLING desactivados; configurar una clave OpenRouter por sí sola no selecciona Cloud.

![Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.](/documentation/es/optional-providers-flow.svg)

## Configurar proveedores completos {#configure}

El email de la aplicación necesita EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console no se admite en producción; el SMTP de Auth se configura por separado. Web Push necesita el par VAPID público/privado y VAPID_SUBJECT; las suscripciones existentes dependen de ese par. Analytics necesita la clave y el host de PostHog; el seguimiento de errores también exige MINDDY_PUBLIC_ERROR_TRACKING=1. El instalador ofrece application-email y web-push, pero usted debe proporcionar las credenciales externas. No use remitentes Minddy ni credenciales de sus versiones nativas en otra instancia.



## Conectar Git y ejecución de código {#git-and-code}

Los adaptadores admiten GitHub.com y GitLab.com, no GitHub Enterprise Server ni GitLab autogestionado. Las conexiones iniciadas por usuarios pueden utilizar el relay gestionado. Puede excluirlo con --no-forge-relay o MINDDY_FORGE_RELAY=0 y configurar aplicaciones propias. Las conexiones existentes conservan su canal hasta que se reconectan. El perfil de servidor incluye el runner Docker de confianza. Vercel Sandbox es una alternativa explícita que exige sus credenciales y una MINDDY_DATA_ROOT_KEY válida incluso si el cifrado de contenido está desactivado. La ejecución local de código en escritorio se ha retirado. Una configuración ausente bloquea la delegación; no ejecuta el trabajo en el ordenador del usuario.

La imagen publicada de la aplicación incluye Node.js y Git, pero elimina expresamente npm, npx y Corepack. El perfil Compose de referencia también selecciona esa imagen para los workers mediante AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Esto no basta para un nuevo worker de código: el bootstrap de OpenCode utiliza npm para instalar su runtime y su plugin fijados, incluso en un repositorio sin dependencias de proyecto. Sin npm, la ejecución se detiene en el bootstrap; la conversación no permite deducir que se haya modificado un archivo del proyecto ni que una prueba haya superado la validación. Utilice una imagen dedicada para workers, construida y verificada por el operador, con Node.js 24, npm, Git y las herramientas necesarias para el proyecto, sobrescribiendo AGENT_RUNNER_SANDBOX_IMAGE en el servicio runner. Mantenga las restricciones de aislamiento. Verifique el bootstrap, la clonación, las pruebas reales y el diff resultante antes de habilitar la delegación de código. Corregir los archivos del runner no proporciona estas herramientas al worker.
