---
{
  "id": "workspace-encryption",
  "locale": "pt-BR",
  "title": "Criptografia do espaço de trabalho",
  "summary": "Verifique a criptografia da sua versão e preserve as chaves de recuperação das credenciais e do conteúdo do espaço de trabalho.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "lib/server/encryption/data-policy.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Configurar criptografia e preservar chaves"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/workspace-encryption-flow.svg",
      "alt": "Diagrama: Raiz dedicada fora de PostgreSQL. Chaves projeto, usuário e sistema empacotadas. Decifragem autorizada no servidor. Restaurar banco + Storage + mesmas chaves.",
      "caption": "Estes componentes têm responsabilidades distintas. Raiz dedicada fora de PostgreSQL. Chaves projeto, usuário e sistema empacotadas. Decifragem autorizada no servidor. Restaurar banco + Storage + mesmas chaves.",
      "revision": 3,
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
            "title": "Raiz dedicada fora de PostgreSQL"
          },
          {
            "title": "Chaves projeto, usuário e sistema empacotadas"
          },
          {
            "title": "Decifragem autorizada no servidor"
          },
          {
            "title": "Restaurar banco + Storage + mesmas chaves"
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

## Configurar criptografia e preservar chaves {#workspace-encryption}

As opções --encryption do instalador e do bootstrap descritas aqui pertencem às ferramentas do candidato 0.11.1 identificado. O instalador e o bootstrap publicados na v0.11.0 não as aceitam. O runtime dessa versão reconhece MINDDY_CONTENT_ENCRYPTION_ENABLED; o serviço Compose de referência carrega o arquivo protegido por meio de env_file. Uma alteração explícita da flag exige, portanto, recriar o serviço da aplicação com o mesmo ambiente e verificar o esquema e o comportamento real. Uma chave MINDDY_DATA_ROOT_KEY gerada não comprova que o conteúdo do espaço está criptografado. Use ferramentas e configuração correspondentes, verificadas explicitamente para a versão escolhida, antes de receber usuários ou alterar uma instância existente.

Instalações locais e de servidor novas ativam criptografia por padrão e geram uma MINDDY_DATA_ROOT_KEY dedicada. Um servidor novo pode escolher --encryption enabled ou --encryption disabled. Ambas as escolhas preservam a criptografia de credenciais e geram uma raiz independente: a opção se refere ao conteúdo. Para desktop local, prepare a configuração com o comando abaixo antes de abrir o clone. A raiz aleatória de 32 bytes é representada por exatamente 64 caracteres hexadecimais e fica fora do PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Diagrama: Raiz dedicada fora de PostgreSQL. Chaves projeto, usuário e sistema empacotadas. Decifragem autorizada no servidor. Restaurar banco + Storage + mesmas chaves.](/documentation/pt-BR/workspace-encryption-flow.svg)

## Tratar dados existentes e repetições {#existing-data}

Uma configuração existente sem a flag permanece desativada até uma escolha deliberada. Repetir o instalador preserva flag e raiz; uma escolha contraditória é recusada. Não gere outra chave para reparar uma instância cifrada: recupere a original. Aplique o esquema e a verificação antes de importar dados. A manutenção em lotes converte conteúdos históricos e gira as chaves; a flag não comprova conversão de todas as cópias. Desativá-la não decifra os dados nem permite novas gravações em texto aberto nos escopos protegidos.

## Preservar a recuperação {#recovery}

O servidor decifra para usuários e IA autorizados: é proteção em repouso, sem excluir o operador por criptografia ponta a ponta. Email de login e metadados continuam legíveis; exportações e provedores exigem proteção própria. Preserve as raízes atuais e históricas necessárias aos backups. Cifre e limite o acesso às cópias com ambiente e dados. Teste a restauração de banco e Storage com as chaves correspondentes. Trocar a raiz exige reencapsular chaves offline com as aplicações paradas; apenas substituí-la torna os dados ilegíveis.
