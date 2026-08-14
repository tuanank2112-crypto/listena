"use client";

import Link from "next/link";

interface AttemptData {
  id: string;
  submittedAnswer: string;
  score: number | null;
  replayCount: number;
  hintCount: number;
  createdAt: string;
  exercise: {
    type: string;
    prompt: string;
    correctAnswer: string;
  };
  lesson: {
    id: string;
    title: string;
    transcript: string;
    cefrLevel: string;
  };
  errors: Array<{
    id: string;
    errorType: string;
    expectedText: string;
    actualText: string | null;
    position: number;
    confidence: number;
    aiExplanation: string | null;
    remediationType: string | null;
  }>;
  flashcards: Array<{
    id: string;
    front: string;
    back: string;
    vocabularyItem: {
      id: string;
      displayText: string;
      meaningVi: string;
    };
  }>;
}

export function AttemptResultClient({
  attempt,
  recommendation,
}: {
  attempt: AttemptData;
  recommendation: { id: string; title: string } | null;
}) {
  const score = attempt.score ?? 0;
  const scoreColor =
    score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-red-600";
  const scoreBg =
    score >= 70
      ? "bg-green-100"
      : score >= 40
        ? "bg-amber-100"
        : "bg-red-100";

  const wordErrors = attempt.errors.filter(
    (e) => e.errorType === "MISSING_WORD" || e.errorType === "EXTRA_WORD"
  );
  const spellingErrors = attempt.errors.filter(
    (e) => e.errorType === "SPELLING"
  );
  const otherErrors = attempt.errors.filter(
    (e) => !["MISSING_WORD", "EXTRA_WORD", "SPELLING"].includes(e.errorType)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Back link */}
      <Link
        href={`/learner/lessons/${attempt.lesson.id}`}
        className="mb-6 inline-block text-sm text-gray-500 hover:text-gray-700"
      >
        ← Quay lại bài học
      </Link>

      {/* Score */}
      <div className="mb-8 text-center">
        <div
          className={`inline-flex h-24 w-24 items-center justify-center rounded-full ${scoreBg} text-3xl font-bold ${scoreColor}`}
        >
          {score}
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">
          Kết quả bài tập
        </h1>
        <p className="mt-1 text-sm text-gray-500">{attempt.lesson.title}</p>
      </div>

      {/* Word Diff */}
      {attempt.errors.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            So sánh câu trả lời
          </h2>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase">
              Câu đúng:
            </p>
            <p className="leading-relaxed text-gray-900">
              {attempt.exercise.correctAnswer.split(" ").map((word, i) => {
                const error = attempt.errors.find(
                  (e) => e.expectedText === word
                );
                const isCorrect = !error;
                return (
                  <span
                    key={i}
                    className={`mx-0.5 ${
                      isCorrect ? "text-gray-900" : "text-red-600 line-through"
                    }`}
                  >
                    {word}{" "}
                  </span>
                );
              })}
            </p>
          </div>
          <div className="mt-2 rounded-lg bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase">
              Câu trả lời của bạn:
            </p>
            <p
              className={`leading-relaxed ${
                attempt.submittedAnswer ? "text-gray-900" : "text-gray-400 italic"
              }`}
            >
              {attempt.submittedAnswer || "(trống)"}
            </p>
          </div>
        </div>
      )}

      {/* Error Summary */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <p className="text-lg font-bold text-red-600">{wordErrors.length}</p>
          <p className="text-xs text-gray-500">Từ thiếu/thừa</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <p className="text-lg font-bold text-amber-600">
            {spellingErrors.length}
          </p>
          <p className="text-xs text-gray-500">Lỗi chính tả</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <p className="text-lg font-bold text-indigo-600">
            {otherErrors.length}
          </p>
          <p className="text-xs text-gray-500">Lỗi khác</p>
        </div>
      </div>

      {/* AI Feedback */}
      {attempt.errors
        .filter((e) => e.aiExplanation)
        .slice(0, 3)
        .map((error) => (
          <div
            key={error.id}
            className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-800">
                {error.errorType}
              </span>
              <span className="text-sm font-medium text-gray-900">
                &ldquo;{error.expectedText}&rdquo;
              </span>
              {error.actualText && (
                <span className="text-sm text-gray-500">
                  → &ldquo;{error.actualText}&rdquo;
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-gray-700">
              {error.aiExplanation}
            </p>
          </div>
        ))}

      {/* Deterministic fallback feedback */}
      {attempt.errors.filter((e) => !e.aiExplanation).length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Phân tích lỗi
          </h2>
          <div className="space-y-2">
            {attempt.errors
              .filter((e) => !e.aiExplanation)
              .map((error) => (
                <div
                  key={error.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      error.errorType === "SPELLING"
                        ? "bg-amber-100 text-amber-700"
                        : error.errorType === "FUNCTION_WORD"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {error.errorType}
                  </span>
                  <span className="text-gray-700">
                    "{error.expectedText}"
                    {error.actualText && ` → "${error.actualText}"`}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Flashcards created */}
      {attempt.flashcards.length > 0 && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-green-800">
            🃏 Flashcard được tạo ({attempt.flashcards.length} thẻ)
          </h2>
          <div className="flex flex-wrap gap-2">
            {attempt.flashcards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-900">{card.front}</span>
                <span className="ml-2 text-gray-500">
                  - {card.vocabularyItem.meaningVi}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/learner/flashcards"
            className="mt-3 inline-block text-sm font-medium text-green-700 hover:text-green-600"
          >
            Ôn tập flashcard →
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Thông tin bài làm
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Số lần nghe lại: </span>
            <span className="font-medium text-gray-900">{attempt.replayCount}</span>
          </div>
          <div>
            <span className="text-gray-500">Số lần gợi ý: </span>
            <span className="font-medium text-gray-900">{attempt.hintCount}</span>
          </div>
        </div>
      </div>

      {/* Next steps */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/learner/lessons/${attempt.lesson.id}`}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Luyện lại bài này
        </Link>
        {recommendation && (
          <Link
            href={`/learner/lessons/${recommendation.id}`}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Bài tiếp theo: {recommendation.title}
          </Link>
        )}
        <Link
          href="/learner/flashcards"
          className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          🃏 Ôn flashcard
        </Link>
      </div>

      {/* Disclaimer */}
      <p className="mt-6 text-xs text-gray-400">
        ⚠ Phản hồi AI có thể sai. Hãy kiểm tra thông tin từ nguồn đáng tin cậy.
      </p>
    </div>
  );
}
