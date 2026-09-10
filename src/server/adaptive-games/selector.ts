import { cleanVocabularyMeaning } from "@/core/text/vocabulary";
import { normalizeText } from "@/core/text/normalize";
import type {
  AdaptiveGameAnswerValidator,
  AdaptiveGameModeInput,
  PublicAdaptiveGameRoundPayload,
} from "./contracts";
import { serializeRound } from "./contracts";

export const ADAPTIVE_GAME_MIN_ROUNDS = 6;
export const ADAPTIVE_GAME_MAX_ROUNDS = 8;

export interface AdaptiveGameCandidate {
  id: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  exampleSentence: string | null;
  audioUrl: string | null;
  cefrLevel: string;
  /** Absolute distance from the learner's current (not yet certified) prior. */
  levelDistance?: number;
  mastery?: {
    masteryScore: number;
    nextReviewAt: Date | null;
  };
  recentEvidence?: {
    score: number;
    createdAt: Date;
  };
}

export interface SelectedAdaptiveGameCandidate extends AdaptiveGameCandidate {
  priority: number;
}

export interface SerializedAdaptiveGameRound {
  position: number;
  vocabularyItemId: string;
  publicJson: string;
  validatorJson: string;
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/**
 * A lower profile mastery gets fewer distractors and simpler material. The
 * selector itself remains deterministic so it is auditable and testable; no
 * LLM call happens while issuing or answering a closed game round.
 */
export function adaptiveDifficulty(profileMastery: number) {
  return clamp(0.2 + clamp(profileMastery) * 0.7, 0.2, 0.9);
}

export function selectAdaptiveGameCandidates(
  candidates: AdaptiveGameCandidate[],
  now: Date,
  count = ADAPTIVE_GAME_MAX_ROUNDS,
) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      priority: candidatePriority(candidate, now),
    }))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, Math.min(count, ADAPTIVE_GAME_MAX_ROUNDS));
}

function candidatePriority(candidate: AdaptiveGameCandidate, now: Date) {
  const mastery = candidate.mastery?.masteryScore ?? 0.3;
  const isDue = candidate.mastery?.nextReviewAt !== null
    && candidate.mastery?.nextReviewAt !== undefined
    && candidate.mastery.nextReviewAt <= now;
  const evidenceAgeMs = candidate.recentEvidence
    ? now.getTime() - candidate.recentEvidence.createdAt.getTime()
    : Number.POSITIVE_INFINITY;
  const recentlyMissed = candidate.recentEvidence !== undefined
    && candidate.recentEvidence.score < 0.6
    && evidenceAgeMs <= 14 * 24 * 60 * 60 * 1000;
  const recentlyCorrect = candidate.recentEvidence !== undefined
    && candidate.recentEvidence.score >= 0.8
    && evidenceAgeMs <= 24 * 60 * 60 * 1000;

  // Due reviews lead, followed by recent misses/new words, then the weakest
  // available vocabulary. Recently-correct words are deliberately demoted.
  return (isDue ? 100 : 0)
    + (recentlyMissed ? 35 : 0)
    + (!candidate.mastery ? 14 : 0)
    + (1 - clamp(mastery)) * 24
    - (recentlyCorrect ? 8 : 0)
    - (candidate.levelDistance ?? 0) * 4;
}

export function buildAdaptiveGameRounds(input: {
  mode: AdaptiveGameModeInput;
  selected: SelectedAdaptiveGameCandidate[];
  candidatePool: AdaptiveGameCandidate[];
  difficulty: number;
  tokenFactory?: () => string;
  random?: () => number;
}): SerializedAdaptiveGameRound[] {
  const tokenFactory = input.tokenFactory ?? (() => crypto.randomUUID());
  const random = input.random ?? Math.random;
  return input.selected.map((candidate, position) => {
    const { content, validator } = buildRound({
      mode: input.mode,
      candidate,
      candidatePool: input.candidatePool,
      difficulty: input.difficulty,
      tokenFactory,
      random,
    });
    const serialized = serializeRound(content, validator);
    return {
      position,
      vocabularyItemId: candidate.id,
      ...serialized,
      // Keep the position out of JSON: it belongs to the relational row.
    };
  });
}

