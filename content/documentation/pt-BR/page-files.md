---
{
  "id": "page-files",
  "locale": "pt-BR",
  "title": "Anexar e recuperar arquivos de páginas",
  "summary": "Envie um arquivo, verifique o acesso e entenda o que a publicação torna legível.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-file-states.png",
      "alt": "Página de demonstração com um upload incompleto e um arquivo salvo de 67 bytes com a opção Baixar.",
      "caption": "Confira o estado real do arquivo: o segundo anexo está disponível, mas o primeiro upload incompleto não.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-files-steps"
  ]
}
---

## Enviar e verificar um arquivo {#page-files}

Abra a página como membro do projeto e use os controles de anexo ou upload. Selecione um arquivo não vazio dentro do limite de 10 MB por arquivo. A cota de armazenamento da conta ou instância pode impor um limite adicional. Preserve o original até o upload ter êxito.

Imagens podem ser inseridas como blocos de imagem, e outros documentos podem ser anexados como blocos de arquivo. O servidor determina o tipo de mídia armazenado pelos bytes, sem confiar no nome do arquivo ou no rótulo do navegador. A aceitação do upload não garante uma prévia na página para todos os formatos; baixe o arquivo quando não houver prévia.

Confira se o arquivo aparece na página e abra ou baixe. Os bytes ficam no Storage, enquanto os metadados da página e do arquivo determinam o acesso. Salvar a página com sucesso não prova, por si só, que os bytes do arquivo estejam disponíveis.

## Arquivos compartilhados e falhas {#file-access}

Um arquivo referenciado em uma página publicada pode ficar disponível para seus visitantes. Arquivos de páginas fora da ramificação publicada não ganham acesso apenas porque outra página contém uma referência. Revise a página e os descendentes incluídos na publicação antes de compartilhar.

Se o upload falhar, confira tamanho, cota e mensagem de erro. Um operador de instância auto-hospedada também deve verificar configuração e políticas do Storage. Para um arquivo ausente após restauração, recupere os bytes brutos do Storage e os metadados correspondentes; restaurar apenas o banco de dados não recria o arquivo. As URLs de arquivos publicados são assinadas por até 24 horas quando a página é renderizada. Revogar um compartilhamento impede novas visitas autorizadas à página, mas não invalida imediatamente URLs de arquivos já entregues; elas podem continuar utilizáveis até expirar. Cópias baixadas não podem ser recuperadas.


![Página de demonstração com um upload incompleto e um arquivo salvo de 67 bytes com a opção Baixar.](/documentation/pt-BR/page-file-states.png)
