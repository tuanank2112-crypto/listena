# TESTING-ACCEPTANCE — Plan14

## Ma trận gate

| Gate | Nội dung | local | CI | production |
|---|---|---|---|---|
| G1 | type-check 0, eslint 0 lỗi (≤ 28 cảnh báo baseline) | ✅ (0 / 0 lỗi, 28 cảnh báo) | ⬜ | — |
| G2 | vitest 100% (684 cũ + test mới) | ✅ 119 file / 743 test | ⬜ | — |
| G3 | Playwright 100% (32 cũ + voice-ai 3 ca) | ✅ 35/35 | ⬜ | — |
| G4 | `next build` PASS | ✅ (58 route entries trong log, có `/api/voice/pronunciation`) | ⬜ | ⬜ |
| G5 | Bất biến "không đọc câu sai": test `voice-script` + E2E script chỉ NPC/RECAST/COACH | ✅ | ⬜ | — |
| G6 | Bất biến ownership/ledger: chấm có session chỉ nhận câu đã modelled; `/events` từ chối VOICE_PRACTICE | ✅ unit + E2E | ⬜ | — |
| G7 | Header `Permissions-Policy microphone=(self)` | ✅ (next.config) | — | ⬜ curl sau deploy |
| G8 | Smoke thủ công theo trình duyệt (OPERATIONS §3) | ⬜ | — | ⬜ |
| G9 | Não/Plan/README/ADR đồng bộ | ✅ | — | — |

## Bằng chứng (ledger — root điền)

| Thời điểm | Lệnh | Kết quả | SHA |
|---|---|---|---|
| 2026-09-18 00:07 | `vitest run src/core/voice` (lần đầu) | 6 fail → sửa thứ tự pipeline (bold vs stage direction, viết tắt trước tách câu, blank trước markdown, số là pronounceable, detect en khi không dấu) → 31/31 | WIP trên 1b8f0f8 |
| 2026-09-18 00:20 | `vitest run src/server/voice src/app/api/voice …` | 42/42 | WIP |
| 2026-09-18 00:30 | `npx eslint …` | 4 lỗi `react-hooks/set-state-in-effect` + `refs during render` → chuyển sang `useSyncExternalStore`/effect → 0 lỗi | WIP |
| 2026-09-18 00:35 | `npm run type-check`; `npx eslint .`; `npx vitest run` | 0 lỗi; 0 lỗi / 28 cảnh báo; 118 file / 741 test (trước khi thêm test tĩnh) → 119 / 743 | WIP |
| 2026-09-18 00:45 | `npm run build` | PASS, exit 0, 58 dòng route trong log (mới: `/api/voice/pronunciation`) | WIP |
| 2026-09-18 00:55 | `npm run test:e2e` lần 1 | 33 pass / 2 fail (voice-ai): học viên seed còn Mission ACTIVE từ smoke → nút "Vào vai" hiện "Tiếp tục / Bắt đầu phiên mới" thay vì điều hướng; `isVisible({timeout})` không chờ | WIP |
| 2026-09-18 01:05 | sửa spec: abandon phiên ACTIVE của learner qua Prisma + `Promise.race(waitForURL, nút "Bắt đầu phiên mới")`; `playwright test smoke voice-ai` | 8/8 | WIP |
| 2026-09-18 01:10 | `npm run test:e2e` toàn bộ | **35/35 PASS** (1.9 phút) | WIP |
| 2026-09-18 01:12 | `npx eslint e2e/voice-ai.spec.ts src`; `npm run type-check` | 0 lỗi (21 cảnh báo trong phạm vi); 0 lỗi | WIP |
