# Testing and acceptance

## Test matrix

| Gate | Local SQLite | Turso staging | Vercel Preview | Vercel production |
|---|---:|---:|---:|---:|
| APP_RUNTIME and Turso configuration fail closed | ✅ | n/a | ✅ branch-scoped Vercel runtime reached the isolated clone | ⬜ |
| Prisma/libSQL local timestamp-format and read-only verifier contract (not imported history) | ✅ | ✅ imported D1 snapshot | read-only clone checks | read |
| Atomic budget, mission, game, and lesson commits | ✅ | bounded remote probe ✅ | ✅ one server-scored adaptive-game answer; full graph remains ⬜ | ⬜ after final explicit enable |
| Existing ownership and validator-leak regressions | ✅ | n/a | validator/evidence path ✅; private-owner path ⬜ | read, then write after final enable |
| Write-mode proxy fence leaves data unchanged | ✅ | n/a | ✅ disabled registration rejected; matching clone row count 0→0 | ⬜ disabled |
| Type-check, unit, lint, Next build, and isolated E2E | ✅ | n/a | ✅ Vercel Ready build of `587641a` | n/a |
| 27-table semantic schema, 48 named indexes, FK/integrity, fingerprint | ✅ synthetic fixture only | ✅ | clone integrity/FK checks ✅; no source-equality claim after disposable writes | ⬜ |
| Fresh auth session after new secret/origin | n/a | n/a | ✅ synthetic registration reached authenticated dashboard | ⬜ |
| Bounded real Kira smoke | n/a | optional | ✅ typed `AI_UNAVAILABLE`; no provider-success claim | ⬜ enabled |
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

- ✅ local — `npm test` 293/293 across 67 files, `npx tsc --noEmit`, `npm run lint` (0 errors / 34 pre-existing warnings), `npm run build`, and isolated `npm run test:e2e` 16/16 passed on 2026-09-12. The migration-verifier contract remains read-only; local fixtures never substitute for imported-history, staging write/read/delete, or hosted proof.
- ✅ Turso staging — the 2026-09-12 import into `listena-staging-20260911` matched the D1 snapshot `C67346700E55D355F2087EBC6A0FB3D461F68B773B8BF5FA9297FCC1D0007557`: 27 application tables, 45 foreign keys, 48 named indexes, semantic/timestamp/core-curriculum fingerprints, `foreign_key_check`, and `integrity_check`. A separate Prisma/raw-libSQL remote write/read/delete probe passed, with a fresh-client absence check and a final read-only verifier pass proving no residue.
- ⬜ Vercel Preview disabled — deployment `ENR7GSojzpCt3ucxnNVus51eZ6AT` is Ready with the branch write fence disabled. A synthetic registration was rejected before persistence and the matching clone row count was 0 both before and after; root/read UI and zero browser-console errors were observed. A full disabled-window fresh-login/read check plus a complete before/after database fingerprint remain open.
- ⬜ Vercel Preview enabled — deployment `7YaMdWP6FqZ9w4G15B7XABP35hgR` proved a disposable fresh registration/dashboard, one server-scored adaptive-game write/evidence, fresh clone readback, and the typed Tutor unavailable path. Hosted duplicate-retry/idempotency and private-owner isolation are still required before this gate can close.
- ⬜ server disabled — user approves final export/cutover; a newly generated final snapshot target, Vercel production Node/read/auth gates, and write fence pass while production remains disabled.
- ⬜ server enabled — a separate explicit approval enables writes and public traffic; first write, persistence, ownership, and provider smoke pass.
- ⬜ rollback — Cloudflare deployment/data retention and lossless-before-enable return path are independently verified; post-enable reconciliation risk is recorded.

## Failure acceptance rules

No test double, unit suite, successful build, static health response, or free-tier account can substitute for imported-data, fresh-authentication, write-fence, or real hosted persistence evidence. No production gate is checked because a database exists. A target that has accepted Turso-only writes is not eligible for an automatic Cloudflare rollback: reconciliation approval is required first.

## Recorded Preview evidence — 2026-09-12

- Enabled only for a bounded test against disposable clone `listena-preview-20260912`: a synthetic account reached the target dashboard, then an adaptive-game answer produced one persisted keyed correct round and one linked server-validator evidence row. Direct clone readback found one profile, six mastery rows, one game run/eight rounds, and one answered round.
- The Tutor UI returned the existing controlled unavailable message. This proves the fail-closed provider path only; it does not prove a successful Kira request or expose a provider configuration value.
- Final Preview deployment `ENR7GSojzpCt3ucxnNVus51eZ6AT` restored `MIGRATION_WRITE_MODE=disabled`. Its synthetic registration probe displayed the fence message and had 0 matching user rows before and after; clone `integrity_check`/`quick_check` were `ok` and `foreign_key_check` had no rows.
- Preview is deployment-protected, so this record does not claim an unauthenticated public `/api/health` response. No Production database, secret, DNS, or traffic setting changed.
