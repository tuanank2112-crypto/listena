/**
 * Plan21 SPEC-P211 — one canonical name, and one Vietnamese label, for every
 * mistake the AI reports.
 *
 * `detectedError.type` is `z.string().max(80)`: the model writes it freely, so
 * the same mistake arrives as "tense", "verb_tense", "Verb Tense" or "past
 * simple" on different turns. `updateErrors` in the learner-memory repository
 * matches those by exact string equality, so the counts split and the planner's
 * `count >= 3` threshold can stay unreached for a learner who has in fact made
 * the same mistake six times. Canonicalising is therefore a correctness fix,
 * not tidying.
 *
 * The labels exist for a second reason. The planner used to drop the raw type
 * into a Vietnamese sentence — "Bạn đã lặp lại lỗi tense 4 lần" — and the
 * learners this product is for are Vietnamese A1-A2 speakers who do not know
 * English grammar jargon. The label is what they read.
 */

export interface ErrorFamily {
  /** Canonical key stored in learner memory and used for counting. */
  key: string;
  /** What the learner reads, in Vietnamese. */
  labelVi: string;
  /** One line telling them what the family is about. */
  hintVi: string;
}

/**
 * Ordered on purpose: the first family whose keywords appear wins. More
 * specific families come before the ones that would otherwise swallow them —
 * "subject verb agreement" must not be read as a verb-form problem, and
 * "past simple" must reach `tense` before anything matches "simple".
 */
const FAMILIES: Array<ErrorFamily & { keywords: string[] }> = [
  {
    key: "agreement",
    labelVi: "Hòa hợp chủ ngữ và động từ",
    hintVi: "Động từ phải đi theo chủ ngữ: he goes, they go.",
    keywords: ["agreement", "concord", "subject verb", "sv agreement", "s v agreement"],
  },
  {
    key: "tense",
    labelVi: "Thì của động từ",
    hintVi: "Chọn thì đúng với mốc thời gian trong câu: yesterday đi với quá khứ.",
    keywords: ["tense", "past", "present", "future", "perfect", "continuous", "progressive"],
  },
  {
    key: "verb-form",
    labelVi: "Dạng của động từ",
    hintVi: "Sau to là động từ nguyên thể, sau giới từ là V-ing.",
    keywords: ["verb form", "verbform", "infinitive", "gerund", "participle", "auxiliary", "modal", "word form", "wordform"],
  },
  {
    key: "article",
    labelVi: "Mạo từ a, an, the",
    hintVi: "Danh từ đếm được số ít gần như luôn cần một mạo từ đứng trước.",
    keywords: ["article", "determiner"],
  },
  {
    key: "plural",
    labelVi: "Số ít và số nhiều",
    hintVi: "Hai cái trở lên thì danh từ đếm được phải thêm -s.",
    keywords: ["plural", "singular", "countable", "noun number"],
  },
  {
    key: "preposition",
    labelVi: "Giới từ",
    hintVi: "in, on, at, for, to — mỗi giới từ đi với một loại ngữ cảnh riêng.",
    keywords: ["preposition", "function word", "functionword"],
  },
  {
    key: "pronoun",
    labelVi: "Đại từ",
    hintVi: "he, she, it, they và các dạng sở hữu của chúng.",
    keywords: ["pronoun", "possessive"],
  },
  {
    key: "question-form",
    labelVi: "Cách đặt câu hỏi",
    hintVi: "Câu hỏi tiếng Anh cần trợ động từ hoặc đảo ngữ: Do you…? Where is…?",
    keywords: ["question", "interrogative", "wh word", "wh question"],
  },
  {
    key: "negation",
    labelVi: "Câu phủ định",
    hintVi: "don't, doesn't, didn't — chọn theo chủ ngữ và thì.",
    keywords: ["negation", "negative"],
  },
  {
    key: "comparative",
    labelVi: "So sánh hơn và so sánh nhất",
    hintVi: "bigger, more beautiful, the best — dài hay ngắn quyết định cách so sánh.",
    keywords: ["comparative", "superlative", "comparison"],
  },
  {
    key: "word-order",
    labelVi: "Trật tự từ",
    hintVi: "Tiếng Anh theo thứ tự chủ ngữ – động từ – tân ngữ, tính từ đứng trước danh từ.",
    keywords: ["word order", "wordorder", "syntax", "inversion", "order"],
  },
  {
    key: "word-choice",
    labelVi: "Chọn từ",
    hintVi: "Từ đúng ngữ pháp nhưng chưa đúng nghĩa hoặc chưa tự nhiên.",
    keywords: ["word choice", "wordchoice", "vocabulary", "lexical", "collocation", "wrong word", "diction"],
  },
  {
    key: "missing-word",
    labelVi: "Thiếu từ",
    hintVi: "Câu thiếu một thành phần bắt buộc.",
    keywords: ["missing word", "missingword", "omission", "omitted", "missing"],
  },
  {
    key: "extra-word",
    labelVi: "Thừa từ",
    hintVi: "Có một từ không cần thiết trong câu.",
    keywords: ["extra word", "extraword", "redundant", "unnecessary", "extra"],
  },
  {
    key: "spelling",
    labelVi: "Chính tả",
    hintVi: "Từ đúng nhưng viết sai.",
    keywords: ["spelling", "misspell", "typo", "orthograph"],
  },
  {
    key: "pronunciation",
    labelVi: "Phát âm",
    hintVi: "Âm đọc chưa khớp với từ bạn muốn nói.",
    keywords: ["pronunciation", "phonolog", "phoneme", "phonetic"],
  },
  {
    key: "punctuation",
    labelVi: "Dấu câu và viết hoa",
    hintVi: "Câu tiếng Anh mở đầu bằng chữ hoa và kết thúc bằng dấu câu.",
    keywords: ["punctuation", "capitali", "capitalisation", "capitalization", "segmentation"],
  },
  {
    key: "politeness",
    labelVi: "Mức độ lịch sự",
    hintVi: "Cùng một ý có cách nói lịch sự hơn: Could you… thay vì Give me…",
    keywords: ["politeness", "register", "formality", "rude"],
  },
  {
    // Last on purpose. "grammar" is what both the Prisma ErrorType enum and the
    // model reach for when nothing more specific fits, so every precise family
    // above must get its chance first — "grammar tense" belongs to `tense`.
    key: "grammar",
    labelVi: "Ngữ pháp chung",
    hintVi: "Câu đúng ý nhưng chưa đúng cấu trúc tiếng Anh.",
    keywords: ["grammar", "grammatical", "syntactic"],
  },
];

