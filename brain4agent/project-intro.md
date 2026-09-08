# ListenAI — tự học tiếng Anh AI-native

Theo chỉ đạo người dùng ngày 2026-09-07, AI là cơ chế vận hành trải nghiệm: chọn mục tiêu, dựng tình huống, quan sát câu trả lời, sửa lỗi và điều chỉnh lượt/buổi tiếp theo. Mission, Lesson Coach và Daily Quest là luồng chính; curriculum, quiz, dictation và flashcard là tài nguyên hỗ trợ.

Next.js16.3.1 App Router, React19.2.8, TypeScript, Tailwind4, Auth.js5, Prisma6/SQLite. Vitest cho core/contracts; Playwright cho browser với database riêng. Python FastAPI/VieNeu là sidecar tùy chọn.

Structured provider tương thích OpenAI, deterministic fallback khi thiếu key/provider lỗi. Server giữ scoring, validator, state và mastery. Retrieval hiện là keyword từ dataset, chưa có vector database.

Giới hạn: mission templates authored; chưa có learner memory hội thoại xuyên phiên, STT/pronunciation scoring, token streaming hay eval hiệu quả học tập. Render PostgreSQL chưa khớp SQLite. Brain dự án dùng engine1.7.2/template1.4.0 từ Fitc84/brain4agent.old, không phải chính source hub.

Xem [index](index.md), [roadmap](roadmap.md), [plan](../planning/01_2026-09-07_project-hardening/plan.md).
