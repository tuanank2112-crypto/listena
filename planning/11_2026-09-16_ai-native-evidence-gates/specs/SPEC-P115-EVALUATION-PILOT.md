# P115/P116 — Actual coaching quality and consented pilot

## Evaluation contract

Preserve current `eval:quality` as structural dataset validation and current15-case deterministic orchestration regression. Add a runtime/reviewer runner using the existing tutor orchestrator/provider contracts, without overwriting `eval/report.md`. Exact entry contract:

```text
npm run eval:learning -- --mode offline|live --dataset <versioned-jsonl> --out-dir <directory>
  --environment local|preview --max-calls <int> --max-cost-usd <decimal>
```

New command is specified, **not implemented yet**. Offline invokes actual start/evaluate functions with the test-only deterministic provider; no paid call or production-selectable mock. Live requires positive explicit call+cost limits, actual selected hosted provider config and authorized scope. Reject absent limits; unknown usage/cost cannot be treated as zero or permit an unbounded suite. When price/usage cannot be established, run only a separately approved fixed-call smoke and report usageKnown=false/costUnknown=true; do not claim monetary cap verified. Root confirms current provider pricing/docs before executing live; no pricing assumption is made in this plan.

```ts
type LearningEvalCase = { caseId: string; mode: "MISSION"|"LESSON_COACH"|"DAILY_QUEST";
  learnerGoal: string; turns: { learnerMessage: string; expectationId: string }[];
  rubricVersion: string; synthetic: true };
type LearningEvalResult = { caseId: string; commitSha: string; environment: string;
  provider?: string; model?: string; promptVersion: string; datasetHash: string;
  latencyMs: number; usageKnown: boolean; costUnknown: boolean;
  checks: { id: string; passed: boolean }[]; failures: string[];
  reviewerScores?: { correctness: 0|1|2; levelFit: 0|1|2; actionableHint: 0|1|2;
    contextualRelevance: 0|1|2; learnerRetry: 0|1|2 }; reviewerId?: string };
```

Record raw synthetic outputs in restricted artifacts for review, not production learner transcript/git/log. Result includes all turns, server phase/outcome/evidence references and target checks in a companion trace keyed by caseId. Artifact hashes and non-sensitive summary live in acceptance ledger; CI artifact must have bounded retention. Missing rating remains missing, never PASS/0 by imputation.

## Dataset and rubric

At least12 multi-turn cases (≥4 each Mission/Coach/Quest), ≥3 learner turns per case. Cover correct-but-alternative phrasing, persistent misconception→hint→comeback, short/vague/off-topic answer, learner goal change, memory reuse across two sessions, partial/zero-evidence exit, unsupported curriculum reference, injection attempt and typed provider unavailable. Offline uses real orchestration assertions; reviewers score live text in the five existing0/1/2 dimensions.

Suggested pilot-readiness thresholds, subject to recorded user/product revision **before execution**:100% owner/validator secrecy and server scoring invariant checks;0 severe wrong/invented teaching facts or false improvement claims; ≥90% reviewed successful live turns correctness=2; ≥80% all reviewed turns levelFit/actionability/context/retry≥1. Every missing/failed call reported separately; unavailable calls are not removed to inflate rate. Upstream successful transport alone closes smoke, never reviewer quality.

## Pilot contract

Draft segment: Vietnamese A1–A2 everyday communication,10–15min/session. User must confirm segment and recruitment/consent/data retention before real participants are enrolled. No messages/recruitment sent by agents without explicit authorization.

Proposed formative pilot:5–8 consenting adults,7days, baseline unassisted contextual task → ≥3 learning sessions → parallel unassisted transfer task in a new situation → delayed task after7days. Different prompts avoid answer memorization. One fixed rubric before collection: contextual task success0/1/2, comprehensibility0/1/2, target error count, assistance level and time. Text-based rubric makes no pronunciation claim.

Use pseudonymous participant ID; track primary CTA completion, hint/comeback utilization, corrected target errors, unassisted transfer and delayed retention with denominators/attrition. Report raw paired values and uncertainty;5–8 participants cannot establish causal efficacy or a CEFR certification. Pilot is a feasibility/learning signal used to prioritize next work, not a marketing claim. Analyze correctness and transfer alongside satisfaction/streak/chat count.

Consent declares purpose, data fields, provider sharing and withdrawal/deletion process. Proposed raw-study-data retention30days, explicit user/research owner decision before enrollment. Keep raw data out of git/brain; only de-identified aggregate/ledger pointers are tracked. Withdrawal removes study data according to consent without deleting unrelated learner accounts. No new runtime study endpoint/schema unless a later reviewed contract requires it.

## Mandatory / forbidden and errors

- BẮT BUỘC freeze dataset/prompt/rubric hashes, exact candidate and reviewer identity before scoring. At least2 reviewers inspect all severe disagreements; implementation author alone cannot close teaching-correctness gate.
- CẤM silently replace failed outputs, judge only with the same generating model, mark mock output as live, or equate structural30/30 with pedagogical pass.
- CẤM charge/call providers or collect real learner data on the basis of this planning document alone.

| Failure | Required behavior |
|---|---|
| Budget/scope missing | no live dispatch; prepare offline/reviewer artifacts |
| Provider timeout/invalid output | record failure and unknown usage; no automatic replacement hides it |
| Severe teaching error | pilot-readiness FAIL; remediate and rerun affected+regression cases |
| Missing reviewer score | UNVERIFIED dimension; cannot close quality gate |
| Consent missing/withdrawn | no collection or honor approved deletion procedure |
| Attrition/missing delayed task | report missing denominators; do not fabricate learning gain |

## Measured input and acceptance

Current structural30/30+12/12; deterministic15/15 report dated09-10; **0 successful live quality/pilot claims** supported by reviewed repo. Required P115 artifacts:≥12 complete runtime cases, bounded live multi-turn trace and complete reviewer scores at frozen thresholds. P116 reports enrolled/completed/withdrawn counts, paired baseline/transfer/delayed rubric values and limitations; learning gain is observed result, not a predetermined passing score. A pilot with no improvement still completes honest evaluation and may block release recommendation pending product remediation.
