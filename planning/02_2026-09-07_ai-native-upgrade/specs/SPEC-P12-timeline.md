# SPEC-P12 - Timeline & Metrics

## Contract
- `getLearnerTimeline(userId, windowDays=7): { items: TimelineItem[], weeklyStudyTime: number }`
- items = union (LearningSession COMPLETED, LearningEvidence, Attempt, ReviewLog) sort createdAt desc, limit 50.
- weeklyStudyTime = sum studyMinutes cua session co completedAt trong [now-7d, now]; tinh tu LearningSession.completedAt + studyMinutes da luu, khong tinh lifetime.

## BAT BUOC / CAM
- BAT BUOC: sua `src/server/services/learner.ts` hoac tao `src/server/learner/timeline.ts` de tinh dung cua so; bo capped 120 lifetime.
- BAT BUOC: dashboard/progress doc tu timeline, khong doc truc tiep totalStudyMinutes.
- CAM: doi schema Attempt/ReviewLog trong 02.

## Vung cam
Khong them analytics tracking moi; dung data da co.

## Loi
| Loi | Hanh vi |
| khong co data | { items: [], weeklyStudyTime: 0 } |
| window invalid | 400 |

## Nghiem thu
- Unit: weekly window tinh dung, khong cong lifetime cu.
- E2E: dashboard hien timeline hop nhat.
