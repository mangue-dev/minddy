# License and public-core policy

Decision date: August 16, 2026. This document records project policy and is not
legal advice for a particular situation.

## Project license

The minddy repository is distributed under the
**GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`). Historical
contributions made under the former MIT policy retain their MIT notices. The
`NOTICE` file preserves that history.

The `only` suffix is intentional: recipients may not automatically choose a
later AGPL version.

## Public core and managed operations

There is no proprietary module required to run self-hosted minddy. The public
core includes the web application, API, schema and migrations, desktop clients,
administration features, export paths, release tooling, and operator
documentation.

Minddy may charge for managed hosting, support, migration, training, and private
service operations. Private operations may include billing, support case data,
fleet monitoring, and service-account administration. They must remain outside
this repository, communicate through documented public interfaces, and must not
be required for a normal self-hosted deployment. See
[editions.md](editions.md).

## Rights inventory

The repository history contains these human or automated identities:

- Clément Guérin and the `mangué` GitHub alias;
- `minddy agent` and `minddy-app[bot]`, operating under maintainer direction;
- Dependabot.

No other human author appears in the publication inventory. This factual
inventory is checked again before a release. Future human contributions require
the DCO sign-off described in `CONTRIBUTING.md`.

The project license does not grant rights to the minddy name or visual identity.
Forks may describe their relationship to minddy accurately but must not imply
official endorsement.

## Dependencies and bundled assets

Dependency licenses are generated from the lockfiles during release validation.
The current inventory is primarily MIT, Apache-2.0, ISC, BSD, MPL-2.0, and
LGPL-3.0-or-later. Their notices and source-availability obligations remain in
force independently of the project's AGPL license.

Bundled asset policy:

- Inter font files retain the SIL Open Font License notice in
  `app/fonts/LICENSE-Inter.txt`.
- minddy logos and icons are maintained by the project copyright holder.
- Product screenshots and capture fixtures are generated from synthetic data.
- Third-party product choices use project-authored neutral pictograms; the
  adjacent product names identify compatibility and do not imply endorsement.
- New fonts, icons, illustrations, captures, or copied code require a recorded
  source and redistribution license before merge.

## Contributions

Contributions are accepted under `AGPL-3.0-only` with a Developer Certificate
of Origin. A `Signed-off-by:` line confirms the contributor's right to submit
the work. It does not assign copyright or grant the project a future
proprietary-license right.

## Operator and distributor obligations

- Keep `LICENSE`, `NOTICE`, and applicable third-party notices with
  distributions.
- Provide corresponding source when the AGPL requires it.
- If a modified version is offered over a network, offer that version's source,
  patches, and build/install scripts to its remote users.
- Do not publish credentials, customer data, production configuration, backups,
  or private service infrastructure as corresponding source.

Review this policy whenever the public/private boundary changes or externally
sourced code or assets are added.
