# Roadmap AI-native

## Đã hoàn tất local
[Plan06](../planning/06_2026-09-10_personalized-ai-learning/plan.md): production now has additive core curriculum recovery, private persisted AI-lesson contracts and server-authoritative adaptive games. Worker `8d50494f-773f-46bb-9910-23c4474d9b4d` is deployed; 204 unit tests/type/lint/build/E2E pass. The final real-provider smoke is waiting only for the account owner to add `OPENAI_API_KEY` as a Worker secret; no live-AI claim is made before then.

[Plan05](../planning/05_2026-09-10_cloudflare-workers-d1/plan.md): deploy OpenNext Next 16.3.3 lên Cloudflare Workers và production D1 `DB`; Auth.js Credentials dùng Worker secret và public `workers.dev` origin. Gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, Worker build, E2E 16/16 và production CSRF/login/session + D1 write smoke. Không seed/import production, không custom domain, không claim live AI/TTS.

[Plan04](../planning/04_2026-09-10_learning-integrity-truth/plan.md): Daily Quest dùng history thật để tránh lặp scenario, complete cần evidence server-owned và debrief phân biệt partial/success, meter learner dùng SkillMastery thay vì profile cũ. Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3 và E2E 16/16 trên DB tạm. Không có schema/deploy/production claim.

[Plan03](../planning/03_2026-09-08_learning-loop-completion/plan.md): hoàn thiện memory transaction, next-action UI, timeline, curriculum và TTS auth. Local gates PASS: 139 unit, type-check, lint 0 error, eval mock 15/15, build, Prisma validate, Python sidecar 3/3 và E2E 15/15 trên DB tạm. Production là kế hoạch hạ tầng riêng trong tương lai, không phải Plan 03 này.

## Ưu tiên tiếp theo
1. Owner installs `OPENAI_API_KEY` as a Worker secret and records one bounded, persisted personalized-lesson smoke; then observe quota/cost/latency before expanding live generation.
2. Pedagogical eval thật: thử nghiệm người học, đo tiến bộ/transfer và efficacy của Coach/Mission/Quest/PRACTICE thay vì số chat.
3. Production operations: D1 backup/export/restore drill, usage quotas/alerting, latency/cost and optional live VieNeu inference/voice speed.
3. Learner memory xuyên phiên mở rộng: mục tiêu dài hạn, sở thích, quyền riêng tư và kiểm thử với người thật.
4. Thiết kế unified evidence contract cho legacy attempt/review/game (không tạo synthetic session); đồng thời audit server-owned game grading, self-service teacher role và transaction legacy.
5. Dọn 37 lint warnings theo gói riêng.

## Idea vault
STT/pronunciation, streaming, nhiệm vụ sinh theo mục tiêu thực, concurrent review schedule, bỏ legacy Kokoro sau quyết định deprecation. Đây là backlog, không phải tính năng đã có.
