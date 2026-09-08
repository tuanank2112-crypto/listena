# SPEC-P11 - Next Action & Debrief

## Contract
- `computeNextAction(userId, sessionId): Promise<NextAction | null>` doc memory + evidence 5 turn gan nhat + skill yeu + vocab den han.
- Rule uu tien: (1) loi lap >=3 lan -> PRACTICE corrective, (2) skill yeu nhat -> COACH lesson chua hoc, (3) vocab den han -> QUEST, (4) con lai -> MISSION moi.
- API: `POST /api/learning-sessions/:id/complete` tra `{ session, nextAction }`. Client hien card "Buoc tiep theo" voi reason + CTA.

## BAT BUOC / CAM
- BAT BUOC: reason phai grounded (trich errorType/skillKey + count + evidenceRefs); khong generic.
- BAT BUOC: targetId phai ton tai (lesson/vocab/scenario); neu khong, fallback PRACTICE.
- CAM: goi AI de sinh nextAction trong 02; dung rule deterministic co evidence.

## Vung cam
Khong dung LLM de chon nextAction trong 02; can eval harness truoc khi tin LLM.

## Loi
| Loi | Hanh vi |
| khong co evidence | nextAction = null, debrief binh thuong |
| target missing | fallback PRACTICE + warn log |

## Nghiem thu
- Unit: 4 nhanh uu tien dung.
- E2E: complete -> thay card next action + click CTA dieu huong dung.
