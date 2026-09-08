# Roadmap AI-native

## Đã hoàn tất local
[Plan03](../planning/03_2026-09-08_learning-loop-completion/plan.md): hoàn thiện memory transaction, next-action UI, timeline, curriculum và TTS auth. Local gates PASS: 139 unit, type-check, lint 0 error, eval mock 15/15, build, Prisma validate, Python sidecar 3/3 và E2E 15/15 trên DB tạm. Production là kế hoạch hạ tầng riêng trong tương lai, không phải Plan 03 này.

## Ưu tiên tiếp theo
1. Pedagogical eval thật: thử nghiệm người học, đo tiến bộ/transfer và efficacy của Coach/Mission/Quest/PRACTICE thay vì số chat.
2. Production: chọn provider DB, migration/backup/restore, quotas, latency/cost, live VieNeu inference/voice speed.
3. Learner memory xuyên phiên mở rộng: mục tiêu dài hạn, sở thích, quyền riêng tư và kiểm thử với người thật.
4. Audit legacy attempt/review transactions và dọn 37 lint warnings theo gói riêng.

## Idea vault
STT/pronunciation, streaming, nhiệm vụ sinh theo mục tiêu thực, concurrent review schedule, bỏ legacy Kokoro sau quyết định deprecation. Đây là backlog, không phải tính năng đã có.
