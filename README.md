# minddy

minddy is an open-source issue tracker for small product teams. It keeps the
daily work in one place: projects, issues, objectives, saved views, collaborative
pages, a public feedback board, and an MCP server that lets coding agents work
with the same backlog as the team.

The application is built with Next.js, React, Tailwind CSS, and Supabase. It
also includes an optional macOS desktop shell and integrations for GitHub,
GitLab, Stripe, and OpenRouter.

## Run locally

Requirements: Node.js 24 and pnpm 10 (the versions used by CI), plus a Supabase
project for an interactive application.

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

`.env.example` documents every optional integration and the Supabase dashboard
settings. At minimum, set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for a local
application that can access its data. Never commit `.env` or production
credentials.

The development command builds the agent-VM and page-markdown bundles before
starting Next.js. See [CONTRIBUTING.md](CONTRIBUTING.md) before running code from
an untrusted pull request: dependency installation, tests, and development
commands execute repository code.

## Common commands

```bash
pnpm dev          # run the web app locally
pnpm lint         # lint
pnpm typecheck    # type-check
pnpm test         # run the test suite
pnpm build        # production build
pnpm desktop:dev  # run the optional macOS shell
```

## Architecture and deployment

- **Web app:** Next.js App Router, React, Tailwind CSS, and `mangue-ui`.
- **Data and auth:** Supabase Postgres, Auth, Storage, and Realtime.
- **Agent integration:** OAuth 2.1 MCP endpoint and an optional Vercel Sandbox
  code agent.
- **Deployment:** use the hosting and release process appropriate for your
  instance. `pnpm deploy` is an optional local release helper; adapt its branch
  and hosting conventions to your instance.

The CI workflow is the source of truth for checks. It runs the public-repository
check, lint, typecheck, desktop bundle build, tests, and dependency audit. See
[CONTRIBUTING.md](CONTRIBUTING.md) for contribution and review guidance, and
[SECURITY.md](SECURITY.md) for the security model and vulnerability reporting.

## License

minddy is released under the [GNU AGPL v3.0 only](LICENSE). If you operate a
modified version for users over a network, you must offer those users the
corresponding source code. See the [licensing policy](docs/licensing.md),
including the limits on use of the minddy name and logos.
