# P82 — Intent and honest learner state

Status: IMPLEMENTED LOCALLY. Addresses F05/F07. Reuse current LearnerMemory/LearnerProfile/calibration; do not create a competing profile system. Preview/Production and pilot confirmation remain OPEN.

## Contracts

GET/PUT learner intent and `SkillObservation` are implemented as specified in 01-CONTRACTS. Goal entry is optional and editable; default10-minute session. A skipped onboarding still enters a short eligible task. Never block all learning behind a long placement questionnaire.

`resolveSkillObservation({skillKey, masteryScore, evidenceCount, calibrationStatus}): SkillObservation`: evidenceCount0 → score null/status UNKNOWN regardless prior0.5; positive evidence with valid finite score → PROVISIONAL unless existing calibrationStatus is CALIBRATED; invalid score → score null/UNKNOWN with opaque diagnostic. UI calls the score an estimate for that skill, not a universal proficiency percent. Overall calibration cannot make an unobserved skill “known”.

Existing `assessCalibration` thresholds stay unchanged: confidence≥0.75, at least2 distinct skills; <8 qualifying observations does not promote; 8–11 calibrating; ≥12 may calibrate. These are internal heuristics, not validated CEFR certification. Planner adaptation can use provisional evidence but must disclose limited evidence in its reason. P83 read adapters do not silently change which evidence is eligible for the existing calibration writer.

Dashboard: remove the composite “Năng lực” percentage when it implies measured overall ability; show skill estimates + status/evidence counts. The existing four-attempt strip must be labeled “Bài luyện gần đây”, count0–4, not “Lượt học”. Do not add a fabricated all-activity count. Preserve timeline and server-computed study-time behavior.

## Memory / privacy

BẮT BUỘC reserve the three intent preference keys within parser's24-entry limit; preserve all other valid memory keys. If the bound would be exceeded, return409 INTENT_CAPACITY, do not silently discard learned context. Explicit goal/topic clearing must work; goal null is user intent, not an inferred learning failure. Prompt injection in goal text is untrusted data; never instructions to disclose secrets/change grading. Do not copy goal text into logs or analytics.

## Errors and callers

| Class | Caller behavior |
|---|---|
| Invalid goal/topics/minutes | 400 inline error, keep typed values |
| Snapshot conflict/capacity | 409 reload canonical context; no silent overwrite/drop |
| Corrupt existing memory | Parse bounded safe defaults with diagnostics; conditional write preserves untouched raw fields; no automatic repair of evidence history |
| Missing evidence | Normal UNKNOWN state, not system error or 0% ability |
| Save unavailable/disabled | Keep draft, explain unsaved state; continue only with previously saved/default intent |

## Vùng cấm và nghiệm thu

CẤM let client write mastery/calibration/CEFR. CẤM reconstruct scores from chat count, streak or user-selected level. CẤM overwrite inferred goals/errors/skills when saving declared intent.

Local implementation evidence (2026-09-13): intent parsing/validation, preference preservation and CAS conflict handling are covered in the learner-intent tests; `resolveSkillObservation` returns UNKNOWN rather than a fabricated 50% for zero/invalid evidence; and the dashboard labels the bounded activity strip truthfully. Isolated Playwright E2E asserts keyboard use and no horizontal overflow at 375px and 1280px. These tests are included in the 387/387 unit suite and 20/20 fresh SQLite E2E acceptance.

The result is local only. It does not demonstrate a hosted browser, Vercel/Turso persistence, a live provider, learner outcomes or a consented pilot. Those gates remain in TESTING-ACCEPTANCE.
