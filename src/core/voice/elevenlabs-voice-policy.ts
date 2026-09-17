/**
 * Curated ranking of ElevenLabs premade voices for English teaching
 * (Plan15 SPEC-P150 §2).
 *
 * Why a ranking instead of hard-coded voice IDs: ElevenLabs retires its
 * "Default" voices (Rachel, Sarah, George, Brian, …) on 2026-12-31 and only
 * accounts created before March 2026 still have them; newer accounts get a
 * replacement set (Talia, Elara, Alicia, Finley, …). The account's own voice
 * list is therefore the source of truth and this module decides, from names
 * and labels, which of them are clear, neutral pronunciation models.
 *
 * Research basis (2026-09-18, ElevenLabs help centre + voice reviews):
 * - Replacement premade voices and their official subtitles: Talia "Warm Soft
 *   Guide" (← Sarah), Elara "Crisp Pro Narrator" (← Laura), Alicia "Polished
 *   Global Anchor" (← Alice), Eldrin "Crisp British Baritone" (← George),
 *   Lawrence "Bright and Informative" (← Liam), Finley "Articulate Anchor"
 *   (← Daniel), Caleb "Trusted Guide" (← Chris), Eddie "Helpful and
 *   Comforting" (← Eric), Wyatt "Seasoned Mentor" (← Bill), Darian "Warm
 *   Grounded Storyteller" (← Roger), Sawyer (← Brian), Maisie (← Matilda),
 *   Jade (← Jessica), Florence (← Lily), Elowen (← River), Kellan (← Callum),
 *   Warren (← Will), Baxter (← Charlie, Australian), Kaelen (← Harry, game
 *   character).
 * - Reviewer consensus for clear narration / e-learning: Rachel, Sarah,
 *   Charlotte, Alice, Matilda, Lily (female); Adam, Antoni, Brian, George,
 *   Daniel, Liam, Chris, Bill (male). High-energy social voices (Natasha
 *   "Valley Girl", Jessica) and character voices are poor pronunciation models.
 */

export type ElevenAccent = "american" | "british" | "other";

export interface ElevenVoiceLabels {
  accent?: string;
  gender?: string;
  age?: string;
  use_case?: string;
  description?: string;
  language?: string;
  [key: string]: string | undefined;
}

export interface ElevenVoiceCandidate {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  labels?: ElevenVoiceLabels | null;
  verified_languages?: Array<{ language?: string; accent?: string | null }> | null;
  preview_url?: string | null;
}

export type CuratedVoiceTier = "TOP" | "GOOD" | "OK";

export interface CuratedElevenVoice {
  id: string;
  name: string;
  /** Short human label: accent · gender · subtitle. */
  subtitle: string;
  accent: ElevenAccent;
  gender: "female" | "male" | "unknown";
  tier: CuratedVoiceTier;
  previewUrl: string | null;
  score: number;
}

/**
 * Names reviewers and ElevenLabs itself position as clear teaching/narration
 * voices, in preference order. Earlier entries get a small bonus so ties
 * between two known voices resolve the same way on every account: soft,
 * clear guide voices first (a Vietnamese A2 learner copies these), then
 * articulate anchors, then warm narrators.
 */
