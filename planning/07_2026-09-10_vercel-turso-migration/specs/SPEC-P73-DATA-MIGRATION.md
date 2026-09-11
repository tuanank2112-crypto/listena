# P73 — D1 to Turso data migration

## Scope

Create an audited, reversible copy of the current Cloudflare D1 data into a disposable Turso staging database, then separately into a newly created Turso production database. This package does not authorize a write to, reset of, seed against, or schema change on D1.

The production target MUST be generated from a newly taken final D1 snapshot during the approved maintenance window. A green staging database is evidence only; it MUST NOT be promoted or renamed into production.

## Migration authority

The immutable D1 migration chain is the initial imported-schema authority:

1. migrations/0001_initial_schema.sql
2. migrations/0002_personalized_ai_learning.sql
3. migrations/0003_personalized_generation_guards.sql

The local prisma/migrations lineage is for local development and code generation. It MUST NOT be replayed with prisma migrate deploy, prisma db push, reset, or any equivalent command against an imported Turso database. Before the first post-import schema change, a reviewed baseline manifest MUST name one future migration authority, record the hashes of the three D1 migration files, and prove that its semantic schema signature matches the imported database.

## Exact imported-schema contract

The imported snapshot contains exactly these 27 application tables; SQLite internal tables are outside this inventory. Cloudflare D1's engine-owned `d1_migrations` table is also outside the inventory: it records migration metadata rather than product data and might be absent from a database created directly through Prisma/libSQL. This is an exact named exception; every other non-SQLite table MUST remain a blocking surprise-table mismatch.

| # | Table | # | Table | # | Table |
|---:|---|---:|---|---:|---|
| 1 | User | 10 | Attempt | 19 | LearningTurn |
| 2 | LearnerMemory | 11 | AttemptError | 20 | LearningEvidence |
| 3 | LearnerProfile | 12 | VocabularyMastery | 21 | Intervention |
| 4 | Course | 13 | SkillMastery | 22 | PersonalizedLesson |
| 5 | Lesson | 14 | Flashcard | 23 | PersonalizedLessonVocabulary |
| 6 | LessonSegment | 15 | ReviewLog | 24 | PersonalizedLessonAttempt |
| 7 | VocabularyItem | 16 | Recommendation | 25 | AdaptiveGameRun |
| 8 | LessonVocabulary | 17 | AIInteraction | 26 | AdaptiveGameRound |
| 9 | Exercise | 18 | LearningSession | 27 | AdaptiveEvidence |

There is no AIRequestReservation table. AI quota reservations are filtered AIInteraction rows whose purpose is ai_call_reservation; their reservation state is encoded in fallbackReason. A target with a fabricated reservation table is a schema mismatch.

### Semantic schema comparison

The comparison MUST be semantic, not ordinal:

- Compare the exact table-name set and, for every table, a sorted descriptor of column name, declared type, nullability, default, primary-key membership, and foreign-key semantics.
- Compare foreign keys as sorted tuples of child table, child column, parent table, parent column, ON DELETE, and ON UPDATE. The current D1 chain contains 45 declared foreign-key constraints.
- Compare exactly 48 migration-defined named indexes, excluding SQLite-generated sqlite_autoindex entries. For each named index, compare name, uniqueness, ordered key columns or expressions, and any predicate.
- Run PRAGMA foreign_key_check and require zero returned rows. Run PRAGMA integrity_check and require the sole result ok. A quick check is supplementary evidence, not a substitute.
- Do not compare PRAGMA table_info cid values or physical column ordinal. Migration 0002 appended LearnerProfile calibration columns with ALTER TABLE; a Prisma-generated local schema can present a different LearnerProfile column order while preserving the same schema contract.

The exact named-index inventory is:

