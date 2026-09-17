# TESTING-ACCEPTANCE — Plan13

## Ma trận gate

| Gate | Nội dung | local | CI | production |
|---|---|---|---|---|
| G1 | type-check 0, eslint 0 lỗi | ✅ (0 / 0 lỗi, 28 cảnh báo) | ⬜ | — |
| G2 | vitest 100% (≥ 501 + test mới) | ✅ 110 file / 684 test | ⬜ | — |
| G3 | Playwright 100% (24 cũ + auth-flows + answer-canvas) | ✅ 32/32 | ⬜ | — |
| G4 | `next build` PASS | ✅ | ⬜ | ⬜ (deploy) |
| G5 | Live smoke Vyce thật: Mission/turn/tutor/coach/personalized(202→READY)/abandon/assist | ✅ (vocab 20 s, listening 42 s) | — | ⬜ |
| G6 | Auth: timing < 100 ms chênh; lockout; register-exists 202; logout 302 | ✅ (≤ 32 ms; auth_locked; 202; 307) | ⬜ | ⬜ |
| G7 | L1/L2/P1a/S1/A1 có test hồi quy đỏ-trước-xanh-sau (worker phải chứng minh test FAIL trên code cũ) | ✅ (báo cáo A/B/C ghi giá trị trước/sau) | — | — |
| G8 | verifier `--self-test` exit 0; drill in số bảng thật | ✅ (32 bảng/62 index/51 FK; 363 row) | ⬜ | — |
| G9 | Não/Plan/README đồng bộ; version 0.7.0 | ✅ đồng bộ; version giữ 0.6.0 tới khi CI ✅ | — | — |

## Bằng chứng (ledger — root điền)

| Thời điểm | Lệnh | Kết quả | SHA |
|---|---|---|---|
| 2026-09-17 22:50 | live-smoke trước sửa | Mission/turn/tutor OK; coach 409; personalized 524/503 | 3090415 + WIP |
| 2026-09-17 22:55–23:10 | 5 worker song song + 4 follow-up; root gates | type-check 0; eslint 0/28; vitest 110/684; Playwright 32/32; build PASS | WIP trên 3090415 |
| 2026-09-17 23:00 | live-smoke-v2 (auth/abandon/replaceActive/202-poll/assist/logout) | PASS; personalized vocab READY 20 s, listening READY 42 s; register-exists 202; lockout auth_locked; TTFB chênh ≤ 32 ms | WIP |
