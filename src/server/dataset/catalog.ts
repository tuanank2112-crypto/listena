import chunksData from "../../../dataset/chunks.json";
import grammarData from "../../../dataset/grammar-reference.json";
import lessonsData from "../../../dataset/lessons.json";

export interface KnowledgeResult {
  id: string;
  unit: number;
  type: string;
  title: string;
  text: string;
  score: number;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "các", "cho", "của", "do", "giải", "giúp", "hãy", "is",
  "la", "minh", "nao", "the", "the", "toi", "trong", "va", "ve", "what",
  "tu", "nghia", "gi", "mot", "vi", "du",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query: string) {
  return [...new Set(normalize(query).split(" ").filter((term) => term.length > 1 && !STOP_WORDS.has(term)))];
}

export function getDatasetUnit(title: string) {
  return lessonsData.items.find((lesson) => lesson.title === title)?.unit ?? null;
}

export function getUnitLearningContext(unit: number | null) {
  if (!unit) return null;
  const lesson = lessonsData.items.find((item) => item.unit === unit);
  if (!lesson) return null;
  return {
    unit,
    title: lesson.title,
    objectives: lesson.learningObjectives,
    studyGuide: lesson.studyGuide,
    grammar: grammarData.items
      .filter((item) => item.unit === unit)
      .map((item) => ({ id: item.id, title: item.title, content: item.content })),
  };
}

export function searchKnowledge(query: string, unit: number | null, limit = 5): KnowledgeResult[] {
  const terms = queryTerms(query);
  const normalizedQuery = normalize(query);
  const candidates = chunksData.items.filter((chunk) => !unit || chunk.unit === unit);

  return candidates
    .map((chunk) => {
      const title = normalize(chunk.title);
      const text = normalize(chunk.text);
      let score = 0;
      for (const term of terms) {
        if (title === term) score += 30;
        else if (title.includes(term)) score += 8;
        if (text.includes(term)) score += 2;
      }
      const hasQueryMatch = score > 0;
      if (hasQueryMatch && /ngu phap|grammar|thi |tense|article|conditional/.test(normalizedQuery) && chunk.type === "grammar") score += 4;
      if (hasQueryMatch && /tu vung|vocabulary|nghia|word/.test(normalizedQuery) && chunk.type === "vocabulary") score += 4;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map((chunk) => ({
      id: chunk.id,
      unit: chunk.unit,
      type: chunk.type,
      title: chunk.title,
      text: chunk.text.slice(0, 1200),
      score: chunk.score,
    }));
}
