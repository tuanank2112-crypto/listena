# Changelog

## Unreleased — KiraAI adapter and P65 deployed
- Deploy KiraAI with non-secret configuration `AI_PROVIDER=kira`, `KIRAAI_MODEL=glm-5.3-flash-free`, and `KIRAAI_BASE_URL=https://kiraai.vn/api/v1` as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250`; the value of `KIRAAI_API_KEY` is not stored in this repository.
- Add a native-D1 reservation/commit-fence boundary for P65 learning-session, private-lesson/attempt and adaptive-game graphs, with 40 rolling-24-hour AI reservations, a 30-second pending lease, and an applicable 12-second one-off cooldown.
- Document the protocol boundary: Kira uses Chat Completions with server-side JSON/Zod validation, whereas OpenAI remains an optional Responses transport with its strict-schema/store controls. Secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b` installs the binding name only; no live-AI success is claimed by this entry.

## 0.5.0 — 2026-09-10 (Cloudflare deployment; live-provider key pending)
- Restore the tracked core curriculum to production D1 via an additive, idempotent import: 5 lessons, 116 vocabulary items, 20 segments and 54 exercises. Existing user data was preserved; the system curriculum owner cannot log in.
- Add owner-private, persisted personalized lessons backed by a real OpenAI Responses structured-output boundary. The browser never receives validators or correct answers; missing/invalid upstream configuration returns a typed unavailable response rather than mock content.
- Add calibration/evidence and familiar Quiz/Match/Spell games that use server-owned adaptive selection, hidden validators, exactly-once answer writes and per-learner resource guards (10 seconds / 12 fresh runs per 24 hours).
- Historical pre-Kira deployment: Worker `8d50494f-773f-46bb-9910-23c4474d9b4d`. Verified 204 unit tests, type-check, lint 0 errors/36 warnings, Worker build, E2E 16/16 and public root/login HTTP smoke. `OPENAI_API_KEY` was not configured in that historical deployment; the current selected provider is KiraAI.

## 0.4.0 — 2026-09-10 (Cloudflare Workers + D1 public release)
- Deploy OpenNext Next 16.3.3 app to public Cloudflare Worker and bind production D1 as `DB`; schema is checked-in `migrations/0001_initial_schema.sql` (56 commands).
- Prisma selects local libSQL SQLite for Node/dev/E2E and request-scoped D1 with the Worker WASM client in production. Auth.js redirects use the fixed public Worker origin and trusted internal OpenNext host.
- Remove Worker-incompatible TTS disk cache; optional VieNeu failure remains browser-speech fallback.
- Verified: type-check, 152 unit tests, lint 0 error/37 existing warnings, Prisma validate, eval 15/15, isolated SQLite E2E 16/16, Worker build, production D1 registration and CSRF/Credentials/session smoke. Temporary production smoke users were deleted exactly; no production seed/import.
- Does not claim custom-domain setup, backup/restore readiness, paid Cloudflare features, third-party AI/TTS configuration, quotas, or pedagogical efficacy.

## 0.3.0 — 2026-09-10 (working tree, chưa commit/deploy)
- Daily Quest start path truyền history scenario owned đã validate cho planner, tránh lặp authored scenario khi còn lựa chọn khác.
- Session không evidence không thể complete/cộng phút; manual end có evidence nhưng chưa qua success state là `PARTIAL`, debrief chỉ dẫn luyện tiếp thay vì trophy. Auto BOSS success vẫn là `COMPLETED`.
- Dashboard/progress dùng `SkillMastery` adaptive cho meter nghe/từ vựng/chính tả, profile chỉ fallback với skill chưa có record.
- Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 16/16 DB tạm.
- Không thêm schema migration; không claim deploy/production DB, AI efficacy, live voice latency/speed, rate/quota hay production security closure.

## 0.2.1 — 2026-09-08 (working tree, chưa commit/deploy)
- Memory, evidence và mastery commit trong cùng transaction; retry idempotent; corrupt memory được validate và rollback có test.
- Next action sau manual/auto completion giữ qua reload và dẫn COACH/MISSION/QUEST/PRACTICE owned; mastery dưới 0.6 chủ động chọn luyện lại.
- Timeline shared cho dashboard/progress, tổng 7 ngày không bị giới hạn 50 mục; curriculum không phụ thuộc tên course và loại DRAFT.
- TTS API/sidecar yêu cầu auth và shared key, cache private ngoài public; boundary tests không warm-up/download model.
- Local gates PASS: 139 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 15/15 DB tạm.
- Không claim production readiness, hiệu quả sư phạm thật, voice speed/latency/quota hay deploy.

## 0.1.1 — 2026-09-07 (working tree, chưa commit/deploy)
- Chốt AI-native theo người dùng; dashboard resume/khởi tạo phiên AI là hành động chính.
- Sửa secure-cookie proxy/role redirects, teacher/course owner và draft attempt gate.
- Validator quyết định feedback/state/evidence; CHOICE index phải hợp lệ.
- Completion auto/manual tăng thời gian một lần trong transaction.
- SRS counters tích lũy; queue đến hạn, hết lượt, retry lỗi; intervention reset và bỏ dead voice toggle.
- Unit/browser regression, database E2E riêng, docs/plan/brain engine1.7.2/template1.4.0.
- Bằng chứng cuối ở TESTING-ACCEPTANCE; không suy production readiness.

## 0.2.0 — 2026-09-07 (working tree, chưa commit/deploy)
- Thêm LearnerMemory + migration, learner timeline, nextAction sau completion và pedagogical eval mock.
- Sửa demo dashboard/games/lessons lọc theo course seed cũ khiến trang hiển thị trống.
- Gates local PASS: type-check, 106 unit tests, lint 0 error, Prisma 3 migrations, build, E2E 7/7, eval 15/15 orchestration mock.
- Lưu ý: eval giờ gọi thật orchestrator; grounded 4/15 đúng kỳ vọng, chưa chứng minh hiệu quả học tập thật; production DB/deploy chưa làm.

- 2026-09-07 20:55: Nâng eval từ self-assert sang harness thật qua orchestrator; mock quyết định theo target vocabulary + độ dài, retrieval chỉ theo learner message và chặn off-topic/vague.
