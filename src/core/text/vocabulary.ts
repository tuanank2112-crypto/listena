const ENGLISH_EXAMPLE_START = /\s+(?=(?:e\.g\.|I(?:'m|'ve|'d|'ll)?|He|She|We(?:'re|'ve|'d|'ll)?|They(?:'re|'ve|'d|'ll)?|It|There|The|My|Our|People|Students|Many|Some|This|That|These|Those|Don't|We're)\b)/i;
const VIETNAMESE_CHARACTERS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;

export function cleanVocabularyMeaning(value: string, exampleSentence?: string | null) {
  let meaning = value.trim();
  if (exampleSentence) meaning = meaning.replace(exampleSentence, "").trim();

  const colonIndex = meaning.indexOf(":");
  if (colonIndex > 0) {
    const beforeColon = meaning.slice(0, colonIndex);
    const afterColon = meaning.slice(colonIndex + 1).trim();
    if (!VIETNAMESE_CHARACTERS.test(beforeColon) && VIETNAMESE_CHARACTERS.test(afterColon)) {
      meaning = afterColon;
    }
  }

  meaning = meaning.split(/\s+e\.g\./i)[0];
  meaning = meaning.split(ENGLISH_EXAMPLE_START)[0];
  return meaning.replace(/[.\s]+$/, "").trim();
}
