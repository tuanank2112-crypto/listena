# P53 — Edge-safe services

## Contract

Keep learner routes functional when deployed to Workers and degrade optional external services safely.

## Required work

- Split Node file cache code from `/api/tts/vie`; Worker execution performs HTTPS fetch only.
- Enforce explicit timeout/abort for optional TTS and AI fetches, without logging secrets or learner-response bodies.
- Validate required auth/DB configuration at Worker start/request boundary.

## Forbidden zones

- Do not write cache files, open sockets, spawn child processes or depend on the Python TTS container inside the Worker.
- Do not make AI/TTS remote failure mark a learner response correct or complete a session.

## Error classification

| Error | Caller behavior |
|---|---|
| TTS upstream 4xx/5xx/timeout | 503/unavailable response; UI offers browser speech |
| AI upstream failure | existing deterministic/safe tutor fallback; server evidence rules remain enforced |
| Secret absent | feature stays disabled with non-secret diagnostic; deployment fails only for required auth/DB secrets |

## Acceptance evidence

- Worker route module does not bundle `node:fs`.
- Unit tests cover missing TTS configuration and upstream timeout.
- Smoke test confirms non-TTS learning route remains available if TTS is off.
