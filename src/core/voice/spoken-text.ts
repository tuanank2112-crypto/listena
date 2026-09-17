/**
 * Curated spoken-text preparation (Plan14 SPEC-P140).
 *
 * The voice layer only ever voices text that has passed through this module.
 * It is a pure, deterministic filter that turns free model/lesson text into a
 * list of short, well-formed lines tagged with the language a voice must use.
 *
 * What it guarantees for a pronunciation model:
 * - no markdown, emoji, URLs, IPA notation or stage directions are voiced;
 * - each line is one sentence with terminal punctuation (stable intonation);
 * - English abbreviations and symbols are expanded to what a teacher would say;
 * - Vietnamese sentences never go to the English voice and vice versa.
 */

export type SpokenLang = "en" | "vi";

export interface SpokenLine {
  lang: SpokenLang;
  text: string;
}

export interface SpokenScript {
  lines: SpokenLine[];
  /** Fragments removed because nothing pronounceable remained. */
  dropped: string[];
}

/** A line longer than this is split at a clause boundary before synthesis. */
export const MAX_SPOKEN_LINE_CHARS = 240;

const VIETNAMESE_LETTERS = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/u;
const LATIN_LETTER = /\p{L}/u;
const PRONOUNCEABLE = /[\p{L}\p{N}]/u;
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const IPA = /\/[^/\n]{1,80}\//g;
const MARKDOWN_BOLD = /\*\*([^*\n]{1,200})\*\*|__([^_\n]{1,200})__/g;
const STAGE_DIRECTION = /\[[^\]]{0,120}\]|(?<![\p{L}\p{N}])\*[^*\n]{1,80}\*(?![\p{L}\p{N}])/gu;
const MARKDOWN_MARKS = /[*_`#>~]+/g;
const LIST_BULLET = /^\s*(?:[-•]|\d+[.)])\s+/gm;
const PLACEHOLDER = /_{2,}|\.{4,}|…{2,}/g;

/**
 * Expansions a teacher would read aloud. Only unambiguous forms are listed;
 * anything ambiguous ("St.", "No.") is left alone on purpose.
 *
 * Dotted abbreviations are expanded before sentence splitting so that "Mr."
 * cannot end a sentence; symbols are expanded per English sentence only.
 */
const DOTTED_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.g\./gi, "for example"],
  [/\bi\.e\./gi, "that is"],
  [/\betc\./gi, "et cetera"],
  [/\bvs\./gi, "versus"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miz"],
  [/\bDr\./g, "Doctor"],
  [/\b([ap])\.m\./gi, "$1 m"],
];

const ENGLISH_SYMBOLS: Array<[RegExp, string]> = [
  [/\bvs\b/gi, "versus"],
  [/&/g, " and "],
  [/%/g, " percent"],
  [/\+/g, " plus "],
  [/@/g, " at "],
  [/\$(\d+)/g, "$1 dollars"],
];

function normalizeTypography(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–—]/g, ", ")
    .replace(/\r\n?/g, "\n");
}

function stripUnspeakable(text: string) {
  return text
    .replace(URL, " ")
    .replace(IPA, " ")
    .replace(MARKDOWN_BOLD, "$1$2")
    .replace(STAGE_DIRECTION, " ")
    .replace(LIST_BULLET, "")
    .replace(PLACEHOLDER, " blank ")
    .replace(MARKDOWN_MARKS, " ")
    .replace(EMOJI, " ");
}

function applyExpansions(text: string, table: Array<[RegExp, string]>) {
  return table.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function collapse(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/"\s*"/g, " ")
    .trim();
}

/** Split into sentences at terminal punctuation or hard line breaks. */
function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongLine(line: string): string[] {
  if (line.length <= MAX_SPOKEN_LINE_CHARS) return [line];
  const clauses = line.split(/(?<=[,;:])\s+/);
  const output: string[] = [];
  let current = "";
  for (const clause of clauses) {
    const candidate = current ? `${current} ${clause}` : clause;
    if (candidate.length > MAX_SPOKEN_LINE_CHARS && current) {
      output.push(current);
      current = clause;
    } else {
      current = candidate;
    }
  }
  if (current) output.push(current);
  return output.flatMap((piece) => {
    if (piece.length <= MAX_SPOKEN_LINE_CHARS) return [piece];
    const words = piece.split(" ");
    const chunks: string[] = [];
    let chunk = "";
    for (const word of words) {
      const next = chunk ? `${chunk} ${word}` : word;
      if (next.length > MAX_SPOKEN_LINE_CHARS && chunk) {
        chunks.push(chunk);
        chunk = word;
      } else {
        chunk = next;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
}

/** A sentence must start with a capital letter and end with punctuation. */
function finishSentence(sentence: string) {
  const trimmed = sentence.replace(/^["'\s]+/, "").replace(/\s+$/, "");
  if (!trimmed) return "";
  const first = trimmed.charAt(0);
  const capitalised = first.toLocaleUpperCase("en") + trimmed.slice(1);
  return /[.!?]["')\]]*$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * Vietnamese is recognised by its diacritic letters. A sentence with Latin
 * letters and no diacritic is English even inside a Vietnamese coach message
 * (the model writes accented Vietnamese; unaccented English examples such as
 * "Try: I lost my bag." are common). Mixed sentences that contain any
 * Vietnamese letter are Vietnamese: an English voice reading "Tôi" teaches
 * nothing and a Vietnamese voice reading a few English words is tolerable.
 * The fallback only decides letterless lines such as bare numbers.
 */
export function detectSpokenLang(sentence: string, fallback: SpokenLang): SpokenLang {
  if (VIETNAMESE_LETTERS.test(sentence)) return "vi";
  if (LATIN_LETTER.test(sentence)) return "en";
  return fallback;
}

export function prepareSpokenText(text: string, lang: SpokenLang): SpokenScript {
  const cleaned = applyExpansions(stripUnspeakable(normalizeTypography(text ?? "")), DOTTED_ABBREVIATIONS);
  const lines: SpokenLine[] = [];
  const dropped: string[] = [];

  for (const raw of splitSentences(cleaned)) {
    const sentenceLang = detectSpokenLang(raw, lang);
    const expanded = sentenceLang === "en" ? applyExpansions(raw, ENGLISH_SYMBOLS) : raw;
    const collapsed = collapse(expanded);
    if (!PRONOUNCEABLE.test(collapsed)) {
      if (raw.trim()) dropped.push(raw.trim());
      continue;
    }
    for (const piece of splitLongLine(collapsed)) {
      const finished = finishSentence(piece);
      if (finished) lines.push({ lang: sentenceLang, text: finished });
    }
  }

  return { lines, dropped };
}

/** Convenience for callers that need one string for a single-language voice. */
export function toSpokenString(script: SpokenScript, lang: SpokenLang) {
  return script.lines.filter((line) => line.lang === lang).map((line) => line.text).join(" ");
}
