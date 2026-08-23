# License and open core policy

Decision date: August 16, 2026. This document is a product and operating decision; it does not replace legal advice for a particular situation.

## Decision

The `minddy` repository is distributed under **GNU Affero General Public License v3.0 only** (AGPL-3.0-only). This choice replaces the MIT policy for versions released from this decision onwards. Historical copies and contributions also remain subject to their MIT notices and other applicable notices, which are not removed by this change.

We choose AGPL to accommodate contributions and self-hosting while preventing a modified version, offered as a network service, from remaining closed. MIT maximized reuse, but did not protect this goal. The AGPL requires the operator of a modified version to offer its remote users the corresponding source code of this version, under AGPL-3.0.

The term "AGPL-3.0-only" is intentional: no future migration to another version of AGPL is automatic.

## Product and commercial border

There is **no distributed Enterprise edition** or proprietary core-loaded module. Everything needed to install, administer, use, export and scale self-hosted minddy belongs to the AGPL core: web application, API, database schema and migrations, desktop client, published CLI/tooling and operating documentation.

Revenue can come from services that are not a distribution or extension of the core: managed hosting, support/SLA, migration, training and private operations (billing, support, fleet monitoring, service account management). These surfaces must live outside this repository and communicate with the core through documented protocols. They must not contain a function necessary for normal use of the self-hosted edition. Minddy Cloud is one such operated service; self-hosted minddy remains the same public core, not a reduced license tier. See [the edition guide](editions.md).

A future commercial edition can only be decided after a new check of the chain of rights. Without a CLA or assignment explicitly covering the dual license, the rights holders of each contribution concerned will have to authorize this commercial license; the AGPL alone does not allow this.

## Chain of rights and dependencies

The Git inventory as of August 16, 2026 identifies contributions from Clément Guérin, “mangué”, `minddy agent` and `minddy-app[bot]`. Git is an audit trail, not an assignment of rights. The repository therefore keeps a `NOTICE` file with the known attributions and the historical MIT license. Before any publication or re-license presenting exclusive ownership, the maintainer must archive for each external contributor the agreement/contract which confirms the right to contribute under AGPL-3.0-only, or obtain written confirmation. An agent's contributions must be traced to the person or organization that held the instructions and rights to use the AI ​​service.

The lockfile audit mainly lists MIT, Apache-2.0, ISC and BSD; it does not list GPL-2.0-only. MPL-2.0 and LGPL-3.0-or-later dependencies exist (notably in the `sharp` chain) and remain under their own conditions. Project code should neither copy their sources into the core without further review, nor remove their notices. The Inter font file is under SIL OFL-1.1 and keeps its dedicated notice. Any dependencies, assets, fonts, icons or captures added must have an origin and license traced before inclusion.

## Contributions

Contributions are accepted under AGPL-3.0-only, with a **DCO**: each commit must carry `Signed-off-by:` and attest that its author has the right to submit it under this license. No CLA or copyright assignment is required. The DCO does not give the project the right to subsequently offer a proprietary license; it is voluntary and protects contributors.

## Marque

The license relates to copyright and any patents, not to trademarks. Any rights to the name “minddy”, logos and visual identity elements are not granted. A fork can honestly explain its relationship with minddy and maintain necessary attributions, but must not present itself as the official service or use logos in a manner that creates confusion. Any future registered trademarks will be subject to a separate policy.

## Operator and distributor obligations

- A distributor maintains `LICENSE`, `NOTICE` and third party notices, and provides corresponding source code when required by AGPL.
- An operator who modifies minddy and allows users to use it via the network makes available to them the offer to download the corresponding source code, including the scripts necessary to generate, install and run the deployed version.
- An unmodified instance can indicate the commit/tag and the source URL; a modified instance must expose its own source, patches, and build instructions. Mentioning upstream alone is not enough.
- Keys, customer data, production configurations and hosting infrastructure are not part of the corresponding source code and should never be published.

This policy must be reviewed before each modification of the boundary between the core and a commercial area, and each time code or assets from an external source are added.
