# ListenAI — tự học tiếng Anh AI-native

Theo chỉ đạo người dùng ngày 2026-09-07, AI là cơ chế vận hành trải nghiệm: chọn mục tiêu, dựng tình huống, quan sát câu trả lời, sửa lỗi và điều chỉnh lượt/buổi tiếp theo. Mission, Lesson Coach và Daily Quest là luồng chính; curriculum, quiz, dictation và flashcard là tài nguyên hỗ trợ.

Next.js16.3.3 App Router, React19.2.8, TypeScript, Tailwind4, Auth.js5, Prisma6 with local libSQL SQLite and production Cloudflare D1. Vitest covers core/contracts; Playwright runs against an isolated database. Python FastAPI/VieNeu is an optional sidecar.

The structured provider calls a real OpenAI-compatible Responses API only when its hosted key is configured. There is no runtime deterministic fallback: unavailable provider state is explicit. Server keeps scoring, validators, state and mastery; private AI lesson validators never leave the server. Retrieval is keyword-based from the dataset, not a vector database.

Giới hạn: the deployed Worker still awaits the owner-provided OpenAI secret for a genuine live-provider smoke; mission templates remain authored; there is no STT/pronunciation scoring, token streaming or learner efficacy evaluation. Render PostgreSQL is not a supported target. Brain dự án dùng engine1.7.2/template1.4.0 từ Fitc84/brain4agent.old, không phải chính source hub.

Xem [index](index.md), [roadmap](roadmap.md), [plan](../planning/01_2026-09-07_project-hardening/plan.md).
