/**
 * Server-curated voice script for an AI turn (Plan14 SPEC-P140 §3).
 *
 * The AI turn stores the tutor's structured output. The voice layer must not
 * read that JSON ad hoc on the client: which parts are voiced, in which
 * language, at what rate and, above all, which parts are NEVER voiced is a
 * pedagogical contract. This module is that contract.
 *
 * Invariants:
 * - The learner's erroneous text (`detectedError.actual`) is never voiced.
 *   The voice models only correct English.
 * - `RECAST` voices the corrected form slowly, once, and only when it is a real
 *   phrase (two or more words) that differs from what the learner said.
 * - NPC lines are English only; a Vietnamese sentence that slipped into
 *   `npcReply` is moved to the coach voice rather than read with an English
 *   voice.
 */

import { prepareSpokenText, type SpokenLang } from "./spoken-text";

export type VoiceLineRole = "NPC" | "RECAST" | "COACH";

export interface VoiceLine {
  role: VoiceLineRole;
  lang: SpokenLang;
  text: string;
  /** Playback rate relative to the voice's natural speed. */
  rate: number;
}

export interface VoiceScript {
  version: "v1";
  lines: VoiceLine[];
}

export const VOICE_SCRIPT_VERSION = "v1" as const;
export const NPC_RATE = 0.95;
export const RECAST_RATE = 0.82;
export const COACH_RATE = 1;

interface TurnLike {
  npcReply?: unknown;
  coachMessage?: unknown;
  detectedError?: { expected?: unknown; actual?: unknown } | null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sameSentence(a: string, b: string) {
  const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  return normalise(a) === normalise(b);
}

/**
 * Build the script for one AI turn. Returns `null` when the content is not a
 * tutor output (legacy string turns are voiced by the client's own curated path).
 */
export function buildTurnVoiceScript(content: unknown): VoiceScript | null {
  if (!content || typeof content !== "object") return null;
  const turn = content as TurnLike;
  const npcReply = asString(turn.npcReply);
  const coachMessage = asString(turn.coachMessage);
  if (!npcReply && !coachMessage) return null;

  const lines: VoiceLine[] = [];

  const npc = prepareSpokenText(npcReply, "en");
  for (const line of npc.lines) {
    if (line.lang === "en") lines.push({ role: "NPC", lang: "en", text: line.text, rate: NPC_RATE });
    else lines.push({ role: "COACH", lang: "vi", text: line.text, rate: COACH_RATE });
  }

  const expected = asString(turn.detectedError?.expected);
  const actual = asString(turn.detectedError?.actual);
  if (expected && wordCount(expected) >= 2 && !sameSentence(expected, actual)) {
    const recast = prepareSpokenText(expected, "en");
    for (const line of recast.lines) {
      if (line.lang === "en") lines.push({ role: "RECAST", lang: "en", text: line.text, rate: RECAST_RATE });
    }
  }

  const coach = prepareSpokenText(coachMessage, "vi");
  for (const line of coach.lines) {
    lines.push({ role: "COACH", lang: line.lang, text: line.text, rate: COACH_RATE });
  }

  return lines.length ? { version: VOICE_SCRIPT_VERSION, lines } : null;
}

/** The English lines a learner may be asked to repeat after the AI. */
export function repeatableLines(script: VoiceScript | null | undefined) {
  return (script?.lines ?? []).filter((line) => line.lang === "en" && (line.role === "NPC" || line.role === "RECAST"));
}
