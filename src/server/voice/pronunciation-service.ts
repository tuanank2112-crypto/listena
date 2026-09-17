import "server-only";

import { scorePronunciation, type PronunciationResult } from "@/core/voice/pronunciation";
import { repeatableLines } from "@/core/voice/voice-script";
import { normalizeText } from "@/core/text/normalize";
import { toLearningSessionDto } from "@/server/learning/dto";
import { LearningSessionError, LearningSessionNotFoundError } from "@/server/learning/errors";
import { LearningSessionRepository } from "@/server/learning/repository";
import { recordLearningEvent } from "@/server/learning/service";

export interface PronunciationPracticeInput {
  clientAttemptId: string;
  expected: string;
  transcript: string;
  recognitionConfidence?: number | null;
  sessionId?: string;
}

export interface PronunciationPracticeOutcome {
  result: PronunciationResult;
  /** True when the practice was written to the session's event ledger. */
  recorded: boolean;
}

/** The line the learner repeated is not one the AI modelled in this session. */
export class VoiceLineNotInSessionError extends LearningSessionError {
  constructor() {
    super(
      "The repeated line does not belong to this learning session",
      "EXPECTED_NOT_IN_SESSION",
      400,
    );
  }
}

const repository = new LearningSessionRepository();

function sameLine(a: string, b: string) {
  return normalizeText(a) === normalizeText(b);
}

/**
 * Score a "repeat after me" attempt (Plan14 SPEC-P141 §4).
 *
 * Without a session the score is returned and nothing is stored. With a session
 * the expected line must be one of the server-curated NPC/RECAST lines of that
 * session (so a client cannot mint evidence for arbitrary text), and the score
 * is appended to the session's event ledger as `VOICE_PRACTICE` with the score
 * in percent. It deliberately writes no LearningEvidence and touches no
 * mastery: a word-level STT score is not yet trusted as skill evidence.
 */
export async function practicePronunciation(
  userId: string,
  input: PronunciationPracticeInput,
): Promise<PronunciationPracticeOutcome> {
  const result = scorePronunciation(input.expected, input.transcript, input.recognitionConfidence);
  if (!input.sessionId) return { result, recorded: false };

  const record = await repository.findOwned(userId, input.sessionId);
  if (!record) throw new LearningSessionNotFoundError();
  const session = toLearningSessionDto(record);
  const modelled = session.turns
    .filter((turn) => turn.actor === "AI")
    .flatMap((turn) => repeatableLines(turn.voiceScript).map((line) => line.text));
  if (!modelled.some((line) => sameLine(line, input.expected))) {
    throw new VoiceLineNotInSessionError();
  }

  await recordLearningEvent(userId, input.sessionId, {
    type: "VOICE_PRACTICE",
    value: Math.round(result.score * 100),
    clientEventId: `voice-${input.clientAttemptId}`,
  });
  return { result, recorded: true };
}
