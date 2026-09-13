# P83 — One next-step planner, contextual remediation

Status: IMPLEMENTED LOCALLY. Addresses F06. Extend existing daily-quest and next-action code, not a separate autonomous agent service. Hosted/live/pilot acceptance remains OPEN.

## Selection contract

`planNextLearningAction(userId, now)` and `LearningDecision` from 01 are implemented. It uses bounded queries: latest50 LearningEvidence and50 AdaptiveEvidence, owned active session, existing due-vocabulary query, latest10 scenario history and current intent/masteries. Ordering is stable by timestamp then ID; references max12. A50-row window is planning context, not lifetime statistics/calibration history.

Priority, first eligible wins:

1. Owned ACTIVE session → RESUME; show its saved goal, do not imply new intent retroactively changed it.
2. No qualifying server-scored evidence → CALIBRATE using eligible practice, labeled “Khởi động để hiểu trình độ”; not “Bạn yếu kỹ năng X”.
3. Recurring error count≥3 with currently owned supporting evidence → PRACTICE/COACH targeting that error.
4. Due vocabulary → REVIEW within time budget; self-ratings stay outside scored calibration.
5. Observed low mastery → COACH/PRACTICE; unknown skills explored deliberately, not ranked as measured weakness.
6. Otherwise QUEST/MISSION aligning saved goal/topic and scenario history; stable tie break uses user/day/decisionVersion. No eligible content → EMPTY with honest explanation.

At step5 rank observed skills by mastery ascending, then evidence recency, then skill key. At step6 topic-matched templates precede unmatched, unseen precede recent within each group; if all repeated, least recent then stable hash. Map current three scenario templates to explicit topic tags before ranking. A free-text goal enriches the grounded coaching prompt but cannot manufacture a relevant catalog match: emit generic goal-practice reason when no tag matches. Only claim preference influenced selection if it actually affected the eligible ranking.

Daily minutes are a planning budget, not a guaranteed duration: estimated5/10/15/20; prompt and task selection cap scope using existing session turn bounds3–20. Implemented turn budgets are5/8/12/16 respectively; the server ends an unfinished cap as `PARTIAL`, rejects later turns, and does not force success or evidence at the budget end.

## Evidence and UI

Learning adapter joins session owner; adaptive adapter uses userId and preserves gradingMethod/confidence. References namespaced, no re-insert and no second mastery update. Recurring-error citations must identify the actual supporting source. No evidence source contract for legacy Attempt/self-rated review is introduced here.

Dashboard and debrief consume the same planner policy (debrief after fresh commit); one primary CTA. Learner may choose another mission or revise intent, but no automatic abandonment of active session. Start uses P81 stable key; typed error preserves draft, respects Retry-After, never opens a fresh session silently.

Contextual repair retains the current intervention server validator: learner attempts → feedback without exposing acceptedAnswers/correctIndex → learner retries → server records one outcome/evidence → refreshed next action. A chat response alone is not completion proof. Preserve `PARTIAL` vs `COMPLETED` and the no-evidence completion rejection.

## Error contract / callers

| Condition | Required behavior |
|---|---|
| Stale/foreign evidence reference | Exclude before response; never cite another learner |
| Target removed/unpublished between plan and start | 404/typed unavailable; refresh decision, preserve intent |
| No matching goal/topic content | Eligible generic task with honest reason; no fabricated alignment |
| Empty catalog | EMPTY, no broken start button or invented lesson |
| AI timeout/rate limit | Draft and start/turn identity preserved; explicit retry, no synthetic coaching |
| Invalid evidence value | Exclude/diagnose, not coerce to success |

## BẮT BUỘC / CẤM / evidence

BẮT BUỘC read-only planner, bounded queries and stable fixture output; published/private rules checked at execution. CẤM score-based recommendation with zero evidence, fork duplicate primary starts, or pretend user goals are system instructions. No new provider calls for deciding navigation.

Local implementation evidence (2026-09-13): the server planner covers active-session resume, no-evidence calibration, owned recurring-error remediation, due review, observed low mastery, topic/history-aware Quest selection and an honest empty/manual path. Dashboard and debrief consume a pinned `scenarioKey`; Games routes the Daily Quest surface through the dashboard planner instead of creating an unpinned Quest. The planner is read-only, Daily Quest selection is deterministic from topic/history, targets are revalidated at execution, and a planner outage exposes an explicit manual Mission choice rather than inventing a Daily Quest. The local suite includes planner/unit/UI coverage and fresh isolated E2E 20/20.

Deferred P2 (not a P0/P1 release blocker): if a Coach target is unpublished after the provider returns but before the atomic graph commit, the provider reservation may already have been spent. The atomic published-target fence returns typed `TARGET_UNAVAILABLE`, preserving data integrity/idempotency; it is not a claim about hosted or live-provider billing behavior.
