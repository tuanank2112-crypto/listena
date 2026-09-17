# ListenAI -- AI-native English self-learning

User direction reaffirmed2026-09-16: AI drives contextual practice, observes learner responses, coaches errors and adapts the next step. Mission, Lesson Coach and Daily Quest lead the loop; lessons/quiz/dictation/flashcards support remediation. Learner retains goal choice and control over data. Learning quality requires actual coaching review and unassisted transfer/retention evidence.

Current stack: Next16.3.5 App Router, React19.2.8, TypeScript, Tailwind4, Auth.js5, Prisma6/libSQL. Target hosting is Node/Vercel + explicit Turso; local/E2E SQLite. Partial hosted settings fail closed. Cloudflare Worker+D1 is the historical rollback asset. Retrieval is bounded keyword retrieval, not a vector DB. Optional Python FastAPI/VieNeu sidecar serves Vietnamese; English uses WebSpeech. Kokoro/Transformers were removed by Plan10.

Live provider selection is Kira Chat Completions or explicit OpenAI Responses. Server owns validators, grading/state/evidence/mastery and learner memory. Unavailable provider has an honest typed state; no runtime mock fallback. Shared intent-aware planner already exists, no new agent framework/planner is required.

Current master plan is [Plan12](../planning/12_2026-09-17_project-completion-release/plan.md) (2026-09-17): Definition of Done D1–D6 and a single version ladder to 1.0.0. [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md) holds the technical contracts; its P110–P112 have uncommitted WIP that fails type-check (7) and 2 integration tests (test-design defects) with 8 lint errors — a candidate, not accepted, qualified by Plan12 P120. Plan10 P102/P103/P106 remain qualified per the [post-worker review](../docs/WORKER_REVIEW_2026-09-16.md). Actual CI run is unverified.

Plan07 owns remaining hosted ownership/retry/read-only fingerprint, final export/Production/cutover/reconciliation-aware rollback. Plan09 real mail is still open. Successful live coaching, reviewed teaching quality and consented learner efficacy are not established. Render/PostgreSQL is not the supported target. Pilot A1-A2 everyday communication is an assumption pending user confirmation.

Trạng thái 2026-09-17: ứng viên P120–P126 nằm trong working tree, chưa commit, chưa nghiệm thu. Local đã được root xác minh độc lập là xanh thật, nhưng còn 7 finding mở và version 1.0.0 đã bump sớm khi cổng Production còn trống. Đọc [Root code review](../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md). Dự án chưa phát hành; phiên bản được chấp nhận vẫn là 0.5.0.
