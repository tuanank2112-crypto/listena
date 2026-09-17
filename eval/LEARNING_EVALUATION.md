# ListenAI — Learning Quality & Pedagogical Evaluation Protocol

This document defines the evaluation methodology, dataset structure, rubric dimensions, and reviewer protocols for ListenAI learning experiences (Mission, Lesson Coach, Daily Quest).

## 1. CLI Entry Point & Modes

In accordance with Plan 11/12 specification:

```bash
npm run eval:learning -- --mode offline|live --dataset <path-to-jsonl> --out-dir <directory> --environment local|preview --max-calls <int> --max-cost-usd <decimal>
```

### Modes:
1. **`offline`** (default):
   - Invokes the deterministic tutor provider contract (`DeterministicMockTutorProvider`).
   - Does NOT incur provider costs or touch live AI credits.
   - Evaluates all schema invariants, turn-by-turn state transitions, scoring boundaries, and prompt safety.
   - Outputs versioned trace JSON and markdown report to `--out-dir`.
   - Never overwrites user report files (`eval/report.md`).

2. **`live`**:
   - Requires explicit positive `--max-calls <int>` and `--max-cost-usd <decimal>`.
   - Requires valid hosted provider credentials authorized by user.
   - Records latency, actual provider/model identifiers, token usage, and produces trace logs for human reviewer scoring.
   - If limits or credentials are missing, exits safely with `UNVERIFIED / REQUIRES_AUTHORIZATION` without unexpected dispatches.

---

## 2. Five-Dimension Reviewer Rubric

Every evaluated turn is assessed across 5 dimensions on a 3-point scale (`0`, `1`, `2`):

| Dimension | 0 (Unacceptable) | 1 (Acceptable / Marginal) | 2 (Target / High Quality) |
|---|---|---|---|
| **1. Correctness** | Factually or grammatically incorrect feedback; hallucinates errors that learner did not make; praises incorrect English as correct. | Mostly accurate; minor stylistic ambiguity in coach message, but core linguistic correction is sound. | 100% accurate grammatical and lexical guidance; precisely targets the learner's error. |
| **2. Level Fit** | Overly complex grammatical jargon beyond A1-B1; vocabulary far too advanced or childish. | Slightly complex or overly simplified phrasing, but comprehensible to the target CEFR level. | Perfect level fit; natural everyday English appropriate for adult Vietnamese learners. |
| **3. Actionable Hint** | Vague criticism ("Try again", "Wrong"); gives full answer directly without Socratic scaffolding. | Gives a helpful hint but slightly too direct or slightly abstract. | Clear Socratic guidance; highlights where to look (e.g. "Hãy thêm trợ động từ quá khứ") enabling self-correction. |
| **4. Contextual Relevance** | Completely ignores conversation context; speaks out of character; fails to respond to learner's question. | Relevant to scenario but feels templated; does not smoothly acknowledge learner's specific wording. | Deeply grounded in scenario and previous turns; builds realistically on learner's input. |
| **5. Learner Retry Support** | Dead-ends the dialogue; punitive tone; discourages further attempts. | Allows retry but lacks encouraging tone or clear next step. | Encourages immediate communicative retry; clearly signals learner's turn to speak. |

---

## 3. Synthetic Dataset Coverage (v1)

The dataset (`eval/learning-cases.v1.jsonl`) contains 12 multi-turn synthetic evaluation cases:
- 4 **MISSION** cases (adversarial prompt injection, alternative natural phrasing, past simple misconception, vague/off-topic response).
- 4 **LESSON_COACH** cases (vocabulary practice, unsupported curriculum bounds, provider unavailable resilience, mid-session goal shift).
- 4 **DAILY_QUEST** cases (topic preference alignment, memory error reuse, zero-evidence early exit, diagnostic introduction).

---

## 4. Acceptance Criteria (DoD)

- **Offline Runner**: 12/12 cases pass structural validation, state progression checks, and invariant constraints.
- **Output Isolation**: Artifacts write strictly to versioned subdirectories in `eval/runs/`, leaving dirty workspace files untouched.
- **Reviewer Governance**: At least 2 human reviewers must independently score live runs; discrepancies >= 1 point trigger consensus review.
