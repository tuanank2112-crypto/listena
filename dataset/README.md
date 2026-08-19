# Dataset TATQHP1 — SOLUTIONS Pre-Intermediate (Sách Hướng Dẫn Học)

Dataset trích xuất từ file:
**`Sách HDH TATQHP1 SOLUTIONS đã chỉnh sửa theo ý kiến hội đồng lần 2.docx`**

Được thiết kế để **tích hợp trực tiếp vào ListenAI** (`E:\app-hoc-tieng-anh`) — hệ thống tự học tiếng Anh bằng AI — và để **vector hóa (RAG/embeddings)** cho AI tutor.

## Cấu trúc dataset

| File | Nội dung | Khớp với model ListenAI |
|---|---|---|
| `vocabulary.json` | 116 từ vựng (lemma, IPA, POS, nghĩa EN/VI, ví dụ) | `VocabularyItem` + `LessonVocabulary` |
| `grammar-reference.json` | 10 chủ điểm ngữ pháp (5 bài) | Prompt cho AI tutor / `AIInteraction` |
| `exercises.json` | 54 bài tập (10–14 bài/bài) kèm đáp án | `Exercise` + `Attempt` |
| `objectives.json` | Mục tiêu & hướng dẫn học 5 bài | `Lesson.learningObjectives` |
| `lessons.json` | 5 bài học tổng hợp (topic, vocab, grammar, exercises) | `Lesson` + `Course` |
| `chunks.json` | 201 chunk văn bản sẵn sàng embedding | RAG / vector store |
| `educaplay-danang.json` | Mẫu bài dictation "Da Nang Family Getaway" (6 câu + audio) | `Lesson` FULL_DICTATION |
| `manifest.json` | Metadata tổng quan dataset | — |

## 5 bài học

1. **INTRODUCTION** — môn học/thể thao, miêu tả người & trang phục; hiện tại đơn vs tiếp diễn; mạo từ a/an/the
2. **FEELINGS** — cảm xúc, tính từ -ed/-ing; thì quá khứ đơn
3. **ADVENTURE** — cảnh quan, tính từ cực cấp, dụng cụ thể thao; quá khứ tiếp diễn
4. **ON SCREEN** — phim ảnh/TV, tiền tố phủ định; lượng từ; must/have to
5. **WEATHER** — thời tiết, thiên tai, môi trường; so sánh, too/enough, câu điều kiện loại 0

## Cách tích hợp vào ListenAI

### 1. Seed từ vựng (khớp `VocabularyItem`)

```ts
import { PrismaClient } from "@prisma/client";
import vocab from "../dataset/vocabulary.json";

const prisma = new PrismaClient();
for (const v of vocab.items) {
  await prisma.vocabularyItem.upsert({
    where: { lemma: v.lemma },
    update: {},
    create: {
      lemma: v.lemma,
      displayText: v.displayText,
      ipa: v.ipa,
      meaningVi: v.meaningVi,
      meaningEn: v.meaningEn,
      partOfSpeech: v.partOfSpeech,
      cefrLevel: v.cefrLevel as any,
      exampleSentence: v.exampleSentence,
    },
  });
}
```

### 2. Tạo bài học (qua `POST /api/teacher/lesson` hoặc seed)

- Dùng `lessons.json` làm metadata; map `vocabulary.json` theo `unit` vào `LessonVocabulary`.
- `educaplay-danang.json` là mẫu bài `FULL_DICTATION` hoàn chỉnh: 6 `LessonSegment`, mỗi segment 1 `Exercise` FULL_DICTATION với `correctAnswer = segment.text`, `audioUrl = resources + audio` (có thể chuyển sang `server/tts` khi cần).

### 3. Vector hóa (RAG)

`chunks.json` đã được chia sẵn theo đơn vị ngữ nghĩa (1 chunk/từ, 1 chunk/chủ điểm ngữ pháp, 1 chunk/bài tập, 1 chunk/mục tiêu). Mỗi chunk có:

```json
{
  "id": "vocab_1_skateboarding",
  "unit": 1,
  "type": "vocabulary",
  "title": "skateboarding",
  "text": "...",
  "metadata": { "lemma": "...", "ipa": "...", "cefrLevel": "A2", ... }
}
```

Embedding các chunk này (e.g. OpenAI `text-embedding-3-small` hoặc model nội bộ) và lưu vào vector store; khi học viên hỏi, retrieve theo `unit`/`type` để nạp ngữ cảnh cho AI tutor.

## Tái tạo dataset

Script nguồn: `scripts/build-dataset.mjs` (đọc `dataset/source/docx_content.json` — bản trích xuất raw của docx). Chạy:

```bash
node scripts/build-dataset.mjs
```

## Lưu ý

- Từ vựng trùng lemma giữa các bài đã được dedupe (ưu tiên bài đầu tiên).
- `cefrLevel` mặc định `A2` theo giáo trình Solutions Pre-Intermediate (có thể tinh chỉnh từng từ).
- Một số bài dùng bảng (matching, word bank) — nội dung đã được lấy từ bảng trong docx, đáp án đính kèm nếu có.
- Bài viết tự do (Writing/Speaking) có đáp án gợi ý (suggested answers), không phải đáp án duy nhất.
