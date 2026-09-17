# P114 — Causal AI-native next action

## Contract

Extend existing `planNextLearningAction(userId: string, now?: Date): Promise<LearningDecision>` and shared decision DTO with `p11-v1`/`CausalBasis` from 01-CONTRACTS. Keep `/api/learner/next-action` GET read-only, no provider call; all existing dashboard/debrief/game consumers use that one planner. Do not add another recommendation store or synthetic session.

Decision order remains RESUME → CALIBRATE if no usable evidence → supported recurring-error PRACTICE → DUE_REVIEW → evidence-backed skill COACH/PRACTICE → declared-goal QUEST/MISSION → EMPTY. This preserves existing Plan08 ordering. Each selected EVIDENCE basis cites only owned observations causally supporting that skill/error; exclude unrelated latest refs. A weak aggregate alone is not a cited proof. Due schedule and declared goal use their own non-proficiency basis.

Latest queries remain bounded: max50 per evidence source, max12 refs in DTO, bounded memory/current scenario history. Existing calibration confidence thresholds remain the authority. Low-confidence observations may inform exploration, but cannot generate confident “AI có bằng chứng bạn yếu X” claims. No calibration threshold changed merely to pass fixture.

## Learning continuity and behavior

- BẮT BUỘC keep a single primary CTA to resume or start the selected activity with reason and learner time budget. Existing Mission/Coach/Quest are primary; remediation opens the existing practice resource in context.
- BẮT BUỘC preserve pending session intent and pin valid selected scenario/target; revalidate owner/publication at start. Server resolves time/turn budget, client cannot expand it.
- BẮT BUỘC user may edit intent/choose alternate authored activity; a new goal influences subsequent decisions and context through existing intent revision.
- BẮT BUỘC continuation after successful comeback uses persisted outcome; failure/partial exit preserves uncertainty, explains next practice and never celebrates measured improvement without evidence.
- CẤM translate spelling/text responses into pronunciation/listening proof. CẤM infer long-term mastery from one corrected answer, due review from wrong date, or memory from a different learner.
- CẤM route to catalog-first navigation as the default learning loop or inject a fake chat role as learner memory.

## Error/caller matrix

| State | Caller behavior |
|---|---|
| Empty/uncited source | calibrate/explore with honest reason; no invented refs |
| Unpublished/foreign target at start | typed unavailable, replan through same service; no empty fabricated lesson |
| Corrupt memory | existing bounded validated fallback, content-safe logging |
| Provider unavailable during coaching | show typed unavailable + valid contextual support; no fake AI text/evidence |
| Intent changes during pending start | reconcile existing start first; new intent only after known outcome |

## Evidence and acceptance

Review input: planner currently chooses weakSkill separately from the latest12 refs of any skill. Required fixtures: listening weak + only vocabulary observations never yields listening claim with vocabulary refs; unrelated newer observations cannot displace supporting refs; foreign/stale/malformed refs do not leak; due REVIEW claims only schedule; goal revision changes appropriate scenario/context; owned recurring error → practice → comeback evidence → next action, persisting through reload.

Measure matched refs/total cited refs=100%, foreign refs=0, provider calls/DB writes on planner GET=0 by all-table fingerprint. Real learner efficacy remains P116; UI flow acceptance alone cannot prove transfer.
