import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeDatasetHash,
  LEARNING_DATASET_VERSION,
  LEARNING_PROMPT_VERSION,
  type LearningEvalCase,
  type LearningEvalCheck,
  type LearningEvalResult,
  parseLearningDataset,
  validateLearningDataset,
} from "./learning-contract";
import { DeterministicMockTutorProvider } from "../src/server/ai/tutor-provider-contract";
import { evaluateTutorTurn, startMission } from "../src/server/ai/tutor-orchestrator";

type RunnerOptions = {
  mode: "offline" | "live";
  datasetPath: string;
  outputDirectory: string;
  environment: string;
  maxCalls?: number;
  maxCostUsd?: number;
  commitSha: string;
};

const DEFAULT_DATASET_PATH = "eval/learning-cases.v1.jsonl";

function getGitCommitSha(): string {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // fallback
  }
  return "uncommitted-candidate";
}

function parseCliArgs(args: string[]): RunnerOptions {
  let mode: "offline" | "live" = "offline";
  let datasetPath = DEFAULT_DATASET_PATH;
  let outputDirectory = "";
  let environment = "local";
  let maxCalls: number | undefined;
  let maxCostUsd: number | undefined;
  let commitSha = getGitCommitSha();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const val = args[++index];
      if (val === "offline" || val === "live") mode = val;
      else throw new Error(`Invalid --mode: ${val}. Must be 'offline' or 'live'.`);
    } else if (arg === "--dataset") {
      datasetPath = args[++index];
    } else if (arg === "--out-dir") {
      outputDirectory = args[++index];
    } else if (arg === "--environment") {
      environment = args[++index];
    } else if (arg === "--max-calls") {
      maxCalls = parseInt(args[++index], 10);
      if (Number.isNaN(maxCalls) || maxCalls <= 0) {
        throw new Error("--max-calls must be a positive integer");
      }
    } else if (arg === "--max-cost-usd") {
      maxCostUsd = parseFloat(args[++index]);
      if (Number.isNaN(maxCostUsd) || maxCostUsd <= 0) {
        throw new Error("--max-cost-usd must be a positive number");
      }
    } else if (arg === "--commit") {
      commitSha = args[++index];
    }
  }

  if (!outputDirectory) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const shortSha = commitSha.slice(0, 7);
    outputDirectory = join("eval", "runs", `${dateStr}-${shortSha}`);
  }

  return {
    mode,
    datasetPath,
    outputDirectory,
    environment,
    maxCalls,
    maxCostUsd,
    commitSha,
  };
}

