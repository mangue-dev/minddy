---
{
  "id": "self-hosted-compatibility",
  "locale": "es",
  "title": "Elegir una versión y un perfil de instalación compatibles",
  "summary": "Utilice una versión inmutable del repositorio público mangue-dev/minddy.",
  "topic": "Administrar una instancia",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/es/self-hosted-compatibility-flow.svg",
      "alt": "Diagrama: Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.",
      "caption": "Siga las etapas en este orden. Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.",
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
    "self-hosted-compatibility-flow"
  ]
}
---
## Elegir una versión y un perfil de instalación compatibles {#self-hosted-compatibility}

Utilice una versión inmutable del repositorio público mangue-dev/minddy. La entrada de compatibilidad de v0.11.0 admite servidores Linux amd64 y arm64, Node.js 24, pnpm 10.28.0, Docker Engine a partir de 27.0.0 y el plugin Compose a partir de 2.29.0. El perfil full fija la distribución oficial de Supabase self-hosted/v0.7.2 en el commit 549db119c44c25167461812041ba198bde2b31a4. Conserve el conjunto completo de imágenes: actualizar un servicio por separado crea una variante bajo la responsabilidad del operador.

El perfil managed utiliza un proyecto Supabase en supabase.com. Ese proyecto debe proporcionar PostgreSQL, Auth, Storage y Realtime y superar la verificación de la versión. PostgreSQL por sí solo no basta. El entorno local de Supabase CLI sirve para desarrollo y evaluación, no para prestar un servicio público en producción.

![Diagrama: Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.](/documentation/es/self-hosted-compatibility-flow.svg)

## Verificar antes de ejecutar {#verify-release}

Verifique la etiqueta anotada, los archivos de la versión, SHA256SUMS y la firma OCI oficial antes de instalar dependencias o ejecutar el código. Los comandos Bash siguientes parten del checkout de la etiqueta elegida y dejan IMAGE definido con el digest verificado. Deténgase si falla cualquier comprobación. Instale primero Cosign siguiendo su documentación oficial. Estas verificaciones confirman la identidad del código y de la imagen; no demuestran que la instalación funcione.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

## Planificar operación y actualizaciones {#support}

Instale una versión publicada cada vez. Las migraciones solo avanzan: para volver a una versión incompatible, restaure juntos la base de datos, Storage, la configuración y la aplicación correspondientes. Minddy mantiene las herramientas de publicación y ofrece ayuda, sin garantía, para diagnosticar defectos reproducibles del núcleo. Usted se encarga de DNS, TLS, capacidad del servidor, copias de seguridad, pruebas de restauración y proveedores opcionales. Una etiqueta de imagen que cambia o un entorno Supabase derivado no heredan el contrato de soporte de la versión.

## Limitaciones conocidas del runner de la versión publicada {#known-runner-limits}

El runner publicado en v0.11.0 presenta otros bloqueos de la ejecución de código: rechaza nombres de sandbox con el sufijo de asignación, escribe bloques base64 demasiado grandes para un único valor de entorno de Linux e inicializa como root un almacenamiento temporal de UID 10001 y modo 0700 después de eliminar todas las capacidades. Esta última orden puede fallar sin que se compruebe su resultado y dejar el directorio de trabajo sin crear. Un endpoint del runner en buen estado no confirma la clonación ni la ejecución de código. El candidato actual corrige estos recorridos; el ensayo aislado utilizó el runner y su helper de almacenamiento actuales mediante montajes explícitos de solo lectura sobre la imagen v0.11.0. Esto no crea una imagen publicada corregida ni una nueva entrada de compatibilidad admitida. Obtenga una combinación corregida de versión y herramientas y compruebe el recorrido de trabajo con código antes de habilitar estos agentes para un equipo.

El relay Git de v0.11.0 también omite el desafío HTTP Basic, lo que impide que un cliente Git habitual envíe sus credenciales. La [solución técnica fijada a un commit](/es/documentacion/install-a-server#runner-workaround) proporciona los archivos correspondientes del runner y sus hashes; no modifica la imagen publicada ni crea una versión compatible.

La imagen publicada de la aplicación incluye Node.js y Git, pero elimina expresamente npm, npx y Corepack. El perfil Compose de referencia también selecciona esa imagen para los workers mediante AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Esto no basta para un nuevo worker de código: el bootstrap de OpenCode utiliza npm para instalar su runtime y su plugin fijados, incluso en un repositorio sin dependencias de proyecto. Sin npm, la ejecución se detiene en el bootstrap; la conversación no permite deducir que se haya modificado un archivo del proyecto ni que una prueba haya superado la validación. Utilice una imagen dedicada para workers, construida y verificada por el operador, con Node.js 24, npm, Git y las herramientas necesarias para el proyecto, sobrescribiendo AGENT_RUNNER_SANDBOX_IMAGE en el servicio runner. Mantenga las restricciones de aislamiento. Verifique el bootstrap, la clonación, las pruebas reales y el diff resultante antes de habilitar la delegación de código. Corregir los archivos del runner no proporciona estas herramientas al worker.

El helper de almacenamiento fijado también permite ejecutar archivos en el directorio de trabajo de la sandbox. De lo contrario, Docker monta este tmpfs con noexec, lo que impide iniciar el binario nativo de OpenCode y puede mostrar un error engañoso del paquete musl utilizado como alternativa. La corrección mantiene nosuid, nodev, los UID/GID 10001, los permisos 0700, el sistema de archivos raíz de solo lectura, las capabilities eliminadas y el almacenamiento desechable de cada sandbox. No permite ejecutar datos del host ni convierte la imagen de la aplicación en una imagen adecuada para workers.
