/**
 * Text normalization utilities for dictation assessment.
 * All operations are deterministic and pure.
 */

export interface NormalizationOptions {
  lowercase: boolean;
  removePunctuation: boolean;
  collapseWhitespace: boolean;
  unicodeNormalization: boolean;
}

/** U+2018 U+2019 U+02BC -> ASCII apostrophe. */
const CURLY_APOSTROPHES = /[‘’ʼ]/g;
/** U+201C U+201D -> ASCII double quote. */
const CURLY_DOUBLE_QUOTES = /[“”]/g;
/** Anything that is not a Unicode letter, number, whitespace or apostrophe. */
const PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s']/gu;

export const DEFAULT_NORMALIZATION_OPTIONS: NormalizationOptions = {
  lowercase: true,
  removePunctuation: true,
  collapseWhitespace: true,
  unicodeNormalization: true,
};

/**
 * Normalize a string according to the given options.
 * Used for comparison, not for display.
 */
export function normalizeText(
  text: string,
  options: Partial<NormalizationOptions> = {}
): string {
  const opts = { ...DEFAULT_NORMALIZATION_OPTIONS, ...options };
  let result = text;

  if (opts.unicodeNormalization) {
    // NFKC does not fold typographic apostrophes/quotes (U+2018/2019/02BC,
    // U+201C/201D) into their ASCII forms, so iOS "don’t" must be mapped
    // explicitly before punctuation stripping (Plan13 L3).
    result = result
      .normalize("NFKC")
      .replace(CURLY_APOSTROPHES, "'")
      .replace(CURLY_DOUBLE_QUOTES, '"');
  }

  if (opts.lowercase) {
    result = result.toLocaleLowerCase("en");
  }

  if (opts.removePunctuation) {
    // Unicode-aware: keep every letter/number in any script (café, "thực
    // đơn"), whitespace and the ASCII apostrophe; everything else is
    // treated as punctuation.
    result = result.replace(PUNCTUATION_PATTERN, " ");
  }

  if (opts.collapseWhitespace) {
    result = result.replace(/\s+/g, " ").trim();
  }

  return result;
}

/**
 * Tokenize a normalized string into words.
 */
export function tokenize(text: string): string[] {
  if (!text.trim()) return [];
  // Split on whitespace, filter empty strings
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Compute Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Compute normalized Levenshtein distance (0-1).
 * 0 = identical, 1 = completely different.
 */
export function normalizedLevenshtein(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshteinDistance(a, b) / maxLen;
}

/**
 * Compute longest common subsequence (LCS) between two token arrays.
 * Returns the LCS as an array of tokens.
 */
export function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}
