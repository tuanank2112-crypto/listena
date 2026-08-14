"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Flashcard {
  id: string;
  front: string;
  back: string;
  cardType: string;
  vocabularyItem: {
    id: string;
    displayText: string;
    meaningVi: string;
    ipa: string | null;
  };
  reviewLogs: Array<{
    rating: string;
    reviewedAt: string;
  }>;
}

export function FlashcardsClient({
  flashcards,
  dueCount,
  totalCount,
}: {
  flashcards: Flashcard[];
  dueCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Only show due flashcards
  const dueFlashcards = flashcards;
  // In a real app, we'd filter by due status from the server

  const currentCard = dueFlashcards[currentIndex];
  const hasCards = dueFlashcards.length > 0;

  const handleRating = async (rating: "AGAIN" | "HARD" | "GOOD" | "EASY") => {
    if (!currentCard) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flashcardId: currentCard.id,
          rating,
          responseTimeMs: 1000,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit review");

      setMessage(
        rating === "AGAIN"
          ? "Sẽ ôn lại sau 10 phút"
          : rating === "HARD"
            ? "Sẽ ôn lại sau 1 giờ"
            : rating === "GOOD"
              ? "Sẽ ôn lại sau 1 ngày"
              : "Sẽ ôn lại sau 3 ngày"
      );

      setFlipped(false);
      setTimeout(() => {
        setMessage("");
        if (currentIndex < dueFlashcards.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasCards) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Flashcard</h1>
        <p className="mb-8 text-sm text-gray-500">
          Ôn tập từ vựng bằng phương pháp lặp lại ngắt quãng
        </p>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-4 text-gray-500">
            Không có flashcard nào cần ôn hôm nay!
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Hãy làm bài tập để tạo flashcard mới.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Flashcard</h1>
      <p className="mb-2 text-sm text-gray-500">
        Ôn tập từ vựng bằng phương pháp lặp lại ngắt quãng
      </p>
      <p className="mb-8 text-sm text-gray-400">
        {dueCount} thẻ cần ôn • {totalCount} tổng số thẻ
      </p>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Thẻ {currentIndex + 1} / {dueFlashcards.length}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{
              width: `${((currentIndex + 1) / dueFlashcards.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div
        className="mb-6 cursor-pointer"
        onClick={() => !submitting && setFlipped(!flipped)}
      >
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border-2 border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-md">
          {!flipped ? (
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {currentCard.front}
              </p>
              {currentCard.vocabularyItem.ipa && (
                <p className="mt-2 text-sm text-gray-400">
                  {currentCard.vocabularyItem.ipa}
                </p>
              )}
              <p className="mt-4 text-xs text-gray-400">Nhấn để xem nghĩa</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xl font-medium text-gray-900">
                {currentCard.vocabularyItem.meaningVi}
              </p>
              {currentCard.vocabularyItem.ipa && (
                <p className="mt-2 text-sm text-gray-400">
                  /{currentCard.vocabularyItem.ipa}/
                </p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {currentCard.front}
              </p>
              <p className="mt-4 text-xs text-gray-400">Nhấn để xem lại</p>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-center text-sm text-indigo-700">
          {message}
        </div>
      )}

      {/* Rating buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => handleRating("AGAIN")}
          disabled={!flipped || submitting}
          className="rounded-lg bg-red-500 px-3 py-3 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          🔄 Lại
        </button>
        <button
          onClick={() => handleRating("HARD")}
          disabled={!flipped || submitting}
          className="rounded-lg bg-amber-500 px-3 py-3 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          😓 Khó
        </button>
        <button
          onClick={() => handleRating("GOOD")}
          disabled={!flipped || submitting}
          className="rounded-lg bg-green-500 px-3 py-3 text-xs font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
        >
          ✅ Tốt
        </button>
        <button
          onClick={() => handleRating("EASY")}
          disabled={!flipped || submitting}
          className="rounded-lg bg-blue-500 px-3 py-3 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          ⚡ Dễ
        </button>
      </div>
    </div>
  );
}
