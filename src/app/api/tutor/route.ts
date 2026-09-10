import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { getDatasetUnit, searchKnowledge } from "@/server/dataset/catalog";
import { AIUnavailableError, isAIProviderError } from "@/server/ai/errors";
import {
  reserveUserAICall,
  settleUserAICall,
} from "@/server/ai/request-budget";
import {
  createConfiguredStructuredAIProvider,
  type JsonSchema,
} from "@/server/ai/openai-responses-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const TutorRequestSchema = z.object({
  lessonId: z.string().uuid(),
  question: z.string().trim().min(2).max(1000),
  exerciseId: z.string().uuid().optional(),
});

const TutorAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(2_000),
});

const TutorAnswerJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: {
    answer: { type: "string" },
  },
};

interface TutorSource {
  id: string;
  title: string;
  type: string;
  text: string;
}

async function generateAIAnswer(params: {
  question: string;
  lessonTitle: string;
  cefrLevel: string;
  sources: TutorSource[];
  safetyIdentifier: string;
}) {
  const provider = createConfiguredStructuredAIProvider();
  if (!provider) {
    throw new AIUnavailableError({ reason: "provider_not_configured" });
  }

  const reservation = await reserveUserAICall({
    userId: params.safetyIdentifier,
    purpose: "dataset_tutor",
    provider: provider.providerName,
    model: provider.modelName,
  });
  let response;
  try {
    response = await provider.generateJson<unknown>({
      purpose: "lesson_tutor",
      systemPrompt: [
        "Bạn là gia sư tiếng Anh cho người Việt ở trình độ được cung cấp.",
        "Chỉ dùng ngữ cảnh đã xác minh của máy chủ; không bịa kiến thức ngoài nguồn.",
        "Giải thích ngắn gọn bằng tiếng Việt, giữ ví dụ tiếng Anh và kết thúc bằng một bài tập nhỏ.",
        "Nếu ngữ cảnh không đủ, nói rõ điều đó.",
      ].join(" "),
      input: {
        lesson: params.lessonTitle,
        cefrLevel: params.cefrLevel,
        question: params.question,
        verifiedContext: params.sources.map((source) => ({
          title: source.title,
          type: source.type,
          text: source.text,
        })),
      },
      schemaName: "lesson_tutor_answer",
      schema: TutorAnswerJsonSchema,
      safetyIdentifier: params.safetyIdentifier,
      maxOutputTokens: 700,
    });
  } catch (error) {
    await settleUserAICall(reservation, {
      success: false,
      provider: provider.providerName,
      model: provider.modelName,
      failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
    });
    throw error;
  }

  const parsed = TutorAnswerSchema.safeParse(response.output);
  if (!parsed.success) {
    await settleUserAICall(reservation, {
      success: false,
      provider: response.provider,
      model: response.model,
      requestId: response.requestId,
      failureReason: "schema_validation_failed",
    });
    throw new AIUnavailableError({
      reason: "schema_validation_failed",
      provider: response.provider,
      model: response.model,
      requestId: response.requestId,
    });
  }

  await settleUserAICall(reservation, {
    success: true,
    provider: response.provider,
    model: response.model,
    requestId: response.requestId,
  });

  return { ...parsed.data, ...response };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = TutorRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Câu hỏi không hợp lệ", details: parsed.error.flatten() },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Không tìm thấy bài học" },
        { status: 404 },
      );
    }

    const unit = getDatasetUnit(lesson.title);
    const knowledge = unit
      ? searchKnowledge(parsed.data.question, unit, 5)
      : [];
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
          text: [
            vocabularyItem.displayText,
            vocabularyItem.ipa,
            vocabularyItem.meaningVi,
            vocabularyItem.meaningEn,
            vocabularyItem.exampleSentence,
          ]
            .filter(Boolean)
            .join(". "),
          matchesQuestion: normalizedQuestion.includes(
            vocabularyItem.displayText.toLowerCase(),
          ),
        }))
        .sort(
          (left, right) =>
            Number(right.matchesQuestion) - Number(left.matchesQuestion),
        );
      sources.push(
        ...vocabularySources
          .slice(0, 8)
          .map(({ id, title, type, text }) => ({ id, title, type, text })),
        {
          id: `lesson-${lesson.id}-transcript`,
          title: `${lesson.title} transcript`,
          type: "lesson",
          text: lesson.transcript.slice(0, 2_400),
        },
      );
    }

    const result = await generateAIAnswer({
      question: parsed.data.question,
      lessonTitle: lesson.title,
      cefrLevel: lesson.cefrLevel,
      sources,
      safetyIdentifier: session.user.id,
    });

    await prisma.aIInteraction.create({
      data: {
        userId: session.user.id,
        purpose: "dataset_tutor",
        provider: result.provider,
        model: result.model,
        promptVersion: "responses-tutor-1.0",
        inputHash: createHash("sha256")
          .update(
            JSON.stringify({
              lessonId: lesson.id,
              question: parsed.data.question,
            }),
          )
          .digest("hex"),
        validatedOutput: JSON.stringify({
          answer: result.answer,
          sourceIds: sources.slice(0, 2).map((source) => source.id),
        }),
        latencyMs: Date.now() - startedAt,
        traceId: result.requestId,
        success: true,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      model: result.model,
      sources: sources
        .slice(0, 2)
        .map(({ id, title, type }) => ({ id, title, type })),
    });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    if (isAIProviderError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details.retryAfterSeconds
            ? { retryAfterSeconds: error.details.retryAfterSeconds }
            : {}),
        },
        {
          status: error.status,
          headers: error.details.retryAfterSeconds
            ? { "Retry-After": String(error.details.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown" },
      "Dataset tutor request failed",
    );
    return NextResponse.json(
      {
        error: "Gia sư AI đang bận. Vui lòng thử lại.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
