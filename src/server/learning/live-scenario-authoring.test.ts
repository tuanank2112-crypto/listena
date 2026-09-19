/**
 * Plan23 — the one path a deterministic provider cannot cover: a learner names
 * a situation in Vietnamese and the REAL model writes it.
 *
 * Every other test in this repo runs against a stub, which is why nothing ever
 * noticed that a generous generation — five grammar points where four are
 * allowed, or a grammar label longer than a vocabulary item may be — made the
 * route answer "Chưa tạo được chủ đề lúc này" to a learner who had asked for
 * something perfectly ordinary. It took two live calls to find that. Hence this
 * file: the roadmap asked for a smoke that actually touches the provider.
 *
 * OPT-IN, never part of a gate run: it spends real AI calls and inherits the
 * gateway's own flakiness, and a flaky provider inside the unit suite would
 * teach everyone to ignore a red run. Requires BOTH a configured provider and
 *
 *   LISTENAI_LIVE_AI_PROBE=1
 *
 * Run it with (Git Bash). The flag matters: vitest hides console output from
 * a passing test, and the point of this probe is reading what the model wrote.
 *
 *   set -a && . ./.env && set +a
 *   LISTENAI_LIVE_AI_PROBE=1 npx vitest run --disableConsoleIntercept \
 *     src/server/learning/live-scenario-authoring.test.ts
 *
 * It builds a throwaway SQLite database from the migrations in the OS temp
 * directory and deletes it afterwards. `prisma/dev.db` is never opened.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live =
  process.env.LISTENAI_LIVE_AI_PROBE === "1"
  && process.env.AI_PROVIDER === "vyce"
  && Boolean(process.env.VYCE_API_KEY);

/**
 * The gateway returns HTTP 524 after ~125s now and then, on an input that
 * succeeds when sent again (observed three times on 2026-09-20; the user has
 * accepted gateway latency as a trait of Vyce). Retrying here is not hiding a
 * defect: each attempt reports the provider's own classification, so a real
 * rejection — a 400, a bad key, a schema failure — still fails loudly and says
 * what it was.
 */
const ATTEMPTS = 3;

let directory = "";

function report(label: string, value: unknown) {
  console.log(`  ${label.padEnd(22)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

function classify(error: unknown): string {
  const details = error as { code?: string; details?: Record<string, unknown> };
  return `code=${details.code ?? "none"} reason=${String(details.details?.reason ?? "none")}`;
}

async function withRetry<T>(label: string, attempt: () => Promise<T>): Promise<T> {
  for (let index = 1; index <= ATTEMPTS; index += 1) {
    const startedAt = Date.now();
    try {
      const value = await attempt();
      report(`${label} #${index}`, `ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return value;
    } catch (error) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      report(`${label} #${index}`, `FAILED after ${seconds}s ${classify(error)}`);
      if (index === ATTEMPTS) throw error;
    }
  }
  throw new Error("unreachable");
}

