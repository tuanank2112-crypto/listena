/**
 * Curated catalogue of free browser/OS English voices (Plan18 SPEC-P180).
 *
 * The Plan14 policy ranks voices by tier, which is derived from the voice name
 * ("Natural", "Premium", "Siri", …). On a Windows machine with Edge that tier
 * holds a dozen Microsoft Natural voices, so the winner was decided by
 * alphabetical order — "Andrew" simply sorts before "Ava". Nobody had checked
 * whether that voice is pleasant to listen to for an A1–A2 learner.
 *
 * This catalogue adds a vetted `listenability` score used to order voices
 * WITHIN a tier. It never filters: a device whose voices are all unknown still
 * gets the Plan14 ranking, and the score can never outrank a tier (it is capped
 * below 100 while a tier step is worth 100).
 *
 * Matching is by NORMALISED NAME, never by `voiceURI`: the same voice has a
 * different URI on Chrome, Edge, Safari and Firefox.
 */

import type { EnglishAccent } from "./voice-policy";

export interface CuratedBrowserVoice {
  /** Normalised name, unique across the catalogue. */
  key: string;
  /** Other normalised names that resolve to this entry. */
  aliases?: string[];
  /** Display name for the learner. */
  label: string;
  /** One Vietnamese sentence shown under the name. */
  note: string;
  accent: EnglishAccent;
  gender: "female" | "male";
  platform: "Microsoft Natural" | "Microsoft (cũ)" | "Apple" | "Google";
  /** 0..99. Only ever compared inside one tier (SPEC-P180 §2). */
  listenability: number;
}

/** A tier step is worth 100, so no score may reach it. */
export const MAX_LISTENABILITY = 99;

const US: EnglishAccent = "en-US";
const GB: EnglishAccent = "en-GB";

const OLD_SYSTEM_NOTE = "Giọng hệ thống đời cũ, nghe máy móc — nên cài thêm giọng Natural.";
const GOOGLE_NOTE = "Giọng mạng của Google — dùng được, nhưng cần Internet và ít biểu cảm.";

