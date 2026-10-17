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
