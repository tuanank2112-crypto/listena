# Testing and acceptance

## Test matrix

| Gate | Local SQLite | Turso staging | Vercel Preview | Vercel production |
|---|---:|---:|---:|---:|
| APP_RUNTIME and Turso configuration fail closed | ✅ | n/a | ⬜ | ⬜ |
| Prisma/libSQL local timestamp-format and read-only verifier contract (not imported history) | ✅ | ⬜ | read | read |
| Atomic budget, mission, game, and lesson commits | ✅ | ⬜ | ⬜ after explicit enable | ⬜ after final explicit enable |
| Existing ownership and validator-leak regressions | ✅ | ⬜ | read, then write after explicit enable | read, then write after final enable |
| Write-mode proxy fence leaves data unchanged | ✅ | ⬜ | ⬜ disabled | ⬜ disabled |
| Type-check, unit, lint, Next build, and isolated E2E | ✅ | n/a | build | n/a |
| 27-table semantic schema, 48 named indexes, FK/integrity, fingerprint | ✅ synthetic fixture only | ⬜ | n/a | ⬜ |
| Fresh auth session after new secret/origin | n/a | n/a | ⬜ | ⬜ |
| Bounded real Kira smoke | n/a | optional | ⬜ enabled | ⬜ enabled |
| Cloudflare rollback state | n/a | n/a | ⬜ before enable | ⬜ before and reconciliation-aware after enable |

## Mandatory test cases

1. APP_RUNTIME=vercel with no Turso variables fails with DATABASE_CONFIGURATION_MISSING before database construction. This must hold even if VERCEL or VERCEL_ENV is absent.
2. Exactly one Turso variable, an invalid endpoint, or an invalid write-mode value fails before a network/database operation and exposes no configuration value.
3. With MIGRATION_WRITE_MODE=disabled, unsafe /api methods are blocked before database work; /api/register remains blocked, the narrow /api/auth/ login exception works, and a before/after fingerprint is unchanged.
4. With a recorded staging-only change to enabled, the normal server-authoritative mutation paths work and a repeated clientTurnId, clientAnswerId, generation key, or request ID leaves exactly one committed outcome.
5. An atomic libSQL batch rolls back an earlier insert when a later statement fails.
6. A browser payload containing correct: true cannot change mastery without server-owned validator evidence.
7. A staging and final-production import each prove all 27 named application tables, exactly 48 migration-defined named indexes, semantic columns/FKs independent of ordinal, PRAGMA foreign_key_check with no rows, and PRAGMA integrity_check equal to ok.
8. The source and target report matching per-timestamp-column storage-class, null, min/max, and canonical UTC histogram evidence. A disposable staging Prisma write is read again through a fresh Prisma client and raw libSQL before deletion.
9. The stable curriculum check proves Course 464c2a28-e631-4c2e-80b4-a6e5f5cefcbf, its non-loginable system owner, and the 5 lessons, 116 core-course `LessonVocabulary` joins representing 116 distinct vocabulary IDs, 20 segments, and 54 exercises; global `VocabularyItem` count remains a source-to-target fingerprint count. All live user/evidence counts are compared at migration time.
10. Vercel Preview uses Node for Auth.js, Prisma/libSQL, and Kira; a fresh target-origin session works, while a Cloudflare-origin session is expected to require reauthentication because the target uses a fresh auth secret.
11. A real provider failure is typed unavailable/rate-limited and contains no secret or token in body or logs.
12. Before production target writes are enabled, Cloudflare rollback is lossless. After Turso accepts writes, a rollback is blocked pending an explicit reconciliation/data-loss decision.

## Exit gates

- ✅ local — `npm test` 286/286 across 66 files, `npx tsc --noEmit`, `npm run lint` (0 errors / 34 pre-existing warnings), `npm run build`, and isolated `npm run test:e2e` 16/16 passed on 2026-09-11 after P71/P72. The P73 verifier's 8/8 local fixture tests prove its read-only boundary; this is not an imported-history, staging write/read/delete, or hosted proof.
- ✅ Turso staging — the 2026-09-12 import into `listena-staging-20260911` matched the D1 snapshot `C67346700E55D355F2087EBC6A0FB3D461F68B773B8BF5FA9297FCC1D0007557`: 27 application tables, 45 foreign keys, 48 named indexes, semantic/timestamp/core-curriculum fingerprints, `foreign_key_check`, and `integrity_check`. A separate Prisma/raw-libSQL remote write/read/delete probe passed, with a fresh-client absence check and a final read-only verifier pass proving no residue.
- ⬜ Vercel Preview disabled — APP_RUNTIME=vercel, Node build, fresh login/read paths, and mutation fence pass with an unchanged staging fingerprint.
- ⬜ Vercel Preview enabled — a recorded explicit write enable proves bounded persistence, ownership, idempotency, and AI behavior on staging.
- ⬜ server disabled — user approves final export/cutover; a newly generated final snapshot target, Vercel production Node/read/auth gates, and write fence pass while production remains disabled.
- ⬜ server enabled — a separate explicit approval enables writes and public traffic; first write, persistence, ownership, and provider smoke pass.
- ⬜ rollback — Cloudflare deployment/data retention and lossless-before-enable return path are independently verified; post-enable reconciliation risk is recorded.

## Failure acceptance rules

No test double, unit suite, successful build, static health response, or free-tier account can substitute for imported-data, fresh-authentication, write-fence, or real hosted persistence evidence. No production gate is checked because a database exists. A target that has accepted Turso-only writes is not eligible for an automatic Cloudflare rollback: reconciliation approval is required first.
