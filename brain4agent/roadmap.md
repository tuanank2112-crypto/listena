# Roadmap AI-native

## Đang thực hiện — local candidate đã nghiệm thu
[Plan07](../planning/07_2026-09-10_vercel-turso-migration/plan.md): thay thế mục tiêu hạ tầng bằng Next.js Node trên Vercel + Turso/libSQL. P71/P72/P73 đã qua local: 284 unit tests/66 files, type-check, lint 0 errors/34 pre-existing warnings, standard Next build, E2E 16/16 và verifier fixture 7/7. Điều này chỉ xác nhận candidate local; chưa có Turso staging, Vercel Preview/production, D1 export/import/mutation, hosted write enable, DNS/traffic cutover, rollback drill hay live Kira smoke. Cloudflare Worker + D1 đang triển khai được giữ làm rollback asset.

## Đã hoàn tất local
[Plan06](../planning/06_2026-09-10_personalized-ai-learning/plan.md): production now has additive core curriculum recovery, private persisted AI-lesson contracts and server-authoritative adaptive games. Worker `ee5de83a-c2a9-45e3-996a-e624072bb250` deploys the Kira Chat Completions adapter plus P65 D1/resource guards; secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b` adds the opaque Kira binding. The final real-provider smoke remains pending; no live-AI claim is made before then.

[Plan05](../planning/05_2026-09-10_cloudflare-workers-d1/plan.md): deploy OpenNext Next 16.3.3 lên Cloudflare Workers và production D1 `DB`; Auth.js Credentials dùng Worker secret và public `workers.dev` origin. Gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, Worker build, E2E 16/16 và production CSRF/login/session + D1 write smoke. Không seed/import production, không custom domain, không claim live AI/TTS.

[Plan04](../planning/04_2026-09-10_learning-integrity-truth/plan.md): Daily Quest dùng history thật để tránh lặp scenario, complete cần evidence server-owned và debrief phân biệt partial/success, meter learner dùng SkillMastery thay vì profile cũ. Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3 và E2E 16/16 trên DB tạm. Không có schema/deploy/production claim.

[Plan03](../planning/03_2026-09-08_learning-loop-completion/plan.md): hoàn thiện memory transaction, next-action UI, timeline, curriculum và TTS auth. Local gates PASS: 139 unit, type-check, lint 0 error, eval mock 15/15, build, Prisma validate, Python sidecar 3/3 và E2E 15/15 trên DB tạm. Production là kế hoạch hạ tầng riêng trong tương lai, không phải Plan 03 này.

## Ưu tiên tiếp theo
1. Tạo Turso staging tách biệt, export D1 ở chế độ chỉ đọc theo cửa sổ được duyệt, import/baseline và chạy schema/index/FK/timestamp/fingerprint proof; không promote staging DB sang production.
2. Deploy Vercel Preview với `APP_RUNTIME=vercel` và write fence disabled; xác nhận Node build, fresh auth, read paths và fingerprint không đổi. Chỉ bật write staging sau một quyết định được ghi nhận, rồi kiểm ownership/idempotency/persistence.
3. Sau staging đạt, xin phê duyệt riêng cho final D1 export/cutover, giữ Cloudflare rollback trước khi Turso nhận write; sau write phải có quyết định reconciliation trước mọi rollback.
4. Chỉ sau khi target hosting đạt điều kiện: record one bounded, persisted personalized-lesson smoke against the hosted Kira binding; then observe quota/cost/latency before expanding live generation. OpenAI remains an explicit alternate path, not a Kira URL override.
5. Pedagogical eval thật: thử nghiệm người học, đo tiến bộ/transfer và efficacy của Coach/Mission/Quest/PRACTICE thay vì số chat.
6. Learner memory xuyên phiên mở rộng: mục tiêu dài hạn, sở thích, quyền riêng tư và kiểm thử với người thật.
7. Thiết kế unified evidence contract cho legacy attempt/review/game (không tạo synthetic session); đồng thời audit server-owned game grading, self-service teacher role và transaction legacy.
8. Dọn 34 lint warnings theo gói riêng.

## Idea vault
STT/pronunciation, streaming, nhiệm vụ sinh theo mục tiêu thực, concurrent review schedule, bỏ legacy Kokoro sau quyết định deprecation. Đây là backlog, không phải tính năng đã có.
