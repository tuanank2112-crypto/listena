# Testing and acceptance — Workers + D1

| Gate | Evidence | Local | Server |
|---|---|:---:|:---:|
| Existing unit suite | `npm test`: 152/152 green | ✅ | n/a |
| Type and lint | `npm run type-check` PASS; `npm run lint`: 0 errors/37 existing warnings | ✅ | n/a |
| Standard Next build | contained in `npm run build:worker` | ✅ | n/a |
| Worker compatibility | Vinext 16/18 (Auth.js blocker documented); `npm run build:worker` PASS through OpenNext | ✅ | n/a |
| D1 schema | `0001_initial_schema.sql` (56 commands) applied locally and remotely | ✅ | ✅ |
| D1 learning integrity | local Worker registration; production CSRF/Credentials/session and D1 registration smoke | ✅ | ✅ |
| TTS edge boundary | TTS test suite passes; Worker route has no filesystem cache/import | ✅ | n/a |
| Public deploy | public `workers.dev` URL and authenticated smoke flow | n/a | ✅ |
| Production D1 evidence | exact test accounts removed; remaining test-account count 0 | n/a | ✅ |
| Public release | explicit user selection of Cloudflare Workers + D1 | n/a | ✅ |

## Exit gates

All applicable **local** and **server** cells are ✅. A successful Worker build alone is not a production release; the authenticated D1 smoke test is the server gate.

## Evidence requirements

- Record actual command results, tool deployment status, exact migration names and redacted configuration presence.
- Do not mark the server gate complete from local Miniflare or mock data.
- Preserve Plan04's 152-test baseline and re-run learning-integrity regressions after adapter changes.
- Final results: `npm test` 152/152, isolated SQLite E2E 16/16, eval 15/15, type-check and Prisma validation PASS; no secret literal was found in the built Worker artifact.
