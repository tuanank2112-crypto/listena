const fs = require("fs");
const path = require("path");
const doc = JSON.parse(fs.readFileSync("E:/app-hoc-tieng-anh/dataset/source/docx_content.json", "utf8"));

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

// Tách đoạn thành dòng (xử lý heading "Bài tập" nằm giữa dòng)
function linesOf(text) { return text.split("\n").map(s => s.trim()).filter(Boolean); }

const VN_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/;
function isVietnamese(s) { return VN_CHARS.test(s || ""); }

function parseMeaningCell(cell) {
  const lines = linesOf(cell);
  if (!lines.length) return { meaningEn: null, meaningVi: null, exampleEn: null, exampleVi: null };
  let first = lines[0];
  let meaningEn = null, meaningVi = null;
  const slash = first.indexOf("/");
  if (slash > 0) {
    meaningEn = first.slice(0, slash).trim() || null;
    meaningVi = first.slice(slash + 1).trim() || null;
  } else {
    // Pattern "EN: VI" (e.g. "the movement of air: gió")
    const colonMatch = first.match(/^(.+?):s*([^:]+)$/);
    if (colonMatch && isVietnamese(colonMatch[2]) && colonMatch[2].length <= 40 && !isVietnamese(colonMatch[1])) {
      meaningEn = colonMatch[1].trim();
      meaningVi = colonMatch[2].trim();
    } else if (isVietnamese(first)) {
      meaningVi = first;
    } else {
      meaningEn = first || null;
    }
  }
  let exampleEn = null, exampleVi = null;
  for (const l of lines.slice(1)) {
    const m = l.match(/^e\.g\.\s*(.+?)(?:\s*\((.+)\))?$/);
    if (m) { exampleEn = m[1].trim(); exampleVi = m[2] ? m[2].trim() : null; }
    else if (!exampleEn && l && !l.startsWith("(")) exampleEn = l;
    else if (l.startsWith("(") && exampleEn) exampleVi = l.replace(/^\(|\)$/g, "").trim();
  }
  return { meaningEn, meaningVi, exampleEn, exampleVi };
}

// ── Từ vựng ──
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

// ── Ngữ pháp ──
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

// ── Bài tập (xử lý theo dòng) ──
function extractExercises(unit) {
  const ps = unitParagraphs(unit);
  const results = [];
  let current = null, inAnswers = false;
  for (const p of ps) {
    if (/^2\. Hướng dẫn trả lời/.test(p.text)) { inAnswers = true; current = null; continue; }
    if (inAnswers) continue;
    for (const line of linesOf(p.text)) {
      const m = line.match(/^B\u00e0i t\u1eadp\s*(\d+)[\.\s:]*\s*(.*)$/);
      if (m) { current = { number: parseInt(m[1]), title: (m[2] || "").trim(), content: [] }; results.push(current); }
      else if (current) {
        if (p.style === "Heading 1" || p.style === "Heading 2") { current = null; continue; }
        if (line && !/^B\u00e0i t\u1eadp/.test(line)) current.content.push(line);
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
      const m = line.match(/^B\u00e0i t\u1eadp\s*(\d+)[\.\s:]*\s*(.*)$/);
      if (m) current = { number: parseInt(m[1]), title: (m[2] || "").trim(), lines: [] }, answers.push(current);
      else if (current && line) current.lines.push(line);
    }
  }
  return answers;
}

// Bổ sung nội dung/đáp án từ bảng cho các bài dùng bảng
const tableContentFallback = {
  "1:1": 7, "2:1": 10, "3:1": 17,   // matching
  "3:3": 19,                          // simple/extreme adj bank
  "3:5": 22,                          // sports equipment
  "5:4": 37,                          // comparative exercise
};
const tableAnswerFallback = {
  "4:6": 26, "4:7": 27,               // quantifiers
  "3:3": 21,                          // groups answer
  "5:4": 38,                          // comparative answer
};

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
        const t = tables[tableContentFallback[ck]];
        content = t.rows.map(r => r.map(c => c.replace(/\n+/g, " ").trim()).filter(Boolean).join(" — "));
      }
      if (!answers.length && tableAnswerFallback[ck]) {
        const t = tables[tableAnswerFallback[ck]];
        answers = t.rows.map(r => r.map(c => c.replace(/\n+/g, "; ").trim()).filter(Boolean).join(" | "));
      }
      return { number: ex.number, title: ex.title, content, answers };
    }),
  };
});

