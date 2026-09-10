# P62 — Honest live-AI boundary

## Contract

All learner-facing generation uses a single structured provider factory. Its production state is:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=<Cloudflare Worker secret>
OPENAI_MODEL=<non-secret model identifier>
OPENAI_BASE_URL=https://api.openai.com/v1  # optional compatible HTTPS endpoint
```

`OPENAI_API_KEY` MUST be placed with `wrangler secret put OPENAI_API_KEY`; it must never be requested in chat, committed, written to `.env`, logged or copied into `wrangler.jsonc`.

For every provider call, the implementation MUST:

1. supply a purpose-specific strict JSON Schema and a server-side Zod validator;
2. set `store:false`, bounded `max_output_tokens`, a timeout no longer than 20 seconds and at most one caller-visible request per provisioning action;
3. hash a stable user ID before using it as `safety_identifier`;
4. log only provider/model/status/latency/request ID and a non-reversible input hash;
5. raise `AI_UNAVAILABLE` on any failure instead of returning deterministic fallback text.

Deterministic providers MAY be injected by explicit unit/eval tests. They MUST NOT be selected by environment in a deployment or rendered with an "AI live" label.

## Tutor compatibility contract

Existing live tutor calls receive the same `TutorTurnOutputSchema` contract. The orchestrator returns a typed unavailable error when no live provider exists or structured output fails. Learning-session HTTP handlers map it to 503 and avoid writing a fictitious AI turn/evidence. A user may retry manually after the provider recovers.

## Errors and caller response

| Error | Required response |
|---|---|
| provider unconfigured | 503 `AI_UNAVAILABLE` with setup-safe message |
| upstream 401/403 | 503 `AI_UNAVAILABLE`; operator checks hosted secret, never leak status body/key |
| upstream 429 | 503 `AI_RATE_LIMITED` with bounded retry hint; no retry storm |
| upstream/network timeout | 503 `AI_UNAVAILABLE`; preserve prior state |
| invalid schema/output | 503 `AI_UNAVAILABLE`; mark interaction `schemaValid=false` when an interaction record is appropriate |

## Forbidden zone

- Do not keep `MockAIProvider`, beach lesson constants or dataset retrieval fallback in any production AI response path.
- Do not weaken a validation schema or use free-form output to make a provider response appear successful.
- Do not spend the user's key to grade closed game answers or hydrate a page.

## Acceptance evidence

- Fetch-mocked tests verify exact Responses endpoint/body/header safety and validation rejection.
- Missing configuration integration test sees 503, no new tutor turn/lesson and no mock copy.
- After the user configures a hosted secret, a production request produces an `AIInteraction` provenance row that names provider/model but not a secret.
