# P84/P85 — Verification and learning-quality acceptance

Status: local feature gates COMPLETE; hosted/live/pilot gates OPEN. Numbers marked target are proposed acceptance thresholds, not measured learning outcomes. This plan is neither released nor closed.

## Actual baseline

| Date/environment | Command/evidence | Result |
|---|---|---|
| 2026-09-13 local | `npm test` | 387/387; 78 files; fixture provider, no live claim |
| 2026-09-13 local | npm run type-check | exit0 |
| 2026-09-13 local | `npm run lint` | exit0; 34 warnings pre-existing |
| 2026-09-13 local | `npx prisma validate` + `npx prisma generate` | pass |
| 2026-09-13 local | `npm run build` | production build pass |
| 2026-09-13 fresh isolated SQLite sandbox | `npm run test:e2e` | 20/20 pass; temporary DB only |
| 2026-09-13 local/offline | `npm run eval:quality -- --dry-run` | 30/30 cases; 12/12 dataset checks; no live provider claim |
| 2026-09-12 protected Preview, historical | Plan07 acceptance | registration/game bounded evidence + typed AI unavailable; not full hosted acceptance |

Review source was `aa2021d`; local product implementation followed under this package. `eval/report.md` was dirty before review and remains untouched; the new quality runner stores run-specific artifacts instead of overwriting it.

## Gate matrix

| Gate | Required evidence | Local | Preview | Production/pilot |
|---|---|---|---|---|
| Baseline tests/type-check | Commands above | ✅ local | N/A | N/A |
| P81 GET fence | all-app-table read fingerprint;0 mutations | ✅ recommendation GET local | ⬜ | ⬜ smoke |
| P81 account atomicity |8 fault points + same-email race | ✅ local | ⬜ representative fault/concurrency proof | ⬜ non-destructive smoke |
| P81 auth config | synthetic env matrix + fresh HTTPS login | ✅ synthetic local | ⬜ fresh HTTPS | ⬜ |
| P81 start retry |concurrent claim/key replay; lost response/unknown;0 duplicate graph | ✅ local | ⬜ | ⬜ synthetic bounded smoke |
| P82 honest state/intent | unknown/provisional/calibrated; CAS ownership;375/1280px keyboard UI | ✅ local | ⬜ | ⬜ smoke |
| P83 loop |priority branches; adaptive-only; error→retry→evidence→next | ✅ local | ⬜ | ⬜ smoke |
| Regressions | full test/type/lint/build + isolated E2E incl old16 scenarios | ✅ 387/387 + 20/20 | ⬜ hosted critical paths | ⬜ release smoke |
| P84 offline quality | versioned synthetic dataset + deterministic contract checks | ✅ 30/30;12/12 | N/A | N/A |
| P84 live AI | genuine persisted valid opening/repair + scorer evidence, no validator leak | N/A (offline separate) | ⬜ | ⬜ |
| Plan07 cutover/rollback | its complete evidence + explicit authorization | N/A | ⬜ | ⬜ |
| Pedagogical pilot | protocol, consent, paired and delayed results | N/A | N/A | ⬜ pilot |

No P81 fault injection on real users/Production. Synthetic production smoke must be separately scoped, bounded and reversible under OPERATIONS.

## P84 evaluation contract

Keep existing15-case deterministic phase/grounding regression. Add a separate versioned JSONL dataset, at least30 human-reviewed cases covering A1/A2/B1, common Vietnamese-learner errors, legitimate alternative answers, hints/answer leakage, irrelevant/adversarial text, repeated error→comeback, and unavailable provider. Every case stores `{id, level, context, learnerInput, acceptableFeedback, forbiddenFeedback, expectedEvidencePolicy, rubricVersion}`. All data synthetic or consented/de-identified.

Implemented local P84 evidence: the versioned offline JSONL dataset and contract runner completed 30/30 cases with 12/12 dataset checks. This verifies offline deterministic expectations only; it does not score a live model, prove pedagogical quality, consume provider budget or substitute for the live/pilot rows above.

Result contract: `{caseId, mode:"offline"|"live", provider?, model?, promptVersion, datasetHash, latencyMs, usageKnown:boolean, inputTokens?:number, outputTokens?:number, checks, reviewerScores?, failures}`. Do not infer missing token usage/cost as zero. Store new run-specific reports; never silently overwrite user-edited eval/report.md.

Offline checks assert deterministic invariants, not linguistic quality. Live smoke is at most10 approved calls per run; first validate availability/valid output/persistence, then representative rubric cases. Full30-case live evaluation needs explicit budget scope if exceeding the smoke allowance. Reviewer uses0/1/2 for correctness, level-fit, actionable hint, contextual relevance and learner opportunity to retry. Target: ≥90% cases have correctness2, no critical harmful/false grading or answer leakage, and ≥80% total rubric score. Thresholds are release criteria proposed here, not validated psychometric standards. Preserve raw failure counts; no cherry-picked pass subset.

## Pedagogical pilot contract

Proposed feasibility pilot: at least5 consenting learners,7days; short baseline parallel task, immediate post-task and delayed transfer task48–72h later. Record `{pseudonymousLearnerId, consentVersion, taskVersion, timepoint, skill, serverScore, reviewerScore, hintCount, completed}`; keep identifying data separate, allow withdrawal, no raw chats in analytics. Recruitment/consent/data-retention policy must be approved before collecting real data.

Report paired changes, retention/transfer errors, completion/dropout and sample size. No causal efficacy or statistically significant claim from a small uncontrolled pilot. Technical release gate and educational validation remain separate; do not close “fully effective learning product” from technical smoke alone. Pilot acceptance requires reporting negative/zero outcomes too and a documented follow-up decision, not manufacturing positive improvement.

## Errors and required callers

| Failure | Action |
|---|---|
| Assertion/ownership/atomicity failure | Fail WP and release, root returns to owner with repro |
| Live provider unavailable | Record typed outcome; live-success gate stays open |
| Coach target unpublished after provider return | Atomic target fence returns `TARGET_UNAVAILABLE`; record the deferred P2 reservation/billing risk and do not call it live-provider acceptance |
| Invalid/ambiguous rubric label | Human review, version case, rerun affected cases; don't auto-pass |
| Pilot missing consent/delayed data | Stop collection or mark missing; no imputation as success |
| Local pass but hosted unrun | Mark only local; no combined “all green” claim |

BẮT BUỘC artifacts identify exact commit, environment and data source. CẤM test mock selection in production, real DB seed/reset, test-count-as-efficacy or hiding regressions by deleting assertions. Root may mark plan complete only when applicable local, hosted and pilot gates are satisfied; any scope reduction requires a dated superseding decision, not silently unchecked gates.
