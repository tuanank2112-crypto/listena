"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ArrowRight, Sparkles, RefreshCw, AlertTriangle, CheckCircle, XCircle, HelpCircle } from "lucide-react";

interface AttemptData {
  id: string;
  submittedAnswer: string;
  score: number | null;
  replayCount: number;
  hintCount: number;
  createdAt: string;
  exercise: { type: string; prompt: string; correctAnswer: string };
  lesson: { id: string; title: string; transcript: string; cefrLevel: string };
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
    vocabularyItem: { id: string; displayText: string; meaningVi: string };
  }>;
}

const errorTypeLabels: Record<string, string> = {
  MISSING_WORD: "Thiếu từ",
  EXTRA_WORD: "Thừa từ",
  SPELLING: "Chính tả",
  FUNCTION_WORD: "Từ chức năng",
  SEGMENTATION: "Phân tách từ",
  PHONOLOGICAL: "Phát âm",
  GRAMMAR: "Ngữ pháp",
  VOCABULARY: "Từ vựng",
  UNKNOWN: "Không xác định",
};

export function AttemptResultClient({
  attempt,
  recommendation,
}: {
  attempt: AttemptData;
  recommendation: { id: string; title: string } | null;
}) {
  const score = attempt.score ?? 0;
  const scoreConfig = score >= 70
    ? { color: "text-green-400", bg: "bg-green-500/20", border: "border-green-500/30", label: "Tốt!" }
    : score >= 40
      ? { color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30", label: "Cần cố gắng" }
      : { color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30", label: "Cần cải thiện" };

  const wordErrors = attempt.errors.filter(e => e.errorType === "MISSING_WORD" || e.errorType === "EXTRA_WORD");
  const spellingErrors = attempt.errors.filter(e => e.errorType === "SPELLING");
  const otherErrors = attempt.errors.filter(e => !["MISSING_WORD", "EXTRA_WORD", "SPELLING"].includes(e.errorType));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back link */}
      <Link href={`/learner/lessons/${attempt.lesson.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Quay lại bài học
      </Link>

      {/* Score Hero */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mb-10 text-center">
        <div className={`inline-flex h-28 w-28 items-center justify-center rounded-full ${scoreConfig.bg} ${scoreConfig.border} border-2`}>
          <span className={`text-4xl font-bold ${scoreConfig.color}`}>{score}</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">{scoreConfig.label}</h1>
        <p className="mt-1 text-sm text-slate-400">{attempt.lesson.title} — {attempt.lesson.cefrLevel}</p>
      </motion.div>

      {/* Error Summary Cards */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8 grid grid-cols-3 gap-4">
        {[
          { count: wordErrors.length, label: "Từ thiếu/thừa", icon: XCircle, color: "from-red-500 to-rose-500" },
          { count: spellingErrors.length, label: "Lỗi chính tả", icon: AlertTriangle, color: "from-amber-500 to-orange-500" },
          { count: otherErrors.length, label: "Lỗi khác", icon: HelpCircle, color: "from-indigo-500 to-cyan-500" },
        ].map((stat, i) => (
          <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm text-center">
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-[0.03]`} />
            <div className="relative z-10">
              <stat.icon className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              <p className={`text-2xl font-bold ${stat.count > 0 ? 'text-white' : 'text-slate-500'}`}>{stat.count}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Word Diff */}
      {attempt.errors.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="mb-4 text-sm font-semibold text-white">So sánh câu trả lời</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Câu đúng:</p>
              <div className="rounded-xl bg-white/[0.02] p-4 border border-white/5">
                <p className="leading-relaxed text-white">
                  {attempt.exercise.correctAnswer.split(" ").map((word, i) => {
                    const error = attempt.errors.find(e => e.expectedText === word);
                    return (
                      <span key={i} className={`mx-0.5 ${error ? 'text-red-400 line-through' : ''}`}>
                        {word}{' '}
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Câu trả lời của bạn:</p>
              <div className="rounded-xl bg-white/[0.02] p-4 border border-white/5">
                <p className={`leading-relaxed ${attempt.submittedAnswer ? 'text-white' : 'text-slate-500 italic'}`}>
                  {attempt.submittedAnswer || "(trống)"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Feedback */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="mb-4 text-lg font-semibold text-white">Phân tích lỗi</h2>
          <div className="space-y-3">
            {attempt.errors.filter(e => e.aiExplanation).slice(0, 5).map((error) => (
              <div key={error.id} className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300">
                    {errorTypeLabels[error.errorType] || error.errorType}
                  </span>
                  {error.actualText && (
                    <span className="text-xs text-slate-500">
                      → &ldquo;{error.actualText}&rdquo;
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-slate-300">{error.aiExplanation}</p>
              </div>
            ))}
            {attempt.errors.filter(e => !e.aiExplanation).map((error) => (
              <div key={error.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    error.errorType === "SPELLING" ? "bg-amber-500/20 text-amber-300" :
                    error.errorType === "FUNCTION_WORD" ? "bg-purple-500/20 text-purple-300" :
                    "bg-slate-500/20 text-slate-300"
                  }`}>
                    {errorTypeLabels[error.errorType] || error.errorType}
                  </span>
                  <span className="text-slate-400">
                    &ldquo;{error.expectedText}&rdquo;
                    {error.actualText && ` → "${error.actualText}"`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Flashcards created */}
          {attempt.flashcards.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5">
              <h2 className="mb-3 text-sm font-semibold text-green-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Flashcard được tạo ({attempt.flashcards.length} thẻ)
              </h2>
              <div className="flex flex-wrap gap-2">
                {attempt.flashcards.map(card => (
                  <div key={card.id} className="rounded-xl border border-green-500/20 bg-white/[0.02] px-3 py-2 text-sm">
                    <span className="font-medium text-white">{card.front}</span>
                    <span className="ml-2 text-slate-400">- {card.vocabularyItem.meaningVi}</span>
                  </div>
                ))}
              </div>
              <Link href="/learner/flashcards" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-green-400 hover:text-green-300">
                Ôn tập flashcard <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          )}

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h2 className="mb-3 text-sm font-semibold text-white">Thông tin bài làm</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/[0.02] p-3 border border-white/5">
                <span className="text-slate-500">Số lần nghe lại: </span>
                <span className="font-medium text-white">{attempt.replayCount}</span>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-3 border border-white/5">
                <span className="text-slate-500">Số lần gợi ý: </span>
                <span className="font-medium text-white">{attempt.hintCount}</span>
              </div>
            </div>
          </motion.div>

          {/* Next steps */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex flex-col gap-3">
            <Link href={`/learner/lessons/${attempt.lesson.id}`} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:bg-white/10">
              <RefreshCw className="h-4 w-4" /> Luyện lại bài này
            </Link>
            {recommendation && (
              <Link href={`/learner/lessons/${recommendation.id}`} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500">
                Bài tiếp theo: {recommendation.title} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link href="/learner/flashcards" className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/20 transition-all hover:from-green-400 hover:to-emerald-500">
              <Sparkles className="h-4 w-4" /> Ôn flashcard
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
