import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { getDatasetUnit, searchKnowledge } from "@/server/dataset/catalog";

const TutorRequestSchema = z.object({
  lessonId: z.string().uuid(),
  question: z.string().trim().min(2).max(1000),
  exerciseId: z.string().uuid().optional(),
});

interface TutorSource {
  id: string;
  title: string;
  type: string;
  text: string;
}

function fallbackAnswer(question: string, sources: TutorSource[], lessonTitle: string) {
  if (!sources.length) {
    return `Mình chưa tìm thấy phần kiến thức phù hợp trong ${lessonTitle}. Hãy hỏi cụ thể một từ, cấu trúc ngữ pháp hoặc bài tập trong bài này nhé.`;
  }

  const evidence = sources
    .slice(0, 2)
    .map((source, index) => {
      const excerpt = source.text.replace(/\s+/g, " ").trim().slice(0, 420);
      return `${index + 1}. ${source.title}: ${excerpt}${source.text.length > 420 ? "…" : ""}`;
    })
    .join("\n\n");
  return [
    `Dựa trên nội dung đã xác minh của ${lessonTitle}:`,
    evidence,
    "Bài tập nhỏ: hãy tự đặt một câu tiếng Anh với kiến thức vừa xem, rồi gửi mình kiểm tra.",
  ].join("\n\n");
}

async function generateAIAnswer(params: {
  question: string;
  lessonTitle: string;
  cefrLevel: string;
  sources: TutorSource[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.AI_PROVIDER !== "openai" || !apiKey) {
    return { answer: fallbackAnswer(params.question, params.sources, params.lessonTitle), model: "dataset-retrieval" };
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: [
            "Bạn là gia sư tiếng Anh cho người Việt ở trình độ A2.",
            "Chỉ dùng ngữ cảnh được cung cấp; không bịa kiến thức ngoài nguồn.",
            "Giải thích ngắn gọn bằng tiếng Việt, giữ ví dụ tiếng Anh và kết thúc bằng một bài tập nhỏ.",
            "Nếu ngữ cảnh không đủ, nói rõ điều đó.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            lesson: params.lessonTitle,
            cefrLevel: params.cefrLevel,
            question: params.question,
            verifiedContext: params.sources.map((source) => ({
              title: source.title,
              type: source.type,
              text: source.text,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI tutor failed with status ${response.status}`);
  const payload = await response.json();
  const answer = payload.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("AI tutor returned no content");
  return { answer: answer.trim(), model };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = TutorRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Câu hỏi không hợp lệ", details: parsed.error.flatten() }, { status: 400 });
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: parsed.data.lessonId },
      select: {
        id: true,
        title: true,
        topic: true,
        cefrLevel: true,
        status: true,
        transcript: true,
        vocabulary: {
          take: 20,
          include: { vocabularyItem: true },
        },
      },
    });
    if (!lesson || lesson.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Không tìm thấy bài học" }, { status: 404 });
    }

    const unit = getDatasetUnit(lesson.title);
    const knowledge = unit ? searchKnowledge(parsed.data.question, unit, 5) : [];
    const sources: TutorSource[] = knowledge.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      text: item.text,
    }));
    if (!unit) {
      const normalizedQuestion = parsed.data.question.toLowerCase();
      const vocabularySources = lesson.vocabulary
        .map(({ vocabularyItem }) => ({
          id: `lesson-${lesson.id}-vocabulary-${vocabularyItem.id}`,
          title: vocabularyItem.displayText,
          type: "vocabulary",
          text: [vocabularyItem.displayText, vocabularyItem.ipa, vocabularyItem.meaningVi, vocabularyItem.meaningEn, vocabularyItem.exampleSentence]
            .filter(Boolean)
            .join(". "),
          matchesQuestion: normalizedQuestion.includes(vocabularyItem.displayText.toLowerCase()),
        }))
        .sort((left, right) => Number(right.matchesQuestion) - Number(left.matchesQuestion));
      sources.push(
        ...vocabularySources.slice(0, 8).map(({ matchesQuestion: _matchesQuestion, ...source }) => source),
        {
          id: `lesson-${lesson.id}-transcript`,
          title: `${lesson.title} transcript`,
          type: "lesson",
          text: lesson.transcript.slice(0, 2400),
        }
      );
    }
    const result = await generateAIAnswer({
      question: parsed.data.question,
      lessonTitle: lesson.title,
      cefrLevel: lesson.cefrLevel,
      sources,
    }).catch((error) => {
      logger.warn({ error, lessonId: lesson.id }, "AI tutor provider failed, using dataset retrieval");
      return { answer: fallbackAnswer(parsed.data.question, sources, lesson.title), model: "dataset-retrieval" };
    });

    await prisma.aIInteraction.create({
      data: {
        userId: session.user.id,
        purpose: "dataset_tutor",
        model: result.model,
        promptVersion: "2.0",
        validatedOutput: JSON.stringify({ answer: result.answer, sourceIds: sources.slice(0, 2).map((source) => source.id) }),
        latencyMs: Date.now() - startedAt,
        success: true,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      model: result.model,
      sources: sources.slice(0, 2).map(({ id, title, type }) => ({ id, title, type })),
    });
  } catch (error) {
    logger.error({ error }, "Dataset tutor request failed");
    return NextResponse.json({ error: "Gia sư AI đang bận. Vui lòng thử lại." }, { status: 500 });
  }
}
