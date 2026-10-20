---
{
  "id": "repository-skills",
  "locale": "pt-BR",
  "title": "Skills do repositório",
  "summary": "Publique instruções reutilizáveis no repositório vinculado e selecione as skills necessárias ao trabalho.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/assistant/skill-preview-dialog.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Usar skills do repositório"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/repository-skills-workflow.png",
      "alt": "Prévia de uma skill do repositório com nome estável, caminho e instruções completas.",
      "caption": "Leia a skill antes de anexá-la a uma mensagem. Esta skill real de demonstração solicita `npm test` e proíbe o merge da pull request; a prévia não executa nenhuma dessas ações.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        996,
        888
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Disponibilizar a skill {#repository-skills}

O Numo lê `SKILL.md` nas subpastas de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` e `.gemini/skills`, nessa ordem de prioridade. Nome e descrição do frontmatter identificam a skill; scripts e referências podem ficar ao lado.

Faça commit e push dos arquivos no branch padrão do repositório GitHub ou GitLab vinculado; o Numo lê as skills desse branch. Arquivos que existem só no seu computador ou em outro branch não estão disponíveis. A lista atualiza ao abrir a conversa ou mudar seu projeto.

## Selecionar e conferir {#selection}

Use `/`, `$` ou o menu `+` e leia a prévia antes de enviar. Selecione até cinco skills; os selos verdes mostram a seleção. `$` lista apenas skills do repositório, enquanto `/` inclui outros comandos.

A seleção vale para esse turno do usuário. Em rotinas vale para cada execução. Skills são arquivos do repositório, não instalações globais da conta, e não substituem instruções de sistema ou segurança. Para criar ou editar uma, altere os arquivos do repositório você mesmo ou com seu próprio agente de código. Faça push antes de selecionar a nova versão.

![Prévia de uma skill do repositório com nome estável, caminho e instruções completas.](/documentation/pt-BR/repository-skills-workflow.png)
