const fs = require("fs");
const path = require("path");

// ── Đọc nguồn ─────────────────────────────
const SRC = "E:/app-hoc-tieng-anh/dataset/source/docx_content.json";
const OUT = "E:/app-hoc-tieng-anh/dataset";
const doc = JSON.parse(fs.readFileSync(SRC, "utf8"));
const paras = doc.filter(x => x.type === "para");
const tables = doc.filter(x => x.type === "table");

const unitStart = [1, 260, 529, 701, 1015];
const unitNames = ["INTRODUCTION", "FEELINGS", "ADVENTURE", "ON SCREEN", "WEATHER"];
const unitTitles = ["Bài 1 - INTRODUCTION", "Bài 2 - FEELINGS", "Bài 3 - ADVENTURE", "Bài 4 - ON SCREEN", "Bài 5 - WEATHER"];

function inUnit(pIdx, unit) {
  const start = unitStart[unit];
  const end = unit === unitStart.length - 1 ? 1256 : unitStart[unit + 1];
  return pIdx >= start && pIdx < end;
}
function unitParagraphs(unit) { return paras.filter(p => inUnit(p.idx, unit)); }
function linesOf(text) { return text.split("\n").map(s => s.trim()).filter(Boolean); }

// ── Nhận diện tiếng Việt ──────────────────
const VN_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/;
function isVietnamese(s) { return VN_CHARS.test(s || ""); }

// ── Parse ô nghĩa (chống wrap dòng) ───────
function parseMeaningCell(cell) {
  const rawLines = linesOf(cell);
  if (!rawLines.length) return { meaningEn: null, meaningVi: null, exampleEn: null, exampleVi: null };

  let exampleEn = null, exampleVi = null;
  const content = [];
  for (const l of rawLines) {
    const m = l.match(/^e\.g\.\s*(.+?)(?:\s*\((.+)\))?$/);
    if (m) {
      if (!exampleEn) { exampleEn = m[1].trim(); exampleVi = m[2] ? m[2].trim() : null; }
    } else {
      content.push(l);
    }
  }

  const joined = content.join(" ").replace(/\s+/g, " ").trim();
  let meaningEn = null, meaningVi = null;

  // Tách EN/VI theo dấu "/" cuối cùng (phần sau thường là tiếng Việt)
  const slashIdx = joined.lastIndexOf("/");
  if (slashIdx > 0) {
    const maybeVi = joined.slice(slashIdx + 1).trim();
    const maybeEn = joined.slice(0, slashIdx).trim();
    if (isVietnamese(maybeVi)) {
      meaningEn = maybeEn || null;
      meaningVi = maybeVi;
    } else if (isVietnamese(joined)) {
      meaningVi = joined;
    } else {
      meaningEn = joined;
    }
  } else if (isVietnamese(joined)) {
    meaningVi = joined;
  } else {
    meaningEn = joined;
  }

  // Một số bảng dùng "EN: VI" trên cùng dòng
  if (!meaningVi && meaningEn) {
    const colonMatch = meaningEn.match(/^(.+?):\s*([^:]+)$/);
    if (colonMatch && isVietnamese(colonMatch[2]) && !isVietnamese(colonMatch[1])) {
      meaningVi = colonMatch[2].trim();
      meaningEn = colonMatch[1].trim();
    }
  }

  return { meaningEn, meaningVi, exampleEn, exampleVi };
}

// ── Sửa tay các ô bị lỗi đặc thù trong docx ──
function applyManualFixes(items) {
  const fixes = {
    abseiling: {
      meaningVi: "môn đu dây leo xuống vách đá",
      meaningEn: "the sport of descending a steep drop using a rope and a harness",
    },
    sweatshirt: {
      meaningVi: "áo nỉ",
      meaningEn: "a piece of informal clothing with long sleeves, usually made of thick cotton, worn on the upper part of the body",
    },
    civic_education: {
      meaningVi: "môn giáo dục công dân/ môn đạo đức",
      meaningEn: null,
      meaningEnReplace: true,
    },
    suspicious: {
      meaningVi: "tỏ ra nghi ngờ, có sự nghi ngờ",
      meaningEn: "feeling that somebody has done something wrong, illegal or dishonest, without having any proof",
    },
  };
  for (const v of items) {
    const key = v.lemma === "civic education" ? "civic_education" : v.lemma;
    const fix = fixes[key];
    if (!fix) continue;
    if (fix.meaningVi) v.meaningVi = fix.meaningVi;
    if (fix.meaningEnReplace) v.meaningEn = null;
    else if (fix.meaningEn) v.meaningEn = fix.meaningEn;
  }
  return items;
}

