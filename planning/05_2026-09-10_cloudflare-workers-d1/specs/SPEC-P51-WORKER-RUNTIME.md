# P51 — Worker runtime

## Contract

Add the Cloudflare-supported Next 16 Worker adapter path without removing `npm run dev`, `npm run build` or existing Playwright scripts.

## Required work

- Run the adapter compatibility check before initializing it; record exact blockers.
- Pin a framework/adapter combination with compatible peer ranges; upgrade Next only when the adapter requires a compatible patch and re-run the full Next test matrix.
- Add Worker configuration with a `DB` D1 binding, compatibility date and Node-compatibility flag only if a verified retained dependency needs it.
- Worker build must output `.open-next/worker.js` exporting a callable default Worker fetch entrypoint.

## Forbidden zones

- Do not downgrade Next, replace auth, or disable proxy authorization to make the build pass.
- Do not deploy through a personal API token stored in repository files.

## Failure behavior

| Failure | Required action |
|---|---|
| Compatibility check flags unsupported route/dependency | Document and isolate/fix it before adding deployment config |
| Peer version mismatch | Select a compatible patch release, lock it and run local regression gates |
| Worker build missing fetch export | Fix adapter configuration; never package source as a static site |

## Acceptance evidence

- Current compatibility report is saved in the plan decision log/checkpoint.
- `build:worker` succeeds and its bundle contains a callable Worker entrypoint.
