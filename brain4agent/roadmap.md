# Roadmap AI-native

## Đang thực hiện — staging + bounded Preview evidence
[Plan07](../planning/07_2026-09-10_vercel-turso-migration/plan.md): thay thế mục tiêu hạ tầng bằng Next.js Node trên Vercel + Turso/libSQL. P71/P72/P73 hiện có 293 unit tests/67 files, type-check, lint 0 errors/34 pre-existing warnings, standard Next build, E2E 16/16, canonical Turso staging verification và bounded Vercel Preview proof trên clone riêng. Preview chứng minh registration/dashboard, một game evidence write/readback, Tutor typed-unavailable và final write fence; chưa có hosted duplicate retry/private-owner proof đầy đủ, final D1 export, Production, DNS/traffic cutover, rollback drill hay successful live Kira smoke. Cloudflare Worker + D1 đang triển khai được giữ làm rollback asset.

## Đã hoàn tất local
[Plan06](../planning/06_2026-09-10_personalized-ai-learning/plan.md): production now has additive core curriculum recovery, private persisted AI-lesson contracts and server-authoritative adaptive games. Worker `ee5de83a-c2a9-45e3-996a-e624072bb250` deploys the Kira Chat Completions adapter plus P65 D1/resource guards; secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b` adds the opaque Kira binding. The final real-provider smoke remains pending; no live-AI claim is made before then.

[Plan05](../planning/05_2026-09-10_cloudflare-workers-d1/plan.md): deploy OpenNext Next 16.3.3 lên Cloudflare Workers và production D1 `DB`; Auth.js Credentials dùng Worker secret và public `workers.dev` origin. Gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, Worker build, E2E 16/16 và production CSRF/login/session + D1 write smoke. Không seed/import production, không custom domain, không claim live AI/TTS.

[Plan04](../planning/04_2026-09-10_learning-integrity-truth/plan.md): Daily Quest dùng history thật để tránh lặp scenario, complete cần evidence server-owned và debrief phân biệt partial/success, meter learner dùng SkillMastery thay vì profile cũ. Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3 và E2E 16/16 trên DB tạm. Không có schema/deploy/production claim.

[Plan03](../planning/03_2026-09-08_learning-loop-completion/plan.md): hoàn thiện memory transaction, next-action UI, timeline, curriculum và TTS auth. Local gates PASS: 139 unit, type-check, lint 0 error, eval mock 15/15, build, Prisma validate, Python sidecar 3/3 và E2E 15/15 trên DB tạm. Production là kế hoạch hạ tầng riêng trong tương lai, không phải Plan 03 này.

## Ưu tiên tiếp theo
1. Hoàn tất Preview clone gate còn thiếu: hosted duplicate retry/idempotency và private-resource owner isolation; sau từng window phải trả branch Preview về `MIGRATION_WRITE_MODE=disabled`.
2. Đối chiếu disabled-window fresh login/read + before/after fingerprint đầy đủ trên clone, rồi giữ canonical staging không nhận Preview data và không promote staging DB sang production.
3. Sau Preview đạt, xin phê duyệt riêng cho final D1 export/cutover, giữ Cloudflare rollback trước khi Turso nhận write; sau write phải có quyết định reconciliation trước mọi rollback.
4. Chỉ sau khi target hosting đạt điều kiện: record one bounded successful persisted personalized-lesson/Kira smoke against the hosted binding, rồi quan sát quota/cost/latency trước khi mở rộng live generation. OpenAI remains an explicit alternate path, not a Kira URL override.
5. Pedagogical eval thật: thử nghiệm người học, đo tiến bộ/transfer và efficacy của Coach/Mission/Quest/PRACTICE thay vì số chat.
6. Learner memory xuyên phiên mở rộng: mục tiêu dài hạn, sở thích, quyền riêng tư và kiểm thử với người thật.
7. Thiết kế unified evidence contract cho legacy attempt/review/game (không tạo synthetic session); đồng thời audit server-owned game grading, self-service teacher role và transaction legacy.
8. Dọn 34 lint warnings theo gói riêng.

## Idea vault
STT/pronunciation, streaming, nhiệm vụ sinh theo mục tiêu thực, concurrent review schedule, bỏ legacy Kokoro sau quyết định deprecation. Đây là backlog, không phải tính năng đã có.