// ── Bước 1: Từ vựng ──────────────────────
const vocabTables = { 0: 0, 1: 0, 8: 1, 11: 2, 12: 2, 13: 2, 14: 2, 23: 3, 28: 4, 29: 4, 30: 4 };
const vocabItems = [];
for (const [ti, unit] of Object.entries(vocabTables)) {
  const t = tables[Number(ti)];
  for (let r = 1; r < t.rows.length; r++) {
    const [word, pron, type, meaning] = t.rows[r];
    if (!word || word === "Word") continue;
    const m = parseMeaningCell(meaning || "");
    const t2 = (type || "").trim();
    const map = { "(n)": "noun", "(adj)": "adjective", "(v)": "verb", "(adv)": "adverb", "(np)": "noun phrase", "(n.p)": "noun phrase" };
    vocabItems.push({
      lemma: word.trim().toLowerCase().replace(/\s+/g, " "),
      displayText: word.trim(),
      ipa: (pron || "").trim() || null,
      partOfSpeech: map[t2] || t2 || null,
      meaningVi: m.meaningVi || null,
      meaningEn: m.meaningEn || null,
      exampleSentence: m.exampleEn || null,
      exampleVi: m.exampleVi || null,
      cefrLevel: "A2",
      unit: unit + 1,
      source: unitTitles[unit],
    });
  }
}
applyManualFixes(vocabItems);

// Dedupe theo lemma
const seen = new Set();
const vocabUnique = vocabItems.filter(v => (seen.has(v.lemma) ? false : (seen.add(v.lemma), true)));

// ── Validate toàn bộ 116 từ ───────────────
const vnMissing = [];
const enContainsVi = [];
for (const v of vocabUnique) {
  if (!v.meaningVi) vnMissing.push(v.lemma);
  if (v.meaningEn && isVietnamese(v.meaningEn)) enContainsVi.push(v.lemma);
}
if (vnMissing.length) {
  console.error("❌ VALIDATE FAIL — meaningVi NULL:", vnMissing.join(", "));
  process.exit(1);
}
if (enContainsVi.length) {
  console.warn("⚠️ meaningEn chứa tiếng Việt (kiểm tra thủ công):", enContainsVi.join(", "));
}
console.log(`✅ Validate vocabulary: ${vocabUnique.length} items, meaningVi OK`);

// ── Bước 2: Ngữ pháp ─────────────────────
function tableToMarkdown(t) {
  return t.rows.map(row => row.map(c => c.replace(/\n+/g, " ").trim()).filter(Boolean).join(" | ")).join("\n");
}
const grammarTopics = [
  { unit: 0, id: "present_simple_vs_continuous", title: "So sánh thì hiện tại đơn và hiện tại tiếp diễn", tables: [2, 3, 4, 5] },
  { unit: 0, id: "articles_a_an_the", title: "Mạo từ: a/an/the", tables: [6] },
  { unit: 1, id: "past_simple", title: "Thì quá khứ đơn", tables: [9] },
  { unit: 2, id: "past_continuous", title: "Thì quá khứ tiếp diễn", tables: [15] },
  { unit: 2, id: "past_simple_vs_continuous", title: "So sánh thì quá khứ đơn và quá khứ tiếp diễn", tables: [16] },
  { unit: 3, id: "quantifiers", title: "Lượng từ (Quantifiers)", tables: [24] },
  { unit: 3, id: "must_have_to", title: "Phân biệt must, mustn't, have to và needn't/don't have to", tables: [25] },
  { unit: 4, id: "comparisons", title: "Câu so sánh (Comparisons)", tables: [31, 32] },
  { unit: 4, id: "too_enough", title: "Too and enough", tables: [33] },
  { unit: 4, id: "zero_conditional", title: "Câu điều kiện loại 0 (Zero conditional)", tables: [34] },
];
const grammar = grammarTopics.map(g => ({
  id: g.id,
  unit: g.unit + 1,
  title: g.title,
  content: g.tables.map(ti => tableToMarkdown(tables[ti])).join("\n\n"),
}));

