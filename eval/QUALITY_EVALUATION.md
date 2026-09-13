# P84 quality evaluation (version 1)

`quality-cases.v1.jsonl` is a human-review-ready, synthetic evaluation deck. It is separate from the 15-case deterministic orchestration regression in `cases.jsonl` and does not modify `eval/report.md`.

Every JSONL record has this stable contract:

```text
{ id, level, context, learnerInput, acceptableFeedback, forbiddenFeedback,
  expectedEvidencePolicy, rubricVersion }
```

`context` is structured as `{ scenario, turn, tags }`. The tags make required coverage auditable: A1/A2/B1, Vietnamese-learner transfer errors, legitimate alternatives, hint/answer-leakage boundaries, irrelevant/adversarial input, comeback/retry, and unavailable-provider behavior. All cases are synthetic; do not put personal chat content or direct identifiers in this file.

Run the deterministic contract checker with:

```bash
npm run eval:quality -- --dry-run
npm run eval:quality
```

The normal command writes a new JSON and Markdown artifact under `eval/runs/`, naming its exact commit, environment, dataset hash, prompt-contract version, and data source. It refuses to overwrite an artifact and never writes `eval/report.md`. `--dry-run` checks the same contract without writing files.

The offline check validates data shape, taxonomy, required coverage, evidence-policy compatibility, and duplicate/overlapping criteria. It does **not** call an AI provider, judge linguistic feedback, invent token/cost data, or demonstrate pedagogical efficacy.

For a future bounded live run, preserve the per-case result fields from the Plan08 contract: `caseId`, `mode`, optional `provider`/`model`, `promptVersion`, `datasetHash`, `latencyMs`, `usageKnown`, optional token counts only when the provider returns them, `checks`, optional reviewer scores, and `failures`. Live smoke is capped and must use separately approved provider/budget scope; a full 30-case live run and any learner pilot are not authorized by this offline harness.

Human reviewers score each live response on a 0/1/2 scale for correctness, level fit, actionable hint, contextual relevance, and opportunity for the learner to retry. Do not collapse missing scores into zero or a pass; record them as missing and preserve raw failures.
