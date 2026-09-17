# OPERATIONS — Plan14

## 1. Thứ tự bắt buộc (local)
1. `npx vitest run` (toàn bộ) → `npm run type-check` → `npx eslint .` → `npm run build` (tắt dev server :3100 trước) → `npm run test:e2e` (Playwright tự dựng :3100 trên DB tạm).
2. Không commit trong lượt agent; user quyết định commit/push. Không đụng `prisma/dev.db`, Turso, Vercel.

## 2. Vercel / production
- Không biến môi trường mới. Không sidecar. Route mới `POST /api/voice/pronunciation` là Node runtime, nhẹ (không gọi provider), không cần `maxDuration`.
- Header `Permissions-Policy` đổi `microphone=(self)` — áp dụng khi deploy build mới. Kiểm sau deploy: `curl -sI https://listena.vercel.app/ | grep -i permissions-policy` phải chứa `microphone=(self)`.
- VieNeu (tiếng Việt) vẫn không có trên Vercel: coach tiếng Việt dùng giọng `vi-VN` của thiết bị nếu có; không có thì dòng vi bị bỏ qua (không lỗi).

## 3. Smoke thủ công sau deploy (không tự động hoá được)

| Thiết bị / trình duyệt | Kiểm | Kỳ vọng |
|---|---|---|
| Windows Edge | Settings → "Giọng đang dùng" | `Microsoft … Online (Natural)` tier neural; "Nghe thử giọng" rõ, không robot |
| Windows Chrome | như trên | giọng Microsoft desktop (SYSTEM) hoặc Google (REMOTE) nếu không có |
| macOS Safari | như trên | Samantha/Ava… (PREMIUM/NEURAL), tuyệt đối không "Bad News/Zarvox" |
| Android Chrome | Mission → nút mic → nói | xin quyền micro 1 lần; transcript vào ô trả lời; giọng Google đọc lượt AI |
| iOS Safari | nút mic | iOS ≥ 14.5 có webkitSpeechRecognition; nếu không hiện mic thì settings phải hiện cảnh báo |
| Firefox | Mission | không mic; textarea còn; settings cảnh báo |
| Bất kỳ | AI trả lời có lỗi ngữ pháp của học viên | script chỉ đọc câu đúng (RECAST chậm), không đọc câu sai |
| Bất kỳ | "Luyện nói" → nói đúng câu | verdict GOOD, chip xanh; DB phiên có SYSTEM turn `VOICE_PRACTICE` |

## 4. Rollback
- Code: revert các file trong plan.md §Work packages (tập file rời theo WP). Không có migration → không cần rollback DB. Row `VOICE_PRACTICE` cũ vô hại (SYSTEM turn bị DTO lọc bỏ).
- Nếu chỉ cần tắt STT: đổi `Permissions-Policy` về `microphone=()` (mic ẩn do recogniser vẫn có nhưng quyền bị chặn → lỗi `not-allowed`; tốt hơn là revert P142).
