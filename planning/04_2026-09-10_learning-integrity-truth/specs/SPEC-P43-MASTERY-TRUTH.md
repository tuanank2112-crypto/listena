# P43 — Learner-visible mastery uses the adaptive source of truth

## Contract

Every learner-facing listening/vocabulary/spelling meter uses `SkillMastery.masteryScore` when present. The profile columns are a legacy compatibility fallback only.

## Required implementation

- Create a small server-safe resolver, or extend an existing server DTO/service, to avoid independent page-specific precedence rules.
- Dashboard and progress page must use that resolver/data and receive no raw Prisma types in client components.
- Clamp malformed/out-of-range persisted values to `[0,1]` before display.
- Preserve fields unrelated to the meter (streak, minutes, due cards, history and timeline).

## Forbidden area

- MUST NOT start synchronizing profile columns from AI turns in this package; that would retain two competing write sources.
- MUST NOT alter adaptive `SkillMastery` update math or backfill existing user data.
- MUST NOT show an unobserved fallback score as a newly earned achievement.

## Error matrix

| Input | Display behavior |
|---|---|
| matching mastery 0.78 | 78% meter regardless of stale profile 0.50 |
| no mastery row | mapped profile value |
| invalid numeric value | clamped finite [0,1] value; profile/default if unusable |
| unsupported key | stable 0.5 default; not a client exception |

## Acceptance evidence

- Unit tests prove precedence, fallback and clamping.
- Dashboard/progress integration test (or isolated E2E) seeds a divergent profile/mastery pair and asserts displayed meter equals the mastery record.