describe.runIf(live)("live scenario authoring", () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), "listena-live-probe-"));
    if (path.dirname(directory) !== path.resolve(tmpdir())) {
      throw new Error("Refusing to build a probe database outside a temp directory");
    }
    const databaseFile = path.join(directory, "probe.db");
    process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`;
    // A hosted target must never be reachable from a test that writes freely.
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;

    closeSync(openSync(databaseFile, "a")); // Prisma on Windows wants the file first.
    for (const args of [
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    ]) {
      execFileSync(process.execPath, args, { stdio: "pipe", env: process.env });
    }
  });

  afterAll(() => {
    // Windows holds the SQLite file briefly after disconnect; a failed cleanup
    // must not mask the result of the probe itself.
    try {
      if (directory) rmSync(directory, { recursive: true, force: true });
    } catch {
      // The OS will clear its own temp directory.
    }
  });

  it("writes a mission from the learner's own sentence, then plays it", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { createLearnerMissionScenario, listLearnerMissionScenarios, loadCustomMissionTemplate } =
      await import("@/server/learning/mission-scenarios");
    const { createLearningSession, submitLearningTurn } = await import("@/server/learning/service");
    const { isKnownScenarioKey } = await import("@/server/ai/mission-templates");

    // The learner this situation is written for: what they said they care about,
    // the mistake family they keep repeating, and words they keep missing.
    const learner = await prisma.user.create({
      data: {
        name: "Live Probe Learner",
        email: `live-probe-${Date.now()}@example.invalid`,
        password: "not-a-login",
        emailVerifiedAt: new Date(),
        learnerProfile: { create: { estimatedCefrLevel: "A2", preferredTopics: "chơi game, bóng đá" } },
        learnerMemory: {
          create: {
            // Two spellings of one family: Plan21's aggregation must fold them
            // into a single Vietnamese label before the prompt sees them.
            errorsJson: JSON.stringify([
              { errorType: "tense", count: 3, lastEvidenceId: "probe-1" },
              { errorType: "verb_tense", count: 2, lastEvidenceId: "probe-2" },
            ]),
          },
        },
      },
    });
    const stranger = await prisma.user.create({
      data: { name: "Stranger", email: `stranger-${Date.now()}@example.invalid`, password: "x" },
    });

    const words = await prisma.vocabularyItem.findMany({ take: 3, orderBy: { lemma: "asc" } });
    for (const word of words) {
      await prisma.vocabularyMastery.create({
        data: { userId: learner.id, vocabularyItemId: word.id, incorrectCount: 3, masteryScore: 0.2 },
      });
    }

    const scenario = await withRetry("authoring", () =>
      createLearnerMissionScenario({
        userId: learner.id,
        prompt: "tôi muốn tập nói chuyện với đồng đội khi chơi game online",
      }));
    report("title", scenario.title);
    report("npc", `${scenario.npcName} — ${scenario.npcRole}`);
    report("summaryVi", scenario.summaryVi);
    report("targetVocabulary", scenario.targetVocabulary);

    // The learner asked in Vietnamese and gets a Vietnamese line back about it;
    // everything the tutor will speak is English.
    expect(scenario.summaryVi).toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
    expect(scenario.targetVocabulary.length).toBeGreaterThanOrEqual(3);

    const template = await loadCustomMissionTemplate(learner.id, scenario.key);
    report("openingLine", template?.openingLine);
    report("firstPrompt", template?.firstPrompt);
    expect(isKnownScenarioKey(scenario.key)).toBe(true);
    // Recognising the shape of a key is not an ownership check: somebody else's
    // key resolves to null and fails exactly like an invented one.
    expect(await loadCustomMissionTemplate(stranger.id, scenario.key)).toBeNull();
    expect(await listLearnerMissionScenarios(learner.id)).toHaveLength(1);
    // The turn budget is the server's, whatever the model would have liked.
    expect(template?.maxTurns).toBe(7);
    expect(template?.openingLine).not.toBe(template?.firstPrompt);

    const started = await withRetry("session start", () =>
      createLearningSession(learner.id, {
        clientStartId: randomUUID(),
        mode: "MISSION",
        scenarioKey: scenario.key,
      }));
    const sessionId = started.session.id;

    const turn = await withRetry("graded turn", () =>
      submitLearningTurn(learner.id, sessionId, {
        clientTurnId: `probe-turn-${randomUUID()}`,
        // A deliberate past-tense mistake: the family this learner repeats.
        content: "Yesterday we play a match and i lose my internet",
        hintCount: 0,
        replayCount: 0,
      }));

    const aiTurn = turn.aiTurn as unknown as {
      content: { npcReply?: string; coachMessage?: string; detectedError?: unknown; score?: number };
      voiceScript?: { lines: Array<{ role: string; lang: string; text: string }> } | null;
    } | null;
    const detail = aiTurn?.content ?? {};
    report("npcReply", detail.npcReply);
    report("coachMessage", detail.coachMessage);
    report("detectedError", detail.detectedError);
    report("score", detail.score);

    // The character answers inside the situation the learner invented.
    expect(detail.npcReply).toBeTruthy();

    const lines = aiTurn?.voiceScript?.lines ?? [];
    report("voiceScript", lines.map((entry) => `${entry.role}/${entry.lang}`));
    // Plan23 SPEC-P231: the Coach's explanation is never spoken unasked. The
    // assertion is on the text rather than the role, because a Vietnamese
    // fragment inside an English NPC reply legitimately becomes a COACH line and
    // that is not the explanation.
    const spoken = lines.map((entry) => entry.text).join(" ");
    if (detail.coachMessage) expect(spoken).not.toContain(detail.coachMessage);

    await prisma.$disconnect();
  }, 600_000);
});