~~~text
User_email_key
LearnerMemory_userId_key
LearnerProfile_userId_key
Lesson_courseId_idx
Lesson_status_idx
LessonSegment_lessonId_idx
VocabularyItem_lemma_key
Exercise_lessonId_idx
Attempt_userId_lessonId_idx
Attempt_userId_createdAt_idx
AttemptError_attemptId_idx
VocabularyMastery_userId_nextReviewAt_idx
VocabularyMastery_userId_vocabularyItemId_key
SkillMastery_userId_skillKey_idx
SkillMastery_userId_skillKey_key
Flashcard_userId_active_idx
Flashcard_userId_vocabularyItemId_idx
ReviewLog_flashcardId_idx
ReviewLog_userId_reviewedAt_idx
Recommendation_userId_status_idx
Recommendation_userId_generatedAt_idx
Recommendation_userId_lessonId_key
AIInteraction_createdAt_idx
AIInteraction_purpose_success_idx
AIInteraction_sessionId_createdAt_idx
AIInteraction_traceId_idx
LearningSession_userId_status_updatedAt_idx
LearningSession_lessonId_status_idx
LearningTurn_sessionId_createdAt_idx
LearningTurn_sessionId_sequence_key
LearningTurn_sessionId_clientTurnId_key
LearningEvidence_sessionId_createdAt_idx
LearningEvidence_skillKey_createdAt_idx
Intervention_sessionId_status_idx
PersonalizedLesson_userId_status_createdAt_idx
PersonalizedLesson_userId_targetSkill_sourceSnapshotHash_key
PersonalizedLesson_userId_generationKey_key
PersonalizedLessonVocabulary_vocabularyItemId_idx
PersonalizedLessonAttempt_lessonId_clientAttemptId_key
PersonalizedLessonAttempt_userId_lessonId_createdAt_idx
AdaptiveGameRun_userId_status_startedAt_idx
AdaptiveGameRound_runId_position_key
AdaptiveGameRound_runId_clientAnswerId_key
AdaptiveGameRound_vocabularyItemId_idx
AdaptiveEvidence_sourceKind_sourceId_skillKey_key
AdaptiveEvidence_userId_skillKey_createdAt_idx
AdaptiveEvidence_userId_vocabularyItemId_createdAt_idx
AIInteraction_userId_purpose_createdAt_idx
~~~

## Fingerprint contract

The source and target fingerprint MUST record, without exporting learner content, passwords, tokens, validators, prompts, or session values:

- a count for each of the 27 tables;
- deterministic per-table primary-key digests where practical, plus approved aggregate and relationship checks;
- the semantic schema and named-index signatures above;
- foreign-key and integrity results;
- per timestamp column: null count, SQLite storage-class histogram, minimum, maximum, and canonical UTC bucket histogram. The source and target histogram reports MUST be compared, not merely sampled;
- a new-write/read proof through the Prisma Turso adapter. In staging only, write a disposable, known-UTC probe using Prisma, obtain it through a fresh Prisma client and a raw libSQL read, prove the same logical timestamp and supported storage representation, then delete the probe. This proves future Prisma writes as well as imported historical rows.

The core curriculum has stable checks in addition to ordinary table counts:

- Course 464c2a28-e631-4c2e-80b4-a6e5f5cefcbf exists and remains owned by the system curriculum user aed67c1c-b8e4-4ffc-806e-25c65d860c09.
- The system owner remains the non-loginable system-curriculum@listena.invalid ADMIN account; no password material is included in a fingerprint.
- The imported curriculum retains 5 lessons, 116 `LessonVocabulary` joins scoped to the core course representing 116 distinct vocabulary IDs, 20 `LessonSegment` rows, and 54 `Exercise` rows. The global `VocabularyItem` count is source-to-target table-count evidence, not a fixed core-curriculum invariant.

## Offline verifier contract

`npm run migration:verify -- --source-url <file:|libsql:|https:> --target-url <file:|libsql:|https:>` runs `scripts/verify-turso-migration.ts`. Prefer the scoped `MIGRATION_SOURCE_DATABASE_URL`, `MIGRATION_TARGET_DATABASE_URL`, and matching `*_AUTH_TOKEN` environment variables so credentials do not enter shell history.