export const CURATED_BROWSER_VOICES: readonly CuratedBrowserVoice[] = [
  // en-US
  { key: "ava", label: "Ava", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 96,
    note: "Nữ Mỹ, ấm và rõ từng âm cuối — dễ nghe nhất cho người mới." },
  { key: "emma", label: "Emma", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 93,
    note: "Nữ Mỹ, nhịp chậm vừa phải, ngắt câu tự nhiên." },
  { key: "andrew", label: "Andrew", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 92,
    note: "Nam Mỹ, giọng trò chuyện, phát âm chắc." },
  { key: "brian", label: "Brian", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 90,
    note: "Nam Mỹ, trầm và điềm đạm." },
  { key: "jenny", label: "Jenny", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 86,
    note: "Nữ Mỹ, sáng và nhanh hơn Ava một chút." },
  { key: "aria", label: "Aria", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 84,
    note: "Nữ Mỹ, giọng dẫn chương trình, nhiều ngữ điệu." },
  { key: "michelle", label: "Michelle", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 82,
    note: "Nữ Mỹ, đều giọng, hợp khi nghe câu dài." },
  { key: "guy", label: "Guy", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 78,
    note: "Nam Mỹ, nói nhanh hơn mức người mới quen." },
  { key: "roger", label: "Roger", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 74,
    note: "Nam Mỹ, giọng khô, ít ngữ điệu." },
  { key: "steffan", label: "Steffan", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 72,
    note: "Nam Mỹ, giọng kể chuyện, nhấn mạnh nhiều." },
  { key: "christopher", label: "Christopher", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 84,
    note: "Nam Mỹ, giọng kể chuyện ấm, nhả chữ chậm rãi." },
  { key: "eric", label: "Eric", accent: US, gender: "male", platform: "Microsoft Natural", listenability: 80,
    note: "Nam Mỹ, điềm tĩnh, nhịp đều — dễ nghe khi học câu dài." },
  { key: "ana", label: "Ana", accent: US, gender: "female", platform: "Microsoft Natural", listenability: 50,
    note: "Giọng TRẺ EM — điểm thấp có chủ ý, không hợp làm mẫu phát âm cho người lớn." },
  { key: "siri 1", aliases: ["siri", "siri 2", "siri 3", "siri 4", "siri 5"], label: "Siri", accent: US,
    gender: "female", platform: "Apple", listenability: 88,
    note: "Giọng Siri của Apple, rất tự nhiên (cần iOS/macOS đời mới)." },
  { key: "alex", label: "Alex", accent: US, gender: "male", platform: "Apple", listenability: 86,
    note: "Giọng macOS cổ điển được đánh giá rất cao: ngắt nghỉ và lấy hơi như người thật." },
  { key: "nicky", label: "Nicky", accent: US, gender: "female", platform: "Apple", listenability: 84,
    note: "Nữ Mỹ họ giọng Siri, sáng và thân thiện." },
  { key: "aaron", label: "Aaron", accent: US, gender: "male", platform: "Apple", listenability: 82,
    note: "Nam Mỹ họ giọng Siri, trung tính, phát âm gọn." },
  { key: "allison", label: "Allison", accent: US, gender: "female", platform: "Apple", listenability: 84,
    note: "Nữ Mỹ của Apple, rõ ràng, hợp nghe từ vựng." },
  { key: "zoe", label: "Zoe", accent: US, gender: "female", platform: "Apple", listenability: 84,
    note: "Nữ Mỹ của Apple, bản Premium nghe mượt." },
  { key: "samantha", label: "Samantha", accent: US, gender: "female", platform: "Apple", listenability: 82,
    note: "Giọng Apple quen thuộc; nên tải bản Enhanced/Premium." },
  { key: "joelle", label: "Joelle", accent: US, gender: "female", platform: "Apple", listenability: 78,
    note: "Nữ Mỹ của Apple, giọng nhẹ." },
  { key: "evan", label: "Evan", accent: US, gender: "male", platform: "Apple", listenability: 76,
    note: "Nam Mỹ của Apple, phát âm chuẩn, hơi phẳng." },
  { key: "noelle", label: "Noelle", accent: US, gender: "female", platform: "Apple", listenability: 76,
    note: "Nữ Mỹ của Apple, tốc độ đều." },
  { key: "nathan", label: "Nathan", accent: US, gender: "male", platform: "Apple", listenability: 74,
    note: "Nam Mỹ của Apple, giọng trẻ." },
  { key: "tom", label: "Tom", accent: US, gender: "male", platform: "Apple", listenability: 72,
    note: "Nam Mỹ của Apple, giọng cũ hơn các bản Premium." },
  { key: "susan", label: "Susan", accent: US, gender: "female", platform: "Apple", listenability: 70,
    note: "Nữ Mỹ của Apple, giọng cũ hơn các bản Premium." },
  { key: "google us english", label: "Google US English", accent: US, gender: "female", platform: "Google",
    listenability: 60, note: GOOGLE_NOTE },
  { key: "zira", label: "Zira", accent: US, gender: "female", platform: "Microsoft (cũ)", listenability: 34,
    note: OLD_SYSTEM_NOTE },
  { key: "david", label: "David", accent: US, gender: "male", platform: "Microsoft (cũ)", listenability: 32,
    note: OLD_SYSTEM_NOTE },
  { key: "mark", label: "Mark", accent: US, gender: "male", platform: "Microsoft (cũ)", listenability: 30,
    note: OLD_SYSTEM_NOTE },

  // en-GB
  { key: "sonia", label: "Sonia", accent: GB, gender: "female", platform: "Microsoft Natural", listenability: 94,
    note: "Nữ Anh-Anh, phát âm RP rõ, nhịp dễ bắt chước." },
  { key: "ryan", label: "Ryan", accent: GB, gender: "male", platform: "Microsoft Natural", listenability: 90,
    note: "Nam Anh-Anh, trầm ấm, ngắt câu gọn." },
  { key: "libby", label: "Libby", accent: GB, gender: "female", platform: "Microsoft Natural", listenability: 86,
    note: "Nữ Anh-Anh, giọng trẻ, sáng." },
  { key: "thomas", label: "Thomas", accent: GB, gender: "male", platform: "Microsoft Natural", listenability: 78,
    note: "Nam Anh-Anh, nói hơi nhanh." },
  { key: "serena", label: "Serena", accent: GB, gender: "female", platform: "Apple", listenability: 86,
    note: "Nữ Anh-Anh của Apple, bản Premium rất mượt." },
  { key: "daniel", label: "Daniel", accent: GB, gender: "male", platform: "Apple", listenability: 84,
    note: "Nam Anh-Anh của Apple, giọng RP quen thuộc." },
  { key: "kate", label: "Kate", accent: GB, gender: "female", platform: "Apple", listenability: 82,
    note: "Nữ Anh-Anh của Apple, phát âm gọn." },
  { key: "stephanie", label: "Stephanie", accent: GB, gender: "female", platform: "Apple", listenability: 80,
    note: "Nữ Anh-Anh của Apple, giọng nhẹ." },
  { key: "arthur", label: "Arthur", accent: GB, gender: "male", platform: "Apple", listenability: 80,
    note: "Nam Anh-Anh của Apple, trầm, phát âm RP rõ." },
  { key: "oliver", label: "Oliver", accent: GB, gender: "male", platform: "Apple", listenability: 76,
    note: "Nam Anh-Anh của Apple, hơi phẳng." },
  { key: "jamie", label: "Jamie", accent: GB, gender: "male", platform: "Apple", listenability: 74,
    note: "Nam Anh-Anh của Apple, giọng trẻ." },
  { key: "martha", label: "Martha", accent: GB, gender: "female", platform: "Apple", listenability: 72,
    note: "Nữ Anh-Anh của Apple, giọng lớn tuổi hơn." },
  { key: "google uk english female", label: "Google UK English Female", accent: GB, gender: "female",
    platform: "Google", listenability: 62, note: GOOGLE_NOTE },
  { key: "google uk english male", label: "Google UK English Male", accent: GB, gender: "male",
    platform: "Google", listenability: 58, note: GOOGLE_NOTE },
  { key: "maisie", label: "Maisie", accent: GB, gender: "female", platform: "Microsoft Natural", listenability: 55,
    note: "Giọng TRẺ EM — điểm thấp có chủ ý, không hợp làm mẫu phát âm cho người lớn." },
  { key: "hazel", label: "Hazel", accent: GB, gender: "female", platform: "Microsoft (cũ)", listenability: 34,
    note: OLD_SYSTEM_NOTE },
  { key: "george", label: "George", accent: GB, gender: "male", platform: "Microsoft (cũ)", listenability: 32,
    note: OLD_SYSTEM_NOTE },
];