const TOP_NAME_ORDER: Array<[string, string]> = [
  ["talia", "Warm soft guide"],
  ["elara", "Crisp pro narrator"],
  ["alicia", "Polished global anchor"],
  ["rachel", "Clear and warm narrator"],
  ["sarah", "Soft, clear"],
  ["finley", "Articulate anchor"],
  ["lawrence", "Bright and informative"],
  ["eldrin", "Crisp British baritone"],
  ["caleb", "Trusted guide"],
  ["antoni", "Well-rounded e-learning voice"],
  ["charlotte", "Measured and articulate"],
  ["alice", "Confident news presenter"],
  ["laura", "Upbeat, clear"],
  ["matilda", "Friendly, warm"],
  ["lily", "Warm, clear"],
  ["eddie", "Helpful and comforting"],
  ["adam", "Deep, confident"],
  ["brian", "Deep, news-style clarity"],
  ["george", "Warm British narrator"],
  ["daniel", "Authoritative British"],
  ["liam", "Articulate young narrator"],
  ["chris", "Casual, clear"],
  ["wyatt", "Seasoned mentor"],
  ["darian", "Warm grounded storyteller"],
  ["bill", "Trustworthy, mature"],
  ["roger", "Confident, grounded"],
  ["eric", "Friendly, clear"],
  ["sawyer", "Calm storyteller"],
  ["maisie", "Friendly casual neighbour"],
  ["elowen", "Upbeat modern narrator"],
  ["florence", "Atmospheric storyteller"],
];
const TOP_NAMES: Record<string, string> = Object.fromEntries(TOP_NAME_ORDER);
const TOP_NAME_BONUS = new Map(TOP_NAME_ORDER.map(([name], index) => [name, Math.max(0, 30 - index)]));

/** Voices that are fine but not first choices for a pronunciation model. */
const OK_NAMES = new Set(["jade", "jessica", "kellan", "callum", "warren", "will", "river", "baxter", "charlie", "harry", "kaelen", "josh", "cassidy", "james", "bella", "domi", "elli", "arnold", "sam", "dorothy", "gigi", "freya", "grace", "glinda", "serena", "nicole", "emily", "ethan", "thomas", "michael", "fin", "joseph", "patrick", "clyde", "dave", "drew", "paul", "giovanni", "mimi"]);

const POSITIVE_KEYWORDS = /\b(clear|crisp|articulate|neutral|professional|warm|calm|educational|e-learning|elearning|narrat|informative|news|anchor|guide|teacher|tutor|conversational|natural|polished|trust)\w*/gi;
const NEGATIVE_KEYWORDS = /\b(whisper|asmr|villain|creepy|monster|robot|cartoon|anime|character|game|warrior|sarcastic|hype|energetic|valley girl|shouty|meme|meditation|sleepy|raspy|gravelly|drunk|old man|grandma|baby|child|kid)\w*/gi;