// ── Bước 3: Bài tập ──────────────────────
const BT_RE = /^Bài\s*tập\s*(\d+)[\.\s:]*\s*(.*)$/;
function extractExercises(unit) {
  const ps = unitParagraphs(unit);
  const results = [];
  let current = null, inAnswers = false;
  for (const p of ps) {
    if (/^2\. Hướng dẫn trả lời/.test(p.text)) { inAnswers = true; current = null; continue; }
    if (inAnswers) continue;
    for (const line of linesOf(p.text)) {
      const m = line.match(BT_RE);
      if (m) { current = { number: parseInt(m[1]), title: (m[2] || "").trim(), content: [] }; results.push(current); }
      else if (current) {
        if (p.style === "Heading 1" || p.style === "Heading 2") { current = null; continue; }
        if (line && !BT_RE.test(line)) current.content.push(line);
      }
    }
  }
  return results;
}
function extractAnswers(unit) {
  const ps = unitParagraphs(unit);
  const ansIdx = ps.findIndex(p => /2\. Hướng dẫn trả lời/.test(p.text));
  if (ansIdx === -1) return [];
  const answers = [];
  let current = null;
  for (const p of ps.slice(ansIdx + 1)) {
    for (const line of linesOf(p.text)) {
      const m = line.match(BT_RE);
      if (m) current = { number: parseInt(m[1]), title: (m[2] || "").trim(), lines: [] }, answers.push(current);
      else if (current && line) current.lines.push(line);
    }
  }
  return answers;
}
const tableContentFallback = { "1:1": 7, "2:1": 10, "3:1": 17, "3:3": 19, "3:5": 22, "5:4": 37 };
const tableAnswerFallback = { "4:6": 26, "4:7": 27, "3:3": 21, "5:4": 38 };
const exercises = unitNames.map((name, u) => {
  const ans = extractAnswers(u);
  return {
    unit: u + 1,
    name,
    exercises: extractExercises(u).map(ex => {
      let content = ex.content;
      let answers = (ans.find(a => a.number === ex.number) || { lines: [] }).lines;
      const ck = `${u + 1}:${ex.number}`;
      if (!content.length && tableContentFallback[ck]) {
        content = tables[tableContentFallback[ck]].rows.map(r => r.map(c => c.replace(/\n+/g, " ").trim()).filter(Boolean).join(" — "));
      }
      if (!answers.length && tableAnswerFallback[ck]) {
        answers = tables[tableAnswerFallback[ck]].rows.map(r => r.map(c => c.replace(/\n+/g, "; ").trim()).filter(Boolean).join(" | "));
      }
      return { number: ex.number, title: ex.title, content, answers };
    }),
  };
});

// ── Bước 4: Mục tiêu / hướng dẫn ─────────
function sectionText(unit, fromRe, toRe) {
  const ps = unitParagraphs(unit);
  const start = ps.findIndex(p => fromRe.test(p.text));
  if (start === -1) return [];
  const out = [];
  for (const p of ps.slice(start + 1)) {
    if (toRe.test(p.text)) break;
    if (p.text.trim() && !p.style?.startsWith("Heading")) out.push(...linesOf(p.text));
  }
  return out;
}
const objectives = unitNames.map((name, u) => ({
  unit: u + 1,
  name,
  objectives: {
    knowledge: sectionText(u, /^1\. Kiến thức/, /^2\. Kĩ năng/),
    skills: sectionText(u, /^2\. Kĩ năng/, /^3\. Thái độ/),
    attitude: sectionText(u, /^3\. Thái độ/, /^4\. Năng lực hành động/),
    action: sectionText(u, /^4\. Năng lực hành động/, /^II\. NỘI DUNG/),
  },
  studyGuide: {
    selfStudy: sectionText(u, /^1\. Tự học/, /^2\. Học trên lớp/),
    classroom: sectionText(u, /^2\. Học trên lớp/, /^IV\. HỆ THỐNG/),
  },
}));