function buildRound(input: {
  mode: AdaptiveGameModeInput;
  candidate: AdaptiveGameCandidate;
  candidatePool: AdaptiveGameCandidate[];
  difficulty: number;
  tokenFactory: () => string;
  random: () => number;
}): {
  content: PublicAdaptiveGameRoundPayload;
  validator: AdaptiveGameAnswerValidator;
} {
  const { candidate, difficulty } = input;
  const meaning = cleanVocabularyMeaning(candidate.meaningVi, candidate.exampleSentence);

  if (input.mode === "MATCH") {
    const wordToken = input.tokenFactory();
    // One word card plus 1–3 meaning distractors keeps the matching board
    // approachable at a low level without ever revealing a single obvious
    // pair.
    const optionCount = difficulty < 0.45 ? 2 : difficulty < 0.75 ? 3 : 4;
    const options = quizOptions(candidate, input.candidatePool, optionCount, input.random);
    if (options.length < 2) {
      throw new Error("Not enough distinct matching options to issue a round");
    }
    const optionCards = options.map((label) => ({
      token: input.tokenFactory(),
      kind: "meaning" as const,
      label,
    }));
    const correctMeaningToken = optionCards.find(
      (card) => normalizeText(card.label) === normalizeText(meaning),
    )?.token;
    if (!correctMeaningToken) {
      throw new Error("Matching options did not contain the expected answer");
    }
    return {
      content: {
        kind: "match",
        prompt: "Ghép từ với nghĩa",
        cards: shuffle(
          [{ token: wordToken, kind: "word" as const, label: candidate.displayText }, ...optionCards],
          input.random,
        ),
        difficulty,
      },
      validator: { kind: "match", expectedTokens: [wordToken, correctMeaningToken] },
    };
  }

  if (input.mode === "SPELL") {
    return {
      content: {
        kind: "spell",
        prompt: "Nghe và viết từ",
        meaning,
        audioUrl: publicAudioUrl(candidate.audioUrl),
        difficulty,
      },
      validator: {
        kind: "spell",
        normalizedExpectedAnswer: normalizeText(candidate.displayText),
      },
    };
  }

  const optionCount = difficulty < 0.45 ? 3 : difficulty < 0.75 ? 4 : 5;
  const options = quizOptions(candidate, input.candidatePool, optionCount, input.random);
  if (options.length < 3) {
    throw new Error("Not enough distinct quiz options to issue a round");
  }
  return {
    content: {
      kind: "quiz",
      prompt: "Chọn nghĩa đúng",
      word: candidate.displayText,
      ipa: candidate.ipa,
      options,
      ...(difficulty >= 0.75 && candidate.exampleSentence
        ? { context: candidate.exampleSentence.slice(0, 240) }
        : {}),
      difficulty,
    },
    validator: {
      kind: "quiz",
      normalizedExpectedAnswer: normalizeText(meaning),
    },
  };
}

function quizOptions(
  target: AdaptiveGameCandidate,
  candidatePool: AdaptiveGameCandidate[],
  optionCount: number,
  random: () => number,
) {
  const targetMeaning = cleanVocabularyMeaning(target.meaningVi, target.exampleSentence);
  const seen = new Set([normalizeText(targetMeaning)]);
  const distractors: string[] = [];

  for (const candidate of candidatePool) {
    if (candidate.id === target.id) continue;
    const meaning = cleanVocabularyMeaning(candidate.meaningVi, candidate.exampleSentence);
    const normalized = normalizeText(meaning);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    distractors.push(meaning);
    if (distractors.length === optionCount - 1) break;
  }

  // The API refuses to create a run unless there are enough selectable words,
  // so this fallback only protects malformed duplicate dataset meanings.
  return shuffle([targetMeaning, ...distractors].slice(0, optionCount), random);
}

function shuffle<T>(items: T[], random: () => number) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function publicAudioUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}