// ── Mục tiêu / hướng dẫn ──
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
    knowledge: sectionText(u, /^1\. Ki\u1ebfn th\u1ee9c/, /^2\. K\u0129 n\u0103ng/),
    skills: sectionText(u, /^2\. K\u0129 n\u0103ng/, /^3\. Th\u00e1i \u0111\u1ed9/),
    attitude: sectionText(u, /^3\. Th\u00e1i \u0111\u1ed9/, /^4\. N\u0103ng l\u1ef1c h\u00e0nh \u0111\u1ed9ng/),
    action: sectionText(u, /^4\. N\u0103ng l\u1ef1c h\u00e0nh \u0111\u1ed9ng/, /^II\. N\u1ed8I DUNG/),
  },
  studyGuide: {
    selfStudy: sectionText(u, /^1\. T\u1ef1 h\u1ecdc/, /^2\. H\u1ecdc tr\u00ean l\u1edbp/),
    classroom: sectionText(u, /^2\. H\u1ecdc tr\u00ean l\u1edbp/, /^IV\. H\u1ec6 TH\u1ed0NG/),
  },
}));

// ── Lessons (tổng hợp theo unit) ──
const lessons = unitNames.map((name, u) => {
  const obj = objectives[u];
  const exs = exercises[u].exercises;
  return {
    id: `unit_${u + 1}_${name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    unit: u + 1,
    title: unitTitles[u],
    source: "Sách HDH TATQHP1 - SOLUTIONS Pre-Intermediate 3rd Edition",
    cefrLevel: "A2",
    topic: topicGuess(u),
    learningObjectives: [...obj.objectives.knowledge, ...obj.objectives.skills],
    vocabularyCount: vocabItems.filter(v => v.unit === u + 1).length,
    grammarIds: grammar.filter(g => g.unit === u + 1).map(g => g.id),
    exerciseCount: exs.length,
    studyGuide: obj.studyGuide,
  };
});

function topicGuess(u) {
  return [
    "school subjects, sports, hobbies, describing people, present simple/continuous, articles",
    "feelings, -ed/-ing adjectives, past simple",
    "landscape, extreme adjectives, sports equipment, past continuous",
    "TV programmes and films, negative prefixes, quantifiers, must/have to",
    "weather, natural disasters, environment, comparisons, too/enough, zero conditional",
  ][u];
}

// Sửa thủ công các ô nghĩa trống/bị cắt trong docx
const MANUAL_FIXES = {
  abseiling: {
    meaningVi: "môn đu dây leo xuống vách đá",
    meaningEn: "the sport of descending a steep drop using a rope and a harness",
  },
};
for (const v of vocabItems) {
  const fix = MANUAL_FIXES[v.lemma];
  if (fix) {
    if (!v.meaningVi && fix.meaningVi) v.meaningVi = fix.meaningVi;
    if (!v.meaningEn && fix.meaningEn) v.meaningEn = fix.meaningEn;
  }
}

// Dedupe theo lemma
const seen = new Set();
const vocabUnique = vocabItems.filter(v => (seen.has(v.lemma) ? false : (seen.add(v.lemma), true)));

// ── Chunks vector-ready ──
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

// ── Xuất ──
const outDir = "E:/app-hoc-tieng-anh/dataset";
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "vocabulary.json"), JSON.stringify({ total: vocabUnique.length, items: vocabUnique }, null, 2));
fs.writeFileSync(path.join(outDir, "grammar-reference.json"), JSON.stringify({ total: grammar.length, items: grammar }, null, 2));
fs.writeFileSync(path.join(outDir, "exercises.json"), JSON.stringify({ units: exercises }, null, 2));
fs.writeFileSync(path.join(outDir, "objectives.json"), JSON.stringify(objectives, null, 2));
fs.writeFileSync(path.join(outDir, "lessons.json"), JSON.stringify({ total: lessons.length, items: lessons }, null, 2));
fs.writeFileSync(path.join(outDir, "chunks.json"), JSON.stringify({ total: chunks.length, items: chunks }, null, 2));

console.log("VOCAB:", vocabUnique.length);
console.log("GRAMMAR:", grammar.length);
console.log("EXERCISES:", exercises.map(e => `U${e.unit}:${e.exercises.length}`).join(" "));
console.log("LESSONS:", lessons.length);
console.log("CHUNKS:", chunks.length);
