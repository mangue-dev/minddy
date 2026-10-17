# MIN-717 Smart Fill relations: evaluation (2026-10-17)

This records the measured precision, direction accuracy, latency and cost of
the relation pass. The figures come from runs on a fixed corpus; nothing here
is estimated. The harness is
`lib/server/issue-relation-eval.integration.test.ts`. It is opt-in and spends a
few cents per run against the real providers. It writes nothing to the
database: the usage ledger is captured in memory, and configuration falls back
to the registry defaults.

```bash
MINDDY_RELATION_EVAL=true MINDDY_EDITION=cloud MINDDY_MANAGED_AI=1 \
  OPENROUTER_API_KEY=… npx vitest run lib/server/issue-relation-eval.integration.test.ts
```

Add `MINDDY_RELATION_EVAL_ENGINE=llm` to turn the decision model off and
measure the LLM fallback on its own.

## Corpus

The corpus has 12 existing issues and 10 new issues. Each new issue declares
the relation it should get from its own side; every other pair must get none.

- Paraphrased positives: "Charts unreadable in dark theme" against "Dark mode
  for the dashboard", and an Android crash written two different ways.
- Explicit dependencies in both directions:
  - SAML SSO is blocked by the OIDC migration.
  - A color audit blocks the design-token work.
  - pgvector is blocked by the Postgres upgrade.
- Multilingual pairs: a French invoice export against an English CSV export,
  and an English logo bug against a French PDF invoice issue.
- Topical negatives: API key rotation against API rate limiting, webhook
  retries against the webhook payload format, and a visual-only search
  redesign.

Retrieval used the production code: the same embedding text, the same
similarity floor of 0.35, at most 5 candidates, and one decision call per new
issue through `runDecision` and `relationVerdicts`.

## Results

Both engines produced identical verdicts.

| Engine | Proposed | Exact | Precision | Recall | False positives | Mean decision latency | Decision cost (9 calls) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Decision model (`typesafe/jev-1.13`) | 7 | 7 | 1.00 | 1.00 | 0 | 353 ms | $0.000237 |
| LLM fallback only (`deepseek/deepseek-v4-flash`) | 7 | 7 | 1.00 | 1.00 | 0 | 1,910 ms | $0.000924 |

- **Direction:** all three dependencies came out with the correct direction
  on both engines.
- **Multilingual:** both French/English pairs were linked as related. The
  sibling invoice issue retrieved alongside them (similarity 0.38 to 0.50) was
  correctly judged as no relation.
- **Topical negatives:** the negatives were retrieved at similarities of 0.42
  and 0.44 and judged as no relation. This confirms that similarity alone would
  have produced false links.
- **No candidate:** the visual-only search redesign had no candidate at or
  above 0.35, so no decision call was made and nothing was charged.
- **Embeddings:** `openai/text-embedding-3-small` at 1,536 dimensions. One
  batch of 22 texts cost $0.0000106 and took 1.4 to 2.2 s.

Per new or edited issue, the expected cost is about $0.0000005 for the
embedding plus about $0.000026 for a decision-model call, or about $0.0001 when
the LLM fallback answers. A pass with no candidate costs only the embedding.
Every charge is recorded under the payer's usage:

- `issue_embedding` for the embeddings
- `jev_decision` for the decision model
- `issue_relation` for the LLM fallback

## Limits

- The corpus is small and written for the test. The results show the pass
  behaves conservatively on clear cases. They do not establish precision on
  real project histories, where near-duplicates and vague issues are more
  common.
- Latency was measured from a workstation, not from a Vercel function.
- Retrieval scans and decrypts a project's vectors in the server, the same
  approach as feedback search. Its latency on large projects still has to be
  measured on staging before rollout.

## MIN-718: hybrid issue search (2026-10-17)

The second case of the same harness (`-t "hybrid issue search"`) uses the same
corpus of 12 issues. It runs 9 queries that describe one issue without reusing
its words, some of them in French, German or Spanish, plus 2 off-topic
queries. The text-only baseline is the substring match the pickers and
`searchIssues` used before this change. The hybrid order is text matches
first, then meaning matches not already shown, which is what the pickers
display.

| Measure | Value |
| --- | --- |
| Text only: intended issue first | 0 / 9 |
| Hybrid: intended issue first | 9 / 9 |
| Hybrid: intended issue in the top 5 | 9 / 9 |
| Off-topic queries with any meaning match (floor 0.3) | 0 / 2 |
| Mean query embedding latency (workstation) | 742 ms |
| Cost of 11 query embeddings | $0.0000015 |

The intended issue scored between 0.37 and 0.73 in cosine similarity. The best
wrong candidate scored at most 0.39 for a positive query, and no candidate
reached 0.3 for an off-topic query.

**What a person sees.** Text results appear at once. Results by meaning
follow about 0.35 s of debounce plus the embedding call: 0.4 to 1.1 s here,
and none at all for a repeated query, which the per-user cache answers. The
server-side decryption and ranking of a project's vectors was not timed on
production-sized data; it still has to be measured on staging, like the
relation pass.

**Limits.**
- Issues that are not indexed are reachable by text only. That covers issues
  whose author turned indexing off, and issues waiting for the backfill or for
  reindexing after a model change.
- Queries shorter than two words, or a single word of fewer than six letters,
  never leave the browser.
- Identifiers are always answered by text.
