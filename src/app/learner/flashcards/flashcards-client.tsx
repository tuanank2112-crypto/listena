"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RotateCw, Sparkles, CheckCircle, XCircle, HelpCircle, Zap } from "lucide-react";

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
  reviewLogs: Array<{ rating: string; reviewedAt: string }>;
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

  const currentCard = flashcards[currentIndex];
  const hasCards = flashcards.length > 0;

  const handleRating = async (rating: "AGAIN" | "HARD" | "GOOD" | "EASY") => {
    if (!currentCard) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: currentCard.id, rating, responseTimeMs: 1000 }),
      });
      if (!res.ok) throw new Error("Failed to submit review");

      setMessage(
        rating === "AGAIN" ? "Sẽ ôn lại sau 10 phút" :
        rating === "HARD" ? "Sẽ ôn lại sau 1 giờ" :
        rating === "GOOD" ? "Sẽ ôn lại sau 1 ngày" : "Sẽ ôn lại sau 3 ngày"
      );
      setFlipped(false);
      setTimeout(() => {
        setMessage("");
        if (currentIndex < flashcards.length - 1) {
          setCurrentIndex(i => i + 1);
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
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Flashcard</h1>
        <p className="mt-2 text-sm text-slate-400">Ôn tập từ vựng bằng phương pháp lặp lại ngắt quãng</p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-16 text-center">
          <Sparkles className="mx-auto mb-4 h-16 w-16 text-slate-600" />
          <p className="text-slate-300 text-lg">🎉 Không có flashcard nào cần ôn hôm nay!</p>
          <p className="mt-2 text-sm text-slate-500">Hãy làm bài tập để tạo flashcard mới.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold text-white">Flashcard</h1>
      <p className="mt-2 text-sm text-slate-400">Ôn tập từ vựng bằng phương pháp lặp lại ngắt quãng</p>
      <p className="mt-1 text-sm text-slate-500">{dueCount} thẻ cần ôn • {totalCount} tổng số thẻ</p>

      {/* Progress */}
      <div className="mt-8 mb-6">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Thẻ {currentIndex + 1} / {flashcards.length}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <motion.div
        key={currentCard?.id}
        initial={{ opacity: 0, rotateY: flipped ? 180 : 0 }}
        animate={{ opacity: 1, rotateY: 0 }}
        className="mb-6"
      >
        <div
          className="relative cursor-pointer"
          onClick={() => !submitting && setFlipped(!flipped)}
        >
          <div className="relative min-h-[280px] rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:bg-white/[0.07]">
            {/* Card type indicator */}
            <div className="absolute top-4 right-4 text-xs text-slate-600">
              <RotateCw className="inline h-3.5 w-3.5 mr-1" /> Nhấn để lật
            </div>

            {!flipped ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-white">{currentCard.front}</p>
                {currentCard.vocabularyItem.ipa && (
                  <p className="mt-3 text-sm text-slate-500">/{currentCard.vocabularyItem.ipa}/</p>
                )}
                <p className="mt-6 text-xs text-slate-600">Nhấn để xem nghĩa</p>
              </div>
            ) : (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <p className="text-2xl font-medium text-white">{currentCard.vocabularyItem.meaningVi}</p>
                {currentCard.vocabularyItem.ipa && (
                  <p className="mt-2 text-sm text-slate-500">/{currentCard.vocabularyItem.ipa}/</p>
                )}
                <p className="mt-1 text-sm text-slate-400">{currentCard.front}</p>
                <p className="mt-6 text-xs text-slate-600">Nhấn để xem lại mặt trước</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {message && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 text-center text-sm text-indigo-300">
          {message}
        </motion.div>
      )}

      {/* Rating buttons - only show when flipped */}
      {flipped && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-4 gap-3">
          {[
            { rating: "AGAIN" as const, label: "Lại", icon: XCircle, color: "from-red-500 to-red-600", shadow: "shadow-red-500/20" },
            { rating: "HARD" as const, label: "Khó", icon: HelpCircle, color: "from-amber-500 to-orange-500", shadow: "shadow-amber-500/20" },
            { rating: "GOOD" as const, label: "Tốt", icon: CheckCircle, color: "from-green-500 to-emerald-500", shadow: "shadow-green-500/20" },
            { rating: "EASY" as const, label: "Dễ", icon: Zap, color: "from-blue-500 to-indigo-500", shadow: "shadow-blue-500/20" },
          ].map(({ rating, label, icon: Icon, color, shadow }) => (
            <button
              key={rating}
              onClick={() => handleRating(rating)}
              disabled={submitting}
              className={`group flex flex-col items-center gap-2 rounded-xl bg-gradient-to-br ${color} ${shadow} px-3 py-4 text-xs font-semibold text-white shadow-lg transition-all hover:scale-105 disabled:opacity-50`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
