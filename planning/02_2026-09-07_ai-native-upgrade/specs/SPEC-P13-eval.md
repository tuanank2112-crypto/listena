# SPEC-P13 - Pedagogical Eval Harness

## Contract
- `eval/cases.jsonl` - 15 cases toi thieu, moi kind 3 cases: correct/wrong/short/vague/off-topic.
- `eval/run.ts` (tsx) doc cases, goi tutor-orchestrator voi AI_PROVIDER=mock, kiem: phase dung, grounded reason co evidenceRefs, khong lo validator.
- `npm run eval` in bang: pass/fail per case + ti le grounded.

## BAT BUOC / CAM
- BAT BUOC: case phai co expectedPhase + expectGrounded + input thuc te tu dataset.
- BAT BUOC: khong goi provider that trong eval; chi mock/deterministic.
- CAM: dung ti le pass de tuyen bo hieu qua hoc tap da chung minh.

## Vung cam
Khong chay eval voi nguoi hoc that trong 02; chi harness noi bo.

## Nghiem thu
- Chay `npm run eval` PASS 15/15 mock; bao cao luu `eval/report.md`.