// ── Bước 5: Lessons ──────────────────────
const topicGuess = [
  "school subjects, sports, hobbies, describing people, present simple/continuous, articles",
  "feelings, -ed/-ing adjectives, past simple",
  "landscape, extreme adjectives, sports equipment, past continuous",
  "TV programmes and films, negative prefixes, quantifiers, must/have to",
  "weather, natural disasters, environment, comparisons, too/enough, zero conditional",
];
const lessons = unitNames.map((name, u) => {
  const obj = objectives[u];
  return {
    id: `unit_${u + 1}_${name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    unit: u + 1,
    title: unitTitles[u],
    source: "Sách HDH TATQHP1 - SOLUTIONS Pre-Intermediate 3rd Edition",
    cefrLevel: "A2",
    topic: topicGuess[u],
    learningObjectives: [...obj.objectives.knowledge, ...obj.objectives.skills],
    vocabularyCount: vocabUnique.filter(v => v.unit === u + 1).length,
    grammarIds: grammar.filter(g => g.unit === u + 1).map(g => g.id),
    exerciseCount: exercises[u].exercises.length,
    studyGuide: obj.studyGuide,
  };
});

// ── Bước 6: Chunks vector-ready ──────────
const chunks = [];
for (const v of vocabUnique) {
  chunks.push({
    id: `vocab_${v.unit}_${v.lemma.replace(/\s+/g, "_")}`,
    unit: v.unit,
    type: "vocabulary",
    title: v.lemma,
    text: `${v.lemma} ${v.ipa || ""} (${v.partOfSpeech || ""}). Nghĩa: ${v.meaningVi || ""}. ${v.meaningEn ? "Definition: " + v.meaningEn + "." : ""} ${v.exampleSentence ? "Example: " + v.exampleSentence + "." : ""}`,
    metadata: { lemma: v.lemma, ipa: v.ipa, partOfSpeech: v.partOfSpeech, cefrLevel: v.cefrLevel, meaningVi: v.meaningVi, source: v.source },
  });
}
for (const g of grammar) {
  chunks.push({ id: `grammar_${g.unit}_${g.id}`, unit: g.unit, type: "grammar", title: g.title, text: g.title + ".\n" + g.content, metadata: { grammarId: g.id, source: unitTitles[g.unit - 1] } });
}
for (const u of exercises) {
  for (const e of u.exercises) {
    const body = e.content.join("\n");
    const ansTxt = e.answers.length ? "\nĐáp án: " + e.answers.join("; ") : "";
    chunks.push({ id: `exercise_u${u.unit}_bt${e.number}`, unit: u.unit, type: "exercise", title: `Bài tập ${e.number}. ${e.title}`, text: `Bài tập ${e.number}. ${e.title}\n${body}${ansTxt}`, metadata: { exerciseNumber: e.number, hasAnswers: e.answers.length > 0, source: unitTitles[u.unit - 1] } });
  }
}
for (const o of objectives) {
  for (const [k, arr] of Object.entries(o.objectives)) {
    if (arr.length) chunks.push({ id: `objective_u${o.unit}_${k}`, unit: o.unit, type: "objective", title: `Mục tiêu (${k})`, text: arr.join("\n"), metadata: { category: k, source: unitTitles[o.unit - 1] } });
  }
}

// ── Xuất ─────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "vocabulary.json"), JSON.stringify({ total: vocabUnique.length, items: vocabUnique }, null, 2));
fs.writeFileSync(path.join(OUT, "grammar-reference.json"), JSON.stringify({ total: grammar.length, items: grammar }, null, 2));
fs.writeFileSync(path.join(OUT, "exercises.json"), JSON.stringify({ units: exercises }, null, 2));
fs.writeFileSync(path.join(OUT, "objectives.json"), JSON.stringify(objectives, null, 2));
fs.writeFileSync(path.join(OUT, "lessons.json"), JSON.stringify({ total: lessons.length, items: lessons }, null, 2));
fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify({ total: chunks.length, items: chunks }, null, 2));

console.log("--- BUILD SUMMARY ---");
console.log("VOCAB:", vocabUnique.length);
console.log("GRAMMAR:", grammar.length);
console.log("EXERCISES:", exercises.map(e => `U${e.unit}:${e.exercises.length}`).join(" "));
console.log("LESSONS:", lessons.length);
console.log("CHUNKS:", chunks.length);
console.log("BUILD OK");