- The verifier is read-only by default. It compares the 27-table inventory, semantic columns, 45 foreign keys, 48 named indexes, integrity checks, row counts, redacted primary-key hashes, timestamps, and the core-course relation checks.
- It MUST NOT export/import, seed, migrate, reset, provision Turso, deploy Vercel, change DNS, or mutate D1.
- The verifier has no write mode and MUST reject legacy probe-activation flags. A generic URL cannot safely prove a remote database is staging rather than production.
- The required staging-only Prisma/raw-libSQL write-read-delete proof is a separate, recorded operator procedure after independently verifying the target database identity and receiving its own approval. It is never run against production.
- A successful report does not prove the export fence, export/import operation, target identity, provider account state, Vercel behavior, or the separate staging write/read/delete proof. Run it inside the approved export fence and retain the redacted pre/post source reports.

## Required sequence

1. Generate source semantic-schema, count, aggregate, primary-key, timestamp, and core-curriculum fingerprints using read-only queries.
2. Rehearse export and import only into a new, disposable Turso staging database. Keep the export artifact outside the repository in an access-restricted temporary location.
3. Validate the complete P73 fingerprint, 48 named indexes, all foreign keys, and the staging-only Prisma timestamp write/read proof. Destroy only a failed staging target.
4. Obtain explicit approval for a production maintenance window. Put the existing Cloudflare application into verified mutation-disabled maintenance state before the final export.
5. Establish the D1 export fence: the only permitted D1 operations during the window are read-only fingerprints and the final export. No deployment, seed, import, migration, D1 execute file, or application mutation may run against the source. Capture matching pre-export and post-export source fingerprints; any drift invalidates the export.
6. Create a fresh Turso production database after the final source snapshot, import that snapshot once, and repeat every P73 schema and data verification. Do not reuse the staging database.
7. Hand the exact verified production target to the P74 Vercel mutation-disabled acceptance window. Do not enable target writes or public traffic from this package.

## Forbidden zones

- Do not run prisma migrate deploy, prisma db push, db reset, prisma seed, D1 seed, or curriculum import against an imported target.
- Do not copy Cloudflare secrets, session-signing secrets, access tokens, passwords, prompts, or opaque values into an export, report, command history, or repository.
- Do not dual-write, replicate live, write back from Turso to D1, or treat AI reservations as a separate table.
- Do not accept a schema because its columns happen to be in the same ordinal positions; use the semantic comparison contract.
- Do not promote a staging database to production or take a production snapshot before the read-only D1 export fence is active.

## Failure classification

| Failure | Required behavior |
|---|---|
| export incomplete, unreadable, or source fingerprint drift | block import and cutover; retain D1, discard only the incomplete target artifact |
| table, semantic-column, foreign-key, or 48-index mismatch | block staging and production; diagnose the migration authority before retry |
| PRAGMA foreign_key_check rows or integrity_check other than ok | block target use; do not repair source data in place |
| count, aggregate, primary-key, core-curriculum, or timestamp-histogram mismatch | block target use; record a redacted diff and require a reviewed conversion or export fix |
| Prisma new-write/read timestamp proof fails | block staging and production; do not coerce timestamps ad hoc |
| maintenance/export fence cannot be verified | leave Cloudflare live and writable; do not create a production target |
| staging target fails | destroy only that staging target; never modify D1 |

## Acceptance evidence

- A redacted source/target report proves all 27 tables, 48 named indexes, all foreign-key checks, and integrity_check.
- Reports contain matching source/target timestamp histograms; a separate recorded staging-only procedure supplies the Prisma new-write/read/delete proof after target identity verification.
- The core course, system owner, and 5/116/20/54 curriculum checks are present alongside the live migration-time counts.
- The production report records a fresh final export identifier and a different target database identifier from staging.
- No report, patch, artifact path, log, or command output contains a secret or learner-private content.
