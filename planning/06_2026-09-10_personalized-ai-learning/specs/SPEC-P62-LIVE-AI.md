# P62 — Honest live-AI boundary

## Contract

All learner-facing generation uses a single structured provider factory. Its selected next-production configuration is:

```text
AI_PROVIDER=kira
KIRAAI_API_KEY=<Cloudflare Worker secret>
KIRAAI_MODEL=glm-5.3-flash-free
KIRAAI_BASE_URL=https://kiraai.vn/api/v1
```

`KIRAAI_API_KEY` MUST be added through the Cloudflare Dashboard secret UI or a private `wrangler secret put KIRAAI_API_KEY` session; it must never be requested in chat, committed, written to `.env`, logged or copied into `wrangler.jsonc`. The model and base URL are non-secret Worker variables.

Kira's documented API is OpenAI-compatible **Chat Completions**: `POST https://kiraai.vn/api/v1/chat/completions` with a Bearer token. The Kira adapter MUST assemble system/user messages, request JSON-only output, parse `choices[0].message.content`, then pass it through the exact server-side Zod schema before persisting or replying. Kira documentation does not establish OpenAI Responses `text.format` strict schema or `store:false`; the Kira adapter MUST NOT send or claim those controls as if they were guaranteed.

The only accepted Kira base is canonical `https://kiraai.vn/api/v1` (a trailing slash normalizes). HTTP, a different origin/path, user-info, query/fragment and redirects MUST be rejected; a bearer credential must never follow an unexpected endpoint. P65 additionally reserves every real call before transport and bounds shared learner traffic.

OpenAI remains an explicit alternative configuration:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=<Cloudflare Worker secret>
OPENAI_MODEL=<non-secret model identifier>
OPENAI_BASE_URL=https://api.openai.com/v1
```

The OpenAI adapter alone uses `POST /responses`, `text.format` JSON schema with `strict:true`, and `store:false`. It is forbidden to make Kira work by selecting `openai` and pointing `OPENAI_BASE_URL` at Kira.

For every provider call, the implementation MUST:

1. supply a purpose-specific JSON contract and an exact server-side Zod validator; OpenAI additionally supplies its strict upstream JSON Schema;
2. make at most one caller-visible request per provisioning action, bound output tokens and enforce a timeout no longer than 20 seconds; `store:false` applies to the OpenAI Responses request only;
3. never send a raw stable user ID upstream; if a provider supports a safety identifier, hash it before use;
4. log only provider/model/status/latency/request ID and a non-reversible input hash;
5. raise `AI_UNAVAILABLE` for configuration, transport, timeout or invalid-output failure and `AI_RATE_LIMITED` for an upstream 429, instead of returning deterministic fallback text.

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

- Fetch-mocked tests verify the exact selected endpoint/body/header safety and invalid-output rejection: Kira Chat Completions parses and Zod-validates JSON; OpenAI Responses keeps its strict-schema/store controls.
- Missing configuration integration test sees 503, no new tutor turn/lesson and no mock copy.
- After the user configures a hosted secret, a production request produces an `AIInteraction` provenance row that names provider/model but not a secret.
