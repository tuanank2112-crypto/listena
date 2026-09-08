# 00 - Kien truc va bat bien (Plan 02 - 0.2.0)

## Dinh huong san pham
AI van hanh vong hoc: chon muc tieu -> dung tinh huong -> quan sat cau tra loi -> sua loi -> thu thach comeback -> luu evidence -> dieu chinh buoc tiep theo. Mission/Lesson Coach/Daily Quest la entry chinh; curriculum/quiz/flashcard la remediation ho tro.

## Bat bien kien truc
- Next 16.3.1 App Router, React 19, TypeScript, Prisma 6/SQLite, Auth.js 5 JWT.
- Luong: Next route -> auth/validation -> service/repo -> Prisma -> DTO. AI chi tao dialogue/coaching/intervention spec; server giu scoring/validator/state/mastery/memory/next-action.
- Khong doi DB provider trong 02; Prisma schema chi them model LearnerMemory (khong sua model cu ngoai quan he). Migration moi phai reversible va khong reset dev.db.
- Session runtime: tutor-orchestrator la entry duy nhat; deterministic fallback khi provider loi. Moi turn doc memory truoc khi goi AI, ghi memory sau khi persist evidence.

## Vung cam (da can nhac va quyet dinh KHONG lam)
| Cam | Ly do |
| doi SQLite->Postgres | Can moi truong PG rieng + backup/restore plan; de plan 03 |
| STT/pronunciation scoring | Can model + eval rieng, chua chan loop text |
| Streaming token | Lam vo validator dong bo; de sau khi co E2E on dinh |
| Course-first navigation | Trai dinh huong AI-native; giu resume AI la primary |

## Phan loai loi + hanh vi caller
| Loi | Hanh vi |
| AI sai/cham | Fallback deterministic, van ghi evidence voi confidence thap |
| Memory write conflict | Last-write-wins theo evidence timestamp, khong mat du lieu cu |
| Next-action khong grounded | Fallback ve corrective practice gan nhat co evidence |
| Timeline data thieu | Tra partial + flag incomplete, khong 500 |

## Router doc
CONTRACTS -> SPEC-P10/P11/P12/P13 -> OPERATIONS -> TESTING-ACCEPTANCE
