# P104 — Security responses, abuse controls and TTS truth

## Objective

Close the evidenced response/logging gaps, make VieNeu semantics honest and reproducible, and define the hosted abuse gate required before public writes are enabled.

## API and logging contract

Attempt, flashcard, authoring and generic internal failures return typed opaque responses from `01-CONTRACTS`; no route returns arbitrary `error.message`. Ownership errors use the route's documented 403/404 behavior.

Logger redaction must include nested and wildcard paths. Error logging uses `{ errorName, code, requestId, resourceId }`, not `{ error }`/`{ err }` for arbitrary Error objects. Tests inject strings shaped like secrets, URLs, answers, feedback and tokens and assert they are absent from serialized logs/responses.

Add defense-in-depth response headers through `next.config.ts` only after local Next 16.3.x documentation is re-read:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying unused camera/geolocation/microphone (microphone remains denied until a separate pronunciation feature exists)
- frame protection via CSP `frame-ancestors 'none'` or compatible `X-Frame-Options: DENY`

A full script/style CSP is out of scope unless nonce/build behavior is proven; do not ship a breaking placeholder CSP.

## TTS contract

FastAPI and Next schemas must agree:

```py
class TTSRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    voice: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] = None
    speed: Literal[1.0] = 1.0
```

Until VieNeu 3.3.0 speed semantics are verified in a real model test, any non-1 speed is rejected with field-safe 422/400 and UI must not imply adjustable server voice speed. If future support is proven, `speed` becomes part of `_cache_key(text, voice, speed)` before enabling it.

Sidecar must return opaque synthesis failure, never `str(e)`. All audio responses are `private, no-store`; sidecar binds to a private/loopback network in supported operations. Runtime requirements are exact-pinned for Python 3.11, and test-only packages are declared separately so `python -m pytest tts-service -q` is reproducible without model download/warm-up.

## Hosted abuse gate

Plan10 code does not store raw IP addresses. Before Plan07 write-enable, project owner configures the single Hobby-compatible Vercel WAF fixed-window rule and records its version/rollback:

- methods: unsafe account/auth/resource methods;
- paths: registration, Auth.js credential endpoints, account verification/reset, feedback, TTS, tutor and teacher generation;
- initial bounded threshold: 10 requests per 60 seconds per IP/JA4 for the sensitive-path group;
- first deploy action: log/observe on disposable Preview, then 429 enforcement after confirming normal login/verification flows;
- rollback: restore prior firewall version, independent of database rollback.

Route-level account token cooldown and AI/game budgets remain; WAF does not replace them. Threshold changes require recorded traffic evidence. Hosted configuration belongs to Plan07/09 approval windows and cannot be applied by a local worker without authority.

## Forbidden zone

- CẤM log raw IP, action token, email body/feedback body, learner answer/question or secret.
- CẤM add a DB write to Auth.js login while `MIGRATION_WRITE_MODE=disabled`; that would break Plan07 read-only semantics.
- CẤM expose the TTS sidecar publicly with only a shared key as the sole abuse control.
- CẤM claim WAF configured from a code test or documentation screenshot.
- CẤM add microphone permission or pronunciation scoring in this plan.

## Error matrix

| Error | Required response/action |
|---|---|
| WAF limit | hosted 429; no function/provider/database work; retry after window |
| Account cooldown | existing uniform 202 for non-enumerating request endpoints |
| TTS invalid speed/input | 400/422 field-safe; no model/cache work |
| Sidecar unavailable/timeout | Next returns generic 502/503; browser may use WebSpeech fallback |
| Internal synthesis error | opaque 500/502; typed server log without exception text/content |
| Security header breaks auth/assets | block P106 acceptance; revert header change, not auth security |

## Acceptance evidence

- Secret-canary response/log tests and tracked-file secret scan pass.
- Sidecar tests run in a clean Python 3.11 environment without model warm-up; wrong/missing key, bounds, speed, cache and opaque errors are asserted.
- Browser smoke proves auth, static assets, TTS fallback and navigation under new headers.
- Preview-only WAF evidence records rule ID/version, request/status counts and rollback; no IP values or secret contents are copied into repo.

