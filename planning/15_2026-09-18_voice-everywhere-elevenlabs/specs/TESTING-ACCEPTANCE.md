# TESTING-ACCEPTANCE — Plan15

## Ma trận gate
| Gate | Nội dung | local | CI | production |
|---|---|---|---|---|
| G1 | type-check 0; eslint 0 lỗi (≤ 28 cảnh báo) | ✅ | ⬜ | — |
| G2 | vitest 100% | ✅ 126 file / 779 test | ⬜ | — |
| G3 | Playwright 100% (35 cũ + voice-everywhere 3) | ✅ 38/38 | ⬜ | — |
| G4 | `next build` PASS | ✅ (4 route voice mới trong build log) | ⬜ | ⬜ |
| G5 | Không key: capability `enabled:false`, audio routes 503, UI degrade, browser voice vẫn hoạt động | ✅ unit + E2E | ⬜ | — |
| G6 | Đáp án ẩn không lộ: route trả bytes, không header/body text; FILL 404 | ✅ unit + E2E | ⬜ | — |
| G7 | Với key thật: `voice:doctor --probe` OK; nghe thật trên 5 màn hình (OPERATIONS §2) | ⬜ (không có key local) | — | ⬜ |
| G8 | Não/Plan/README/ADR đồng bộ | ✅ | — | — |

## Ledger
| Thời điểm | Lệnh | Kết quả | SHA |
|---|---|---|---|
| 2026-09-18 02:35 | `vitest run elevenlabs-voice-policy elevenlabs` | 6 fail: Finley thắng Talia do tuổi/từ khoá → bonus thứ tự ưu tiên 30−index, tuổi ±2, cap từ khoá 9 → 16/16 | WIP |
| 2026-09-18 02:50 | `type-check` | 2 lỗi (schema chưa import; `Uint8Array<ArrayBufferLike>` vs BodyInit) → dùng `parsePublicAdaptiveGameRound`, cast BodyInit → 0 | WIP |
| 2026-09-18 02:52 | `eslint` | 1 lỗi `set-state-in-effect` (HiddenAudioButton autoPlay) → setTimeout 0 → 0 lỗi / 28 cảnh báo | WIP |
| 2026-09-18 02:55 | `vitest run` | 1 file fail (thiếu mock `server-only` + fixture sai schema) → sửa → xem dòng dưới | WIP |
| 2026-09-18 03:05 | `vitest run` toàn bộ; `eslint .`; `type-check` | 126 file / 779 test PASS; 0 lỗi / 28 cảnh báo; 0 | WIP trên ec4fbd4 |
| 2026-09-18 03:15 | `npm run build` | PASS, exit 0; routes mới: `/api/voice/tts`, `/api/game-runs/[runId]/rounds/[roundId]/audio`, `/api/learner/personalized-lessons/[lessonId]/exercises/[exerciseId]/audio` | WIP |
| 2026-09-18 03:20 | `npm run test:e2e` | **38/38 PASS** (2.5 phút; voice-everywhere 3 ca: capability false + POST 503, 401 ẩn danh, quiz "Nghe từ" + spell 503 message) | WIP |
