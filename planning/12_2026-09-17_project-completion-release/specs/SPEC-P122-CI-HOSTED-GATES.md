# SPEC-P122 — CI thật và các gate hosted Preview

Runbook hosted: [Plan07 OPERATIONS](../../07_2026-09-10_vercel-turso-migration/specs/OPERATIONS.md) (authority), [Plan09 TESTING](../../09_2026-09-15_account-email-security/specs/TESTING-ACCEPTANCE.md), [Plan10 OPERATIONS §Preview](../../10_2026-09-16_release-readiness-hardening/specs/OPERATIONS.md), [Plan11 OPERATIONS](../../11_2026-09-16_ai-native-evidence-gates/specs/OPERATIONS.md). File này chỉ định **thứ tự, đầu vào, bằng chứng bắt buộc** để Plan12 đóng gate; không đổi runbook.

## Phần A — CI thật

Hiện trạng: `.github/workflows/ci.yml` tồn tại (push `codex/*`, PR main); `gh auth status` chưa đăng nhập; chưa có run URL nào trong repo.

Contract:

```text
Input:  ứng viên đã commit (SHA từ P120/P121), user đăng nhập gh HOẶC cung cấp URL run
Lệnh:   gh run list --branch codex/vercel-turso-migration --limit 5
        gh run view <id> --json headSha,conclusion,status,url,jobs
Output: receipt { env: "ci", commitSha = headSha, artifacts: [url], counts: {jobs, steps}, gate }
```

- BẮT BUỘC `headSha` = SHA ứng viên; conclusion `success`. Run trên SHA khác → không tính.
- BẮT BUỘC kiểm workflow thật sự chạy các bước đã khai báo: type-check, lint, vitest coverage, Python 7 test, Prisma validate, build, E2E (nếu có trong file). Bước bị `continue-on-error` hoặc bị skip → ghi rõ, gate không PASS toàn phần.
- Nếu CI FAIL vì môi trường (Python deps, Playwright browsers) → sửa workflow trong P122, rerun; ghi cả run fail và run pass.
- Không đăng nhập được → gate `UNVERIFIED`, không suy CI fail.

## Phần B — Preview disabled (fence bật)

Đầu vào: deploy ứng viên lên branch Preview hiện có (project `n-listen-ai/listena`, env `APP_RUNTIME=vercel`, `MIGRATION_WRITE_MODE=disabled`), clone disposable đã reconcile schema.

Bằng chứng bắt buộc (Plan07 gate "Vercel Preview disabled" còn ⬜):

1. Deployment Ready của **đúng SHA** (ghi deployment id + SHA).
2. Đăng nhập tài khoản synthetic **đã có** trên clone (không tạo mới vì fence) → dashboard/progress/lessons/flashcards render, 0 console error.
3. All-table fingerprint clone **trước và sau** phiên đọc: bằng nhau (script fingerprint read-only; danh sách bảng đầy đủ 31 bảng theo reconcile Plan10).
4. Mỗi endpoint mutation (`/api/attempt`, `/api/flashcard`, `/api/teacher/lesson`, `/api/teacher/generate-lesson`, `/api/learning-sessions`, register) trả 403/405 fence typed; không hàng mới.
5. `/api/learner/next-action` GET: 0 write (fingerprint), 0 provider call (log provider count = 0).

## Phần C — Preview enabled window (cửa sổ ghi có phê duyệt)

Manifest **trước** khi mở (theo Plan11 OPERATIONS §5), ghi vào plan.md Plan12 kèm mốc phê duyệt của user:

```text
candidateSha, cloneName (≠ listena-staging-20260911, ≠ Production), fingerprintBefore,
accounts: [learner-synthetic, teacher-synthetic], allowedEndpoints, providerScope (typed-unavailable | live ≤N calls),
mailScope (Resend disposable address | none), windowMinutes ≤ 30, restoreCommand, readbackScript
```

Bằng chứng bắt buộc trong cửa sổ:

| Gate gốc | Case | Số đo |
|---|---|---|
| Plan07 "hosted duplicate retry" | 20 same-key attempt qua HTTP thật | 1 Attempt; 19 `replayed:true`; 0 500 |
| Plan07 "private-owner isolation" | learner B đọc/replay key của learner A | 404/403; 0 leak |
| Plan10 WAF/abuse | burst > limit trên `/api/auth`, `/api/learning-sessions` | rate-limit response; ghi rule + số đếm |
| Plan09 mail Preview | register → verification mail đến địa chỉ disposable → confirm → login; reset 1 lần; feedback receipt | 3 mail đến; token 1 lần; secret không log |
| Live typed | Tutor với provider chưa cấu hình trên Preview | typed `AI_UNAVAILABLE`; nếu user cấp key live ≤N call → ghi riêng ở P124 |
| Fence restore | `MIGRATION_WRITE_MODE=disabled` redeploy → mutation bị chặn; fingerprint sau = fingerprint tại cuối cửa sổ | bằng nhau |

- BẮT BUỘC clone disposable; CẤM dùng canonical staging hoặc Production.
- BẮT BUỘC khôi phục fence trong cùng phiên; chưa khôi phục → gate không đóng, ghi "cửa sổ chưa đóng" và ưu tiên đóng.
- CẤM in secret, connection string; CẤM seed/reset clone (tạo tài khoản synthetic qua register là được phép trong cửa sổ).

## Vùng cấm

- CẤM coi Ready deployment + biến môi trường fence là bằng chứng read-only (phải có fingerprint).
- CẤM staging promotion, D1 mutation, DNS/traffic change trong P122.
- CẤM gọi provider live trong P122 nếu chưa có cap từ user (thuộc P124).

## Ma trận lỗi / operator

| Lỗi | Hành vi |
|---|---|
| CI run không truy cập được | UNVERIFIED; tiếp tục local |
| Deployment Ready nhưng SHA khác | không dùng; redeploy đúng SHA |
| Fingerprint trước/sau lệch ở disabled | gate FAIL; điều tra endpoint ghi; không mở cửa sổ enabled |
| Mail không đến | Plan09 gate ⬜; kiểm domain/sender; không đóng bằng "đã cấu hình" |
| Restore fence lỗi | không đóng cửa sổ; verify deployment + fingerprint trước bất kỳ test ghi tiếp |

## Nghiệm thu P122

- Receipt CI: URL, headSha, conclusion, danh sách job/step, artifact (coverage/E2E report) retention.
- Receipt Preview disabled: deployment id, SHA, fingerprint hash trước/sau, bảng endpoint × status.
- Receipt Preview enabled: manifest, mốc phê duyệt, bảng gate × số đo, fingerprint cuối cửa sổ, fingerprint sau restore.
- Đánh dấu ✅ + ngày + trỏ receipt vào Plan07 TESTING-ACCEPTANCE ("Vercel Preview disabled/enabled"), Plan09 TESTING ("Preview disabled/enabled"), Plan10 TESTING ("WAF"), Plan11 TESTING ("CI", "Preview disabled/enabled").
