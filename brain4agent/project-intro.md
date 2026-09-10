# ListenAI — tự học tiếng Anh AI-native

Theo chỉ đạo người dùng ngày 2026-09-07, AI là cơ chế vận hành trải nghiệm: chọn mục tiêu, dựng tình huống, quan sát câu trả lời, sửa lỗi và điều chỉnh lượt/buổi tiếp theo. Mission, Lesson Coach và Daily Quest là luồng chính; curriculum, quiz, dictation và flashcard là tài nguyên hỗ trợ.

Next.js16.3.3 App Router, React19.2.8, TypeScript, Tailwind4, Auth.js5 and Prisma6. Plan07's target runtime is Next.js Node on Vercel with local libSQL SQLite for development/E2E and explicit Turso/libSQL only when `APP_RUNTIME=vercel`; incomplete hosted settings fail closed. The existing Cloudflare Worker + D1 deployment is retained as a historical rollback asset, not the new target module graph. Vitest covers core/contracts; Playwright runs against an isolated database. Python FastAPI/VieNeu is an optional sidecar.

The structured provider calls a real configured API only when its hosted key is configured. KiraAI is deployed through its documented OpenAI-compatible Chat Completions endpoint; OpenAI Responses remains an explicit alternate transport. There is no runtime deterministic fallback: unavailable provider state is explicit. Server keeps scoring, validators, state and mastery; private AI lesson validators never leave the server. Retrieval is keyword-based from the dataset, not a vector database.

Giới hạn: Plan07 mới là candidate local đã qua 284 unit tests/66 files, type-check, lint 0 errors/34 pre-existing warnings, standard Next build, E2E 16/16 và verifier fixture 7/7. Chưa có Turso staging, Vercel Preview/production, D1 export/import/mutation, hosted write enable, cutover/rollback drill hay genuine live-provider smoke. Mission templates remain authored; there is no STT/pronunciation scoring, token streaming or learner efficacy evaluation. Render PostgreSQL is not a supported target. Brain dự án dùng engine1.7.2/template1.4.0 từ Fitc84/brain4agent.old, không phải chính source hub.

Xem [index](index.md), [roadmap](roadmap.md), [Plan07](../planning/07_2026-09-10_vercel-turso-migration/plan.md) và [Plan06 historical deployment record](../planning/06_2026-09-10_personalized-ai-learning/plan.md).
