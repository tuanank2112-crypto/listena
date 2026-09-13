import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseQualityDataset,
  QUALITY_DATASET_VERSION,
  QUALITY_PROMPT_VERSION,
  type ValidationCheck,
  validateQualityDataset,
} from "./quality-contract";

type OfflineCaseResult = {
  caseId: string;
  mode: "offline";
  promptVersion: string;
  datasetHash: string;
  latencyMs: number;
  usageKnown: false;
  checks: ValidationCheck[];
  failures: string[];
};

type OfflineRunArtifact = {
  schemaVersion: "quality-eval-run-v1";
  runId: string;
  mode: "offline";
  commitSha: string;
  environment: string;
  dataSource: {
    dataset: string;
    datasetVersion: string;
    datasetHash: string;
  };
  promptVersion: string;
  generatedAt: string;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    datasetChecksPassed: number;
    datasetChecksFailed: number;
  };
  datasetChecks: ValidationCheck[];
  results: OfflineCaseResult[];
};

type RunnerOptions = {
  datasetPath: string;
  outputDirectory: string;
  dryRun: boolean;
  environment: string;
  commitSha?: string;
};

const DEFAULT_DATASET_PATH = "eval/quality-cases.v1.jsonl";
const DEFAULT_OUTPUT_DIRECTORY = "eval/runs";

function usage() {
  return [
    "Usage: npm run eval:quality -- [--dry-run] [--dataset <path>] [--out-dir <path>] [--environment <name>] [--commit <sha>]",
    "",
    "The offline runner validates only versioned dataset and evidence-policy invariants.",
    "It does not call an AI provider or measure linguistic quality, learner outcomes, cost, or token usage.",
  ].join("\n");
}

