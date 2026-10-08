---
{
  "id": "repository-skills",
  "locale": "pt-BR",
  "title": "Usar skills do repositório",
  "summary": "Publicar instruções reutilizáveis no repositório vinculado e selecionar as necessárias.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "N07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx",
      "content/documentation/reviews/repository-skill-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [
    "repository-skills"
  ],
  "tags": [],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/repository-skills-workflow.png",
      "alt": "Prévia de uma skill do repositório com nome estável, caminho e instruções completas.",
      "caption": "Leia a skill antes de anexá-la a uma mensagem. Esta skill real de demonstração solicita npm test e proíbe o merge da pull request; a prévia não executa nenhuma dessas ações.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        920
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Disponibilizar a skill {#repository-skills}
O Numo lê `SKILL.md` nas subpastas de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` e `.gemini/skills`, nessa ordem de prioridade. Nome e descrição do frontmatter identificam a skill; scripts e referências podem ficar ao lado.

Faça commit e push dos arquivos no repositório GitHub ou GitLab vinculado. Escolha a referência adequada quando necessário. Arquivos somente locais não estão disponíveis. A lista atualiza ao abrir a conversa ou mudar seu projeto.

## Selecionar e conferir {#selection}
Use `/`, `$` ou o menu `+` e leia a prévia antes de enviar. Selecione até cinco skills; os selos verdes mostram a seleção. `$` lista apenas skills do repositório, enquanto `/` inclui outros comandos.

A seleção vale para esse turno do usuário. Em rotinas vale para cada execução. Skills são arquivos do repositório, não instalações globais da conta, e não substituem instruções de sistema ou segurança. Para criar ou editar uma, altere os arquivos ou peça ao Numo para delegar esse trabalho. Faça push antes de selecionar a nova versão.

![Prévia de uma skill do repositório com nome estável, caminho e instruções completas.](/documentation/pt-BR/repository-skills-workflow.png)