function lower(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function firstName(name: string) {
  return name.split(/[\s\-–—(]/)[0]?.toLowerCase() ?? "";
}

export function detectAccent(voice: ElevenVoiceCandidate): ElevenAccent {
  const haystack = `${lower(voice.labels?.accent)} ${lower(voice.name)} ${lower(voice.description)} ${lower(voice.labels?.description)} ${(voice.verified_languages ?? []).map((item) => lower(item.accent)).join(" ")}`;
  if (/\b(american|us\b|united states|general american|standard american)/.test(haystack)) return "american";
  if (/\b(british|uk\b|england|english \(uk\)|received|rp\b|london)/.test(haystack)) return "british";
  return "other";
}

function detectGender(voice: ElevenVoiceCandidate): CuratedElevenVoice["gender"] {
  const value = lower(voice.labels?.gender);
  if (value.startsWith("f")) return "female";
  if (value.startsWith("m")) return "male";
  return "unknown";
}

function speaksLanguage(voice: ElevenVoiceCandidate, language: "en" | "vi") {
  const labelled = lower(voice.labels?.language);
  if (labelled) return labelled.startsWith(language);
  const verified = voice.verified_languages ?? [];
  if (verified.length) return verified.some((item) => lower(item.language).startsWith(language));
  // Premade voices without language metadata are English-first multilingual voices.
  return language === "en";
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

export function scoreEnglishVoice(voice: ElevenVoiceCandidate, wanted: Exclude<ElevenAccent, "other">) {
  const name = firstName(voice.name);
  const accent = detectAccent(voice);
  const text = `${lower(voice.name)} ${lower(voice.description)} ${lower(voice.labels?.description)} ${lower(voice.labels?.use_case)}`;
  let score = 0;
  if (name in TOP_NAMES) score += 50 + (TOP_NAME_BONUS.get(name) ?? 0);
  else if (OK_NAMES.has(name)) score += 15;
  if (accent === wanted) score += 30;
  else if (accent === "other") score -= 10;
  else score += 5;
  const age = lower(voice.labels?.age);
  if (age.includes("middle")) score += 2;
  else if (age.includes("young")) score += 1;
  else if (age.includes("old")) score -= 4;
  score += Math.min(9, countMatches(text, POSITIVE_KEYWORDS) * 3);
  score -= Math.min(60, countMatches(text, NEGATIVE_KEYWORDS) * 20);
  if (voice.category && voice.category !== "premade" && voice.category !== "professional" && voice.category !== "high_quality") score -= 10;
  return score;
}

function tierFor(score: number): CuratedVoiceTier {
  if (score >= 75) return "TOP";
  if (score >= 40) return "GOOD";
  return "OK";
}

function subtitleFor(voice: ElevenVoiceCandidate, accent: ElevenAccent, gender: CuratedElevenVoice["gender"]) {
  const known = TOP_NAMES[firstName(voice.name)];
  const accentLabel = accent === "american" ? "Mỹ" : accent === "british" ? "Anh" : "khác";
  const genderLabel = gender === "female" ? "nữ" : gender === "male" ? "nam" : "";
  const flavour = known ?? (voice.labels?.description ?? voice.labels?.use_case ?? "").toString();
  return [accentLabel, genderLabel, flavour].filter(Boolean).join(" · ");
}

function toCurated(voice: ElevenVoiceCandidate, score: number): CuratedElevenVoice {
  const accent = detectAccent(voice);
  const gender = detectGender(voice);
  return {
    id: voice.voice_id,
    name: voice.name.split(/\s[-–—]\s/)[0]?.trim() || voice.name,
    subtitle: subtitleFor(voice, accent, gender),
    accent,
    gender,
    tier: tierFor(score),
    previewUrl: voice.preview_url ?? null,
    score,
  };
}

/**
 * Rank English voices for an accent, best first. Voices with a negative score
 * (character/novelty voices) are dropped entirely. The list alternates gender
 * near the top so a learner sees one clear female and one clear male voice
 * before the rest.
 */
export function rankElevenEnglishVoices(voices: ElevenVoiceCandidate[], accent: Exclude<ElevenAccent, "other">, limit = 8): CuratedElevenVoice[] {
  const ranked = voices
    .filter((voice) => voice.voice_id && voice.name && speaksLanguage(voice, "en"))
    .map((voice) => toCurated(voice, scoreEnglishVoice(voice, accent)))
    .filter((voice) => voice.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const output: CuratedElevenVoice[] = [];
  const first = ranked[0];
  if (!first) return [];
  output.push(first);
  const otherGender = ranked.find((voice) => voice.gender !== first.gender && voice.gender !== "unknown");
  if (otherGender) output.push(otherGender);
  for (const voice of ranked) {
    if (output.length >= limit) break;
    if (!output.includes(voice)) output.push(voice);
  }
  return output;
}

/**
 * Vietnamese: prefer voices verified for `vi`; otherwise a clear neutral
 * multilingual voice (the multilingual models can read Vietnamese with any
 * premade voice, with lighter accent fidelity).
 */
export function rankElevenVietnameseVoices(voices: ElevenVoiceCandidate[], limit = 4): CuratedElevenVoice[] {
  const verified = voices.filter((voice) => voice.voice_id && speaksLanguage(voice, "vi"));
  const pool = verified.length ? verified : voices;
  return pool
    .filter((voice) => voice.voice_id && voice.name)
    .map((voice) => toCurated(voice, scoreEnglishVoice(voice, "american") + (verified.length ? 20 : 0)))
    .filter((voice) => voice.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface CuratedVoiceCatalogue {
  "en-US": CuratedElevenVoice[];
  "en-GB": CuratedElevenVoice[];
  vi: CuratedElevenVoice[];
}

export function buildCuratedCatalogue(voices: ElevenVoiceCandidate[]): CuratedVoiceCatalogue {
  return {
    "en-US": rankElevenEnglishVoices(voices, "american"),
    "en-GB": rankElevenEnglishVoices(voices, "british"),
    vi: rankElevenVietnameseVoices(voices),
  };
}