async function runOfflineCase(
  testCase: LearningEvalCase,
  datasetHash: string,
  commitSha: string,
  environment: string,
): Promise<LearningEvalResult> {
  const startMs = Date.now();
  const checks: LearningEvalCheck[] = [];
  const failures: string[] = [];
  const turnOutputs: unknown[] = [];

  const provider = new DeterministicMockTutorProvider();

  const addCheck = (id: string, condition: boolean, message: string) => {
    checks.push({ id, passed: condition, message: condition ? undefined : message });
    if (!condition) failures.push(`[${id}] ${message}`);
  };

  try {
    const lessonContext =
      testCase.mode === "LESSON_COACH"
        ? {
            title: testCase.metadata?.lessonTitle || "Travel and Communication",
            unit: 1,
            topic: testCase.metadata?.topic || "Transportation",
            learningObjectives: ["Buy a ticket", "Ask for directions"],
            transcriptExcerpt: "Can you show me the ticket counter? Here is your ticket.",
            targetVocabulary: ["ticket", "express", "counter"],
            targetGrammar: ["can you", "need to"],
          }
        : undefined;

    const opening = await startMission(
      {
        mode: testCase.mode,
        scenarioKey: testCase.metadata?.scenarioKey || "lost-luggage",
        lessonContext,
      },
      { provider },
    );

    addCheck(
      `${testCase.caseId}_opening_valid`,
      Boolean(opening?.state && opening?.opening?.npcReply),
      "Opening state and NPC reply must be present",
    );

    let currentState = opening.state;

    for (let i = 0; i < testCase.turns.length; i++) {
      const turn = testCase.turns[i];
      const turnResult = await evaluateTutorTurn(
        {
          state: currentState,
          learnerMessage: turn.learnerMessage,
          lessonContext,
        },
        { provider },
      );

      const turnOutput = turnResult.output;
      turnOutputs.push(turnOutput);

      addCheck(
        `${testCase.caseId}_t${i + 1}_npc_reply_non_empty`,
        typeof turnOutput.npcReply === "string" && turnOutput.npcReply.trim().length > 0,
        `Turn ${i + 1} npcReply must be a non-empty string`,
      );

      addCheck(
        `${testCase.caseId}_t${i + 1}_score_valid`,
        typeof turnOutput.score === "number" && turnOutput.score >= 0 && turnOutput.score <= 1,
        `Turn ${i + 1} score must be between 0 and 1; got ${turnOutput.score}`,
      );

      addCheck(
        `${testCase.caseId}_t${i + 1}_act_valid`,
        ["ASK_GUIDING", "CONFIRM", "REPAIR_DRILL", "SITUATION_SHIFT", "CELEBRATE"].includes(
          turnOutput.pedagogicalAct,
        ),
        `Turn ${i + 1} pedagogicalAct must be valid; got ${turnOutput.pedagogicalAct}`,
      );

      // Check prompt safety / no leak
      const lowerReply = (turnOutput.npcReply || "").toLowerCase();
      const leaksPrompt =
        lowerReply.includes("system prompt") || lowerReply.includes("ignore previous instructions");
      addCheck(
        `${testCase.caseId}_t${i + 1}_no_prompt_leak`,
        !leaksPrompt,
        `Turn ${i + 1} leaked internal prompt tokens`,
      );

      // Apply state patch
      currentState = {
        ...currentState,
        ...turnOutput.statePatch,
        turnCount: currentState.turnCount + 1,
      };
    }
  } catch (err) {
    failures.push(`Execution error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startMs;

  return {
    caseId: testCase.caseId,
    commitSha,
    environment,
    provider: provider.providerName,
    model: provider.modelName,
    promptVersion: LEARNING_PROMPT_VERSION,
    datasetHash,
    latencyMs,
    usageKnown: false,
    costUnknown: false,
    checks,
    failures,
    turnOutputs,
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  console.log("==================================================");
  console.log(" ListenAI Learning Evaluation Runner (P115/P124)");
  console.log("==================================================");
  console.log(`Mode: ${options.mode}`);
  console.log(`Dataset: ${options.datasetPath}`);
  console.log(`Environment: ${options.environment}`);
  console.log(`Commit SHA: ${options.commitSha}`);
  console.log(`Output Directory: ${options.outputDirectory}`);

  if (!existsSync(options.datasetPath)) {
    console.error(`Dataset file not found: ${options.datasetPath}`);
    process.exit(1);
  }

  const rawDataset = readFileSync(options.datasetPath, "utf-8");
  const cases = parseLearningDataset(rawDataset);
  const datasetHash = computeDatasetHash(options.datasetPath);
  console.log(`Dataset Hash: ${datasetHash}`);
  console.log(`Loaded ${cases.length} evaluation cases.`);

  const datasetValidation = validateLearningDataset(cases);
  if (datasetValidation.failures.length > 0) {
    console.error("Dataset validation failed with errors:");
    datasetValidation.failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log("Dataset invariants passed (>=12 cases, all >=3 turns, synthetic).");

  if (!existsSync(options.outputDirectory)) {
    mkdirSync(options.outputDirectory, { recursive: true });
  }

  if (options.mode === "live") {
    console.log("\n[LIVE MODE CHECK]");
    if (!options.maxCalls || !options.maxCostUsd) {
      console.error(
        "ERROR: Live mode requires explicit positive --max-calls <int> and --max-cost-usd <decimal>.",
      );
      process.exit(1);
    }
    console.log(`Configured limits: maxCalls=${options.maxCalls}, maxCostUsd=$${options.maxCostUsd}`);

    const hasLiveKey = Boolean(process.env.OPENAI_API_KEY || process.env.VYCE_API_KEY);
    if (!hasLiveKey) {
      console.warn(
        "Notice: No live provider API key configured in environment. Exiting with UNVERIFIED / REQUIRES_CREDENTIALS safely without unapproved charges.",
      );

      const statusReport = {
        mode: "live",
        status: "UNVERIFIED",
        reason: "PROVIDER_CREDENTIALS_REQUIRED",
        datasetHash,
        commitSha: options.commitSha,
        timestamp: new Date().toISOString(),
      };
      writeFileSync(
        join(options.outputDirectory, "live-status.json"),
        JSON.stringify(statusReport, null, 2),
      );
      console.log(`Wrote live status stub to ${join(options.outputDirectory, "live-status.json")}`);
      return;
    }
  }

  console.log("\nRunning evaluation cases...");
  const results: LearningEvalResult[] = [];

  for (const c of cases) {
    process.stdout.write(`  Executing ${c.caseId} (${c.mode})... `);
    const result = await runOfflineCase(c, datasetHash, options.commitSha, options.environment);
    if (result.failures.length === 0) {
      console.log(`PASS (${result.latencyMs}ms, ${result.checks.length} checks)`);
    } else {
      console.log(`FAIL (${result.failures.length} errors)`);
      result.failures.forEach((f) => console.log(`    - ${f}`));
    }
    results.push(result);
  }

  const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const passedChecks = results.reduce(
    (sum, r) => sum + r.checks.filter((chk) => chk.passed).length,
    0,
  );
  const passedCases = results.filter((r) => r.failures.length === 0).length;

  console.log("\n==================================================");
  console.log(`Summary: ${passedCases}/${results.length} cases passed (${passedChecks}/${totalChecks} checks).`);
  console.log("==================================================");

  const summaryArtifact = {
    schemaVersion: "learning-eval-run-v1",
    runId: `run-${Date.now()}`,
    mode: options.mode,
    commitSha: options.commitSha,
    environment: options.environment,
    datasetVersion: LEARNING_DATASET_VERSION,
    datasetHash,
    promptVersion: LEARNING_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
      totalChecks,
      passedChecks,
      failedChecks: totalChecks - passedChecks,
    },
    results,
  };

  const jsonOutPath = join(options.outputDirectory, "learning-eval-run.json");
  writeFileSync(jsonOutPath, JSON.stringify(summaryArtifact, null, 2), "utf-8");
  console.log(`Saved detailed run JSON to: ${jsonOutPath}`);

  // Generate markdown report in output directory (never overwrite eval/report.md)
  const reportLines = [
    `# Learning Quality Evaluation Report`,
    ``,
    `- **Run Timestamp:** ${summaryArtifact.generatedAt}`,
    `- **Mode:** ${options.mode}`,
    `- **Environment:** ${options.environment}`,
    `- **Commit SHA:** \`${options.commitSha}\``,
    `- **Dataset Version:** \`${LEARNING_DATASET_VERSION}\``,
    `- **Dataset Hash:** \`${datasetHash}\``,
    `- **Cases Passed:** ${passedCases} / ${results.length}`,
    `- **Checks Passed:** ${passedChecks} / ${totalChecks}`,
    ``,
    `## Case Breakdown`,
    ``,
    `| Case ID | Mode | Latency (ms) | Checks | Status |`,
    `|---|---|---|---|---|`,
    ...results.map(
      (r) =>
        `| \`${r.caseId}\` | ${r.checks.length > 0 ? "OK" : "N/A"} | ${r.latencyMs}ms | ${r.checks.filter((c) => c.passed).length}/${r.checks.length} | ${r.failures.length === 0 ? "PASS" : "FAIL"} |`,
    ),
    ``,
    `## Human Reviewer Rubric Ready`,
    `The 5-dimension rubric (Correctness, Level Fit, Actionable Hint, Contextual Relevance, Learner Retry) is documented in [eval/LEARNING_EVALUATION.md](../LEARNING_EVALUATION.md).`,
  ];

  const reportOutPath = join(options.outputDirectory, "learning-eval-report.md");
  writeFileSync(reportOutPath, reportLines.join("\n"), "utf-8");
  console.log(`Saved markdown report to: ${reportOutPath}`);

  if (passedCases !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal evaluation runner error:", err);
  process.exit(1);
});