const BY_KEY = new Map<string, CuratedBrowserVoice>();
for (const entry of CURATED_BROWSER_VOICES) {
  BY_KEY.set(entry.key, entry);
  for (const alias of entry.aliases ?? []) BY_KEY.set(alias, entry);
}

/**
 * Reduce a Web Speech voice name to its catalogue key (SPEC-P180 §3).
 * "Microsoft Ava Online (Natural) - English (United States)" → "ava".
 */
export function normaliseVoiceName(name: string): string {
  if (typeof name !== "string") return "";
  let value = name.trim();
  const localeSuffix = value.indexOf(" - ");
  if (localeSuffix > 0) value = value.slice(0, localeSuffix);
  return value
    .toLowerCase()
    .replace(/\((?:enhanced|premium|natural|online|compact|legacy)\)/g, " ")
    .replace(/\([^)]*english[^)]*\)/g, " ")
    .replace(/\b(?:microsoft|apple)\b/g, " ")
    // No word boundary on purpose: Edge ships "AvaMultilingual", "AndrewMultilingual", …
    .replace(/multilingual/g, " ")
    .replace(/\b(?:online|natural|enhanced|premium|compact|desktop|mobile|voice)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Catalogue entry for a raw `SpeechSynthesisVoice.name`, or undefined. */
export function lookupCuratedVoice(name: string): CuratedBrowserVoice | undefined {
  const key = normaliseVoiceName(name);
  if (!key) return undefined;
  return BY_KEY.get(key);
}
