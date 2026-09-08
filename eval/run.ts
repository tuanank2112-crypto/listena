import fs from "node:fs";
import {
  evaluateTutorTurn,
  startMission,
} from "../src/server/ai/tutor-orchestrator";
import { DeterministicMockTutorProvider } from "../src/server/ai/tutor-provider-contract";

type EvalCase = {
  id: string;
  kind: string;
  input: string;
  expectedPhase: string;
  expectGrounded: boolean;
  scenarioKey?: string;
  turnCount?: number;
};

type EvalResult = {
  id: string;
  kind: string;
  pass: boolean;
  expectedPhase: string;
  actualPhase: string;
  expectGrounded: boolean;
  grounded: boolean;
  reasons: string[];
};

const cases = fs
  .readFileSync("eval/cases.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as EvalCase);

async function runCase(evalCase: EvalCase): Promise<EvalResult> {
  const mission = await startMission(
    { scenarioKey: evalCase.scenarioKey ?? "lost-luggage", lessonContext: { title: "Bài 1 - INTRODUCTION", topic: "hobbies, sports, everyday communication", targetVocabulary: ["skateboarding", "skateboard"] } },
    { provider: new DeterministicMockTutorProvider() },
  );
  const state = { ...mission.state, turnCount: evalCase.turnCount ?? 1 };
  const result = await evaluateTutorTurn(
    {
      state,
      learnerMessage: evalCase.input,
      lessonContext: {
        title: "Bài 1 - INTRODUCTION",
        topic: "hobbies, sports, everyday communication",
        targetVocabulary: ["skateboarding", "skateboard"],
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

  return {
    id: evalCase.id,
    kind: evalCase.kind,
    pass: reasons.length === 0,
    expectedPhase: evalCase.expectedPhase,
    actualPhase,
    expectGrounded: evalCase.expectGrounded,
    grounded,
    reasons,
  };
}

async function main() {
  console.log("Eval harness - cases:", cases.length);
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    const result = await runCase(evalCase);
    results.push(result);
    console.log(
      `${evalCase.id} ${evalCase.kind} input="${evalCase.input.slice(0, 30)}" expectedPhase=${evalCase.expectedPhase} expectGrounded=${evalCase.expectGrounded} -> ${result.pass ? "PASS" : `FAIL: ${result.reasons.join("; ")}`}`,
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
}

void main();
