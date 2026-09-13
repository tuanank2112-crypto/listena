# Roadmap AI-native

## Plan08 đã hoàn thành implementation + local acceptance 2026-09-13

Plan08 P80–P85 đã được root điều phối, tích hợp và nghiệm thu ở local: reliability trước (GET không ghi DB, account/start contract atomic + idempotent, auth-secret thống nhất), rồi learner intent/calibration trung thực, planner chung bounded/evidence-aware, bộ quality offline versioned và E2E integration. Bằng chứng local: 387/387 tests/78 files; type-check PASS; lint exit 0 với 34 warnings có sẵn; production build PASS; Prisma validate/generate PASS; E2E fresh SQLite 20/20; quality 30/30 cases + 12/12 dataset checks. Không mở rộng legacy evidence ngoài adapter có hợp đồng và không tạo synthetic session.

Đây không đóng Plan07 hoặc tạo release: Vercel/Turso Preview/Production, final D1 export, cutover, rollback, successful live provider và consented learner pilot vẫn OPEN; `current_version` giữ 0.5.0. P2 không chặn release local: Coach reservation có thể bị tiêu nếu lesson bị unpublish sau provider output nhưng trước atomic target commit; commit sẽ reject target và không ghi stale graph, nên đây là quota waste bị giới hạn cần xử lý riêng.

## Historical review và kế hoạch cải tiến 2026-09-13 — planning phase

User tái xác nhận: tự học tiếng Anh AI-native, root điều phối như orchestrator. [Review](../docs/PROJECT_REVIEW_2026-09-13.md) và [Plan08](../planning/08_2026-09-13_ai-native-self-learning/plan.md) đã lập trong pha review; thứ tự P81 → P82 → P83 → P84/P85 đã được thực hiện ở local theo checkpoint bên trên. Các local work package không vượt hosted gates Plan07.

Baseline của pha review:293 tests/67files + type-check PASS. Khi đó GET recommendation còn upsert khi write mode disabled; registration-fence proof cũ không chứng minh toàn bộ read-only window. Các finding đã được xử lý và local fingerprint đã có; hosted clone equivalent vẫn là gate Plan07 riêng và cutover vẫn cần phê duyệt riêng.

## Đang thực hiện — staging + bounded Preview evidence
[Plan07](../planning/07_2026-09-10_vercel-turso-migration/plan.md): thay thế mục tiêu hạ tầng bằng Next.js Node trên Vercel + Turso/libSQL. Proof hosted đã ghi nhận vẫn là canonical Turso staging và bounded Vercel Preview clone (registration/dashboard, một game evidence write/readback, Tutor typed-unavailable và final write fence). Working tree hiện được xác nhận lại bởi Plan08 local gates 387 tests/78 files, type-check, lint exit 0/34 warnings có sẵn, standard Next build, Prisma validate/generate, E2E 20/20 và quality offline 30/30 + 12/12; các số này không thay thế hosted duplicate-retry/private-owner proof, final D1 export, Production, DNS/traffic cutover, rollback drill hay successful live Kira smoke. Cloudflare Worker + D1 đang triển khai được giữ làm rollback asset.

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