function parseOptions(args: string[]): RunnerOptions {
  const options: RunnerOptions = {
    datasetPath: DEFAULT_DATASET_PATH,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    dryRun: false,
    environment: process.env.EVAL_ENVIRONMENT?.trim() || "local",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (
      argument === "--dataset" ||
      argument === "--out-dir" ||
      argument === "--environment" ||
      argument === "--commit"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--dataset") {
        options.datasetPath = value;
      } else if (argument === "--out-dir") {
        options.outputDirectory = value;
      } else if (argument === "--environment") {
        options.environment = value;
      } else {
        options.commitSha = value;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }

  return options;
}

function resolveCommitSha(explicitCommit: string | undefined): string | undefined {
  const candidate =
    explicitCommit ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    undefined;
  if (candidate?.trim()) {
    return candidate.trim();
  }

  const git = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (git.status === 0 && typeof git.stdout === "string" && git.stdout.trim()) {
    return git.stdout.trim();
  }
  return undefined;
}

function makeRunId(datasetHash: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `quality-v1-${timestamp}-${process.pid}-${datasetHash.slice(0, 12)}`;
}

function renderMarkdown(artifact: OfflineRunArtifact) {
  const failedDatasetChecks = artifact.datasetChecks.filter(
    (check) => !check.passed,
  );
  const failedResults = artifact.results.filter(
    (result) => result.failures.length > 0,
  );
  const lines = [
    "# Offline quality-contract evaluation",
    "",
    `- Run: \`${artifact.runId}\``,
    `- Commit: \`${artifact.commitSha}\``,
    `- Environment: \`${artifact.environment}\``,
    `- Dataset: \`${artifact.dataSource.dataset}\` (${artifact.dataSource.datasetVersion})`,
    `- Dataset SHA-256: \`${artifact.dataSource.datasetHash}\``,
    `- Prompt contract: \`${artifact.promptVersion}\``,
    `- Generated: ${artifact.generatedAt}`,
    "",
    `Result: ${artifact.summary.passedCases}/${artifact.summary.totalCases} case contracts passed; ${artifact.summary.datasetChecksPassed}/${artifact.summary.datasetChecksPassed + artifact.summary.datasetChecksFailed} dataset checks passed.`,
    "",
    "This is an offline structural-contract run. It does not call a provider, assess response language quality, claim token usage/cost, or establish learner efficacy.",
    "",
    "## Dataset checks",
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...artifact.datasetChecks.map(
      (check) =>
        `| ${check.id} | ${check.passed ? "PASS" : "FAIL"} | ${check.message} |`,
    ),
    "",
    "## Case contracts",
    "",
    "| Case | Result | Failed checks |",
    "|---|---|---|",
    ...artifact.results.map(
      (result) =>
        `| ${result.caseId} | ${result.failures.length === 0 ? "PASS" : "FAIL"} | ${result.failures.join("; ") || "—"} |`,
    ),
  ];

  if (failedDatasetChecks.length > 0 || failedResults.length > 0) {
    lines.push(
      "",
      "## Required follow-up",
      "",
      "Fix and version the affected dataset contract before interpreting any live or reviewer result. Do not mark a failed offline contract as a quality pass.",
    );
  }

  return `${lines.join("\n")}\n`;
}

function writeArtifact(
  artifact: OfflineRunArtifact,
  outputDirectory: string,
): { jsonPath: string; markdownPath: string } {
  const absoluteDirectory = resolve(outputDirectory);
  mkdirSync(absoluteDirectory, { recursive: true });
  const basePath = join(absoluteDirectory, artifact.runId);
  const jsonPath = `${basePath}.json`;
  const markdownPath = `${basePath}.md`;
  if (existsSync(jsonPath) || existsSync(markdownPath)) {
    throw new Error(`Refusing to overwrite an existing run artifact: ${basePath}`);
  }

  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  writeFileSync(markdownPath, renderMarkdown(artifact), {
    encoding: "utf8",
    flag: "wx",
  });
  return { jsonPath, markdownPath };
}

export function runOfflineQualityEvaluation(
  options: RunnerOptions,
): OfflineRunArtifact {
  const startedAt = Date.now();
  const datasetPath = resolve(options.datasetPath);
  const source = readFileSync(datasetPath, "utf8");
  const datasetHash = createHash("sha256").update(source).digest("hex");
  const records = parseQualityDataset(source);
  const validation = validateQualityDataset(records);
  const commitSha = resolveCommitSha(options.commitSha);

  if (!commitSha && !options.dryRun) {
    throw new Error(
      "Refusing to persist an evaluation artifact without an exact commit SHA. Supply --commit <sha> or run from a Git checkout.",
    );
  }

  const results: OfflineCaseResult[] = validation.cases.map((entry) => {
    const failures = entry.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.id}: ${check.message}`);
    return {
      caseId: entry.caseId,
      mode: "offline",
      promptVersion: QUALITY_PROMPT_VERSION,
      datasetHash,
      latencyMs: Date.now() - startedAt,
      usageKnown: false,
      checks: entry.checks,
      failures,
    };
  });
  const datasetChecksPassed = validation.checks.filter(
    (check) => check.passed,
  ).length;
  const artifact: OfflineRunArtifact = {
    schemaVersion: "quality-eval-run-v1",
    runId: makeRunId(datasetHash),
    mode: "offline",
    commitSha: commitSha ?? "UNAVAILABLE_DRY_RUN",
    environment: options.environment,
    dataSource: {
      dataset: relative(process.cwd(), datasetPath).replaceAll("\\", "/"),
      datasetVersion: QUALITY_DATASET_VERSION,
      datasetHash,
    },
    promptVersion: QUALITY_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCases: results.length,
      passedCases: results.filter((result) => result.failures.length === 0).length,
      failedCases: results.filter((result) => result.failures.length > 0).length,
      datasetChecksPassed,
      datasetChecksFailed: validation.checks.length - datasetChecksPassed,
    },
    datasetChecks: validation.checks,
    results,
  };

  if (!options.dryRun) {
    const output = writeArtifact(artifact, options.outputDirectory);
    console.log(`Wrote ${relative(process.cwd(), output.jsonPath)}`);
    console.log(`Wrote ${relative(process.cwd(), output.markdownPath)}`);
  }

  console.log(
    `Offline quality contract: ${artifact.summary.passedCases}/${artifact.summary.totalCases} cases, ${artifact.summary.datasetChecksPassed}/${artifact.summary.datasetChecksPassed + artifact.summary.datasetChecksFailed} dataset checks.`,
  );
  if (artifact.summary.failedCases > 0 || artifact.summary.datasetChecksFailed > 0) {
    const failedCaseIds = artifact.results
      .filter((result) => result.failures.length > 0)
      .map((result) => result.caseId);
    const failedDatasetChecks = artifact.datasetChecks
      .filter((check) => !check.passed)
      .map((check) => check.id);
    console.error(
      `Failed case contracts: ${failedCaseIds.join(", ") || "none"}; failed dataset checks: ${failedDatasetChecks.join(", ") || "none"}.`,
    );
  }
  return artifact;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const artifact = runOfflineQualityEvaluation(options);
  if (
    artifact.summary.failedCases > 0 ||
    artifact.summary.datasetChecksFailed > 0
  ) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Quality evaluation failed: ${message}`);
    process.exitCode = 1;
  }
}