const FALLBACK: ErrorFamily = {
  key: "other",
  labelVi: "Lỗi khác",
  hintVi: "Xem lại câu bạn đã viết và phần giải thích của Coach.",
};

const BY_KEY = new Map(FAMILIES.map((family) => [family.key, family as ErrorFamily]));

/** Lowercase, turn every separator into a space, collapse runs. */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** kebab-case, for an unrecognised type that must stay distinct from others. */
function slug(raw: string): string {
  const normalised = normalise(raw).replaceAll(" ", "-");
  return normalised.slice(0, 40);
}

/**
 * Map whatever the model wrote onto a canonical key.
 *
 * An unrecognised type keeps a slug of itself rather than collapsing into one
 * "other" bucket. Merging two genuinely different unknown mistakes would invent
 * a recurrence the learner never had, and the planner would then send them to
 * practise something they are not actually getting wrong. A split count is a
 * missed nudge; an invented one is a wrong lesson.
 */
export function canonicalErrorType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = normalise(raw);
  if (!text) return null;
  for (const family of FAMILIES) {
    if (family.keywords.some((keyword) => matches(text, keyword))) return family.key;
  }
  return slug(text) || null;
}

/**
 * A multi-word keyword must appear as a whole phrase. A single word matches the
 * token itself, the token without a trailing "s", or — only for stems of six
 * characters or more — a token starting with it, so "phonological" reaches
 * "phonolog" while "tense" cannot be claimed by "intense" and "extra" cannot be
 * claimed by "extraction".
 */
function matches(text: string, keyword: string): boolean {
  if (keyword.includes(" ")) return ` ${text} `.includes(` ${keyword} `);
  return text.split(" ").some((token) =>
    token === keyword
    || token.replace(/s$/, "") === keyword
    || (keyword.length >= 6 && token.startsWith(keyword)));
}

/** The family for a canonical key; unknown keys get the neutral fallback. */
export function describeErrorType(key: string): ErrorFamily {
  return BY_KEY.get(key) ?? FALLBACK;
}

/** Convenience for callers holding a raw, unnormalised type. */
export function describeRawErrorType(raw: string | null | undefined): ErrorFamily {
  const key = canonicalErrorType(raw);
  return key ? describeErrorType(key) : FALLBACK;
}

export interface CountedError {
  errorType: string;
  count: number;
  lastEvidenceId: string;
}

export interface AggregatedError extends ErrorFamily {
  count: number;
  lastEvidenceId: string;
  /** Every stored spelling that folded into this family, for diagnosis. */
  rawTypes: string[];
}

/**
 * Fold stored counts onto canonical keys, so entries written before
 * canonicalisation — and any spelling the model still invents — count together.
 *
 * `lastEvidenceId` comes from the member with the highest count, ties broken by
 * the raw type, because learner memory carries no timestamps and the array
 * order is not recency: `updateErrors` rewrites an existing entry in place and
 * only appends a new one.
 */
export function aggregateRecurringErrors(errors: CountedError[]): AggregatedError[] {
  const groups = new Map<string, { count: number; members: CountedError[] }>();
  for (const error of errors) {
    const key = canonicalErrorType(error.errorType);
    if (!key || !error.lastEvidenceId) continue;
    const group = groups.get(key) ?? { count: 0, members: [] };
    group.count += error.count;
    group.members.push(error);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const leader = [...group.members].sort(
        (a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType),
      )[0];
      return {
        ...describeErrorType(key),
        key,
        count: group.count,
        lastEvidenceId: leader.lastEvidenceId,
        rawTypes: [...new Set(group.members.map((member) => member.errorType))].sort(),
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
