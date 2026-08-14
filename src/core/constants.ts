/**
 * Core constants and configuration for all learning algorithms.
 * All formulas, weights, and thresholds are centralized here.
 */

// ── Mastery Update Formula ───────────────────────────
export const MASTERY_OLD_WEIGHT = 0.8;
export const MASTERY_NEW_WEIGHT = 0.2;
export const HINT_PENALTY = 0.03;
export const REPLAY_PENALTY_PER_REPLAY = 0.01;
export const MAX_REPLAY_PENALTY = 0.1;
export const MASTERY_MIN = 0;
export const MASTERY_MAX = 1;
export const MASTERY_INITIAL = 0.5;

// ── Recommendation Weights ───────────────────────────
export const REC_LEVEL_MATCH = 0.25;
export const REC_WEAKNESS_MATCH = 0.30;
export const REC_VOCAB_NEED = 0.20;
export const REC_TOPIC_PREFERENCE = 0.10;
export const REC_NOVELTY = 0.10;
export const REC_TEACHER_PRIORITY = 0.05;

// ── SM-2 Spaced Repetition ───────────────────────────
export const SM2_INITIAL_EASE = 2.5;
export const SM2_MIN_EASE = 1.3;
export const SM2_EASE_AGAIN_DELTA = -0.2;
export const SM2_EASE_HARD_DELTA = -0.15;
export const SM2_EASE_GOOD_DELTA = 0;
export const SM2_EASE_EASY_DELTA = 0.15;
export const SM2_INTERVAL_AGAIN_MINUTES = 10; // 10 minutes
export const SM2_INTERVAL_HARD_HOURS = 1;
export const SM2_INTERVAL_GOOD_DAYS = 1;
export const SM2_INTERVAL_EASY_DAYS = 3;

// ── Assessment Score Calculation ─────────────────────
export const ASSESSMENT_EXACT_ACCURACY_WEIGHT = 0.4;
export const ASSESSMENT_WORD_ACCURACY_WEIGHT = 0.3;
export const ASSESSMENT_SPELLING_ACCURACY_WEIGHT = 0.3;

// ── Text Normalization ───────────────────────────────
export const NORMALIZE_LOWERCASE = true;
export const NORMALIZE_PUNCTUATION = true;
export const NORMALIZE_WHITESPACE = true;
export const NORMALIZE_UNICODE = true; // NFKC

// ── Levenshtein Threshold ────────────────────────────
export const SPELLING_LEVENSHTEIN_THRESHOLD = 0.3; // normalized distance

// ── Skill Keys ───────────────────────────────────────
export const SKILL_LISTENING = "listening";
export const SKILL_VOCABULARY = "vocabulary";
export const SKILL_SPELLING = "spelling";
export const SKILL_FUNCTION_WORDS = "function_words";
export const SKILL_SEGMENTATION = "segmentation";
export const SKILL_FINAL_SOUNDS = "final_sounds";
