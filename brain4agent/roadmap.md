# Roadmap AI-native

## Đã hoàn tất local
[Plan04](../planning/04_2026-09-10_learning-integrity-truth/plan.md): Daily Quest dùng history thật để tránh lặp scenario, complete cần evidence server-owned và debrief phân biệt partial/success, meter learner dùng SkillMastery thay vì profile cũ. Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3 và E2E 16/16 trên DB tạm. Không có schema/deploy/production claim.

[Plan03](../planning/03_2026-09-08_learning-loop-completion/plan.md): hoàn thiện memory transaction, next-action UI, timeline, curriculum và TTS auth. Local gates PASS: 139 unit, type-check, lint 0 error, eval mock 15/15, build, Prisma validate, Python sidecar 3/3 và E2E 15/15 trên DB tạm. Production là kế hoạch hạ tầng riêng trong tương lai, không phải Plan 03 này.

## Ưu tiên tiếp theo
1. Pedagogical eval thật: thử nghiệm người học, đo tiến bộ/transfer và efficacy của Coach/Mission/Quest/PRACTICE thay vì số chat.
2. Production: chọn provider DB, migration/backup/restore, quotas, latency/cost, live VieNeu inference/voice speed.
3. Learner memory xuyên phiên mở rộng: mục tiêu dài hạn, sở thích, quyền riêng tư và kiểm thử với người thật.
4. Thiết kế unified evidence contract cho legacy attempt/review/game (không tạo synthetic session); đồng thời audit server-owned game grading, self-service teacher role và transaction legacy.
5. Dọn 37 lint warnings theo gói riêng.

## Idea vault
STT/pronunciation, streaming, nhiệm vụ sinh theo mục tiêu thực, concurrent review schedule, bỏ legacy Kokoro sau quyết định deprecation. Đây là backlog, không phải tính năng đã có.
