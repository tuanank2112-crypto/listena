import fs from "node:fs";
import {
  evaluateTutorTurn,
  startMission,
} from "../src/server/ai/tutor-orchestrator.js";
import { DeterministicMockTutorProvider } from "../src/server/ai/tutor-provider-contract.js";

type EvalCase = {
  id: string;
  kind: string;
  input: string;
  expectedPhase: string;
  expectGrounded: boolean;
  scenarioKey?: string;
  turnCount?: number;
};

const cases = fs.readFileSync("eval/cases.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as EvalCase);
const results: Array<{
  id: string;
  kind: string;
  pass: boolean;
  expectedPhase: string;
  actualPhase: string;
  expectGrounded: boolean;
  grounded: boolean;
  reasons: string[];
}> = [];

console.log("Eval harness - cases:", cases.length);
for (const evalCase of cases) {
  const mission = await startMission(
    { scenarioKey: evalCase.scenarioKey ?? "lost-luggage" },
    { provider: new DeterministicMockTutorProvider() },
  );
  const state = { ...mission.state, turnCount: evalCase.turnCount ?? 1 };
  const result = await evaluateTutorTurn(
    {
      state,
      learnerMessage: evalCase.input,
      lessonContext: {
        title: "Checking in at a Hotel",
        topic: "hotel check-in and travel",
        targetVocabulary: ["suitcase", "luggage"],
      },
    },
    { provider: new DeterministicMockTutorProvider() },
  );

  const reasons: string[] = [];
  const actualPhase = result.output.statePatch.phase ?? mission.state.phase;
  const grounded = result.meta.groundedKnowledgeIds.length > 0;
  if (actualPhase !== evalCase.expectedPhase) {
    reasons.push(`phase expected ${evalCase.expectedPhase}, got ${actualPhase}`);
  }
  if (grounded !== evalCase.expectGrounded) {
    reasons.push(
      `grounded expected ${String(evalCase.expectGrounded)}, got ${String(grounded)}`,
    );
  }
  const pass = reasons.length === 0;
  results.push({
    id: evalCase.id,
    kind: evalCase.kind,
    pass,
    expectedPhase: evalCase.expectedPhase,
    actualPhase,
    expectGrounded: evalCase.expectGrounded,
    grounded,
    reasons,
  });
  console.log(
    `${evalCase.id} ${evalCase.kind} input="${evalCase.input.slice(0, 30)}" expectedPhase=${evalCase.expectedPhase} expectGrounded=${evalCase.expectGrounded} -> ${pass ? "PASS" : `FAIL: ${reasons.join("; ")}`}`,
  );
}

const passed = results.filter((result) => result.pass).length;
const expectedGrounded = results.filter((result) => result.expectGrounded).length;
const actualGrounded = results.filter((result) => result.grounded).length;
const report = [
  "# Eval Report - " + new Date().toISOString(),
  "",
  `Result: ${passed}/${results.length} PASS`,
  `Grounded: ${actualGrounded}/${results.length} actual, ${expectedGrounded}/${results.length} expected`,
  "",
  "| Case | Kind | Phase | Grounded | Result |",
  "|---|---|---|---|---|",
  ...results.map(
    (result) =>
      `| ${result.id} | ${result.kind} | ${result.expectedPhase} -> ${result.actualPhase} | ${String(result.grounded)} | ${result.pass ? "PASS" : "FAIL"} |`,
  ),
].join("\n");
fs.writeFileSync("eval/report.md", report + "\n");

if (passed !== results.length) {
  process.exitCode = 1;
}
