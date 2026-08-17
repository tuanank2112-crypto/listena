"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, SkipForward, Volume2, ChevronLeft, ChevronRight, HelpCircle, BookOpen, Gauge, Timer } from "lucide-react";

interface LessonData {
  id: string;
  title: string;
  topic: string;
  cefrLevel: string;
  transcript: string;
  audioUrl: string | null;
  accent: string;
  defaultPlaybackRate: number;
  estimatedMinutes: number;
  course: { title: string };
  segments: Array<{ id: string; position: number; text: string; difficulty: number }>;
  vocabulary: Array<{
    isTarget: boolean;
    importance: number;
    vocabularyItem: {
      id: string;
      lemma: string;
      displayText: string;
      ipa: string | null;
      meaningVi: string;
      partOfSpeech: string | null;
      cefrLevel: string;
    };
  }>;
  exercises: Array<{
    id: string;
    type: string;
    prompt: string;
    correctAnswer: string;
    difficulty: number;
    position: number;
    segmentId: string | null;
  }>;
}

export function LessonDetailClient({
  lesson,
  lastAttemptMap,
}: {
  lesson: LessonData;
  lastAttemptMap: Record<string, any>;
}) {
  const router = useRouter();
  const [activeExerciseIdx, setActiveExerciseIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [replayCount, setReplayCount] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(lesson.defaultPlaybackRate);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [startTime] = useState(Date.now());

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = playbackRate;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  }, [playbackRate]);

  const activeExercise = lesson.exercises[activeExerciseIdx];
  const totalExercises = lesson.exercises.length;

  const handlePlay = () => {
    if (activeExercise?.type === "FULL_DICTATION") {
      const segment = lesson.segments.find(s => s.id === activeExercise.segmentId);
      speak(segment?.text ?? activeExercise.correctAnswer);
    } else {
      speak(activeExercise?.correctAnswer ?? "");
    }
  };

  const handleReplay = () => {
    setReplayCount(c => c + 1);
    handlePlay();
  };

  const handleHint = () => {
    setHintCount(c => c + 1);
    setShowHint(true);
  };

  const handleSubmit = async () => {
    if (!answer.trim()) {
      setError("Vui lòng nhập câu trả lời");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: activeExercise.id,
          lessonId: lesson.id,
          submittedAnswer: answer.trim(),
          completionTimeMs: Date.now() - startTime,
          replayCount,
          hintCount,
          playbackRate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gửi bài thất bại");
      }

      const data = await res.json();
      router.push(`/learner/attempt/${data.attempt.id}`);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextExercise = () => {
    if (activeExerciseIdx < totalExercises - 1) {
      setActiveExerciseIdx(i => i + 1);
      setAnswer("");
      setReplayCount(0);
      setHintCount(0);
      setShowHint(false);
      setError("");
    }
  };

  const speeds = [0.75, 0.9, 1.0, 1.15];
  const hintText = activeExercise?.correctAnswer.split(" ").slice(0, 3).join(" ") + "...";

  const exerciseTypeLabel = {
    GIST: "Ý chính",
    PARTIAL_DICTATION: "Điền từ",
    FULL_DICTATION: "Chép chính tả",
    VOCABULARY: "Từ vựng",
  }[activeExercise?.type as string] ?? "Bài tập";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Breadcrumb */}
      <Link href="/learner/lessons" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {/* Lesson Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-medium text-indigo-300">
            {lesson.cefrLevel}
          </span>
          <span className="text-xs text-slate-500">{lesson.course.title}</span>
        </div>
        <h1 className="text-2xl font-bold text-white">{lesson.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{lesson.topic}</p>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {lesson.estimatedMinutes} phút</span>
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {totalExercises} bài tập</span>
          <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {lesson.accent}</span>
        </div>
      </motion.div>

      {/* Exercise Navigation */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-300">
            Bài tập {activeExerciseIdx + 1}/{totalExercises}
          </span>
          <span className="text-xs text-slate-500">{exerciseTypeLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
            initial={{ width: 0 }}
            animate={{ width: `${((activeExerciseIdx + 1) / totalExercises) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Exercise Card */}
      <motion.div
        key={activeExercise?.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
      >
        {/* Prompt */}
        <p className="mb-6 text-sm leading-relaxed text-slate-300">{activeExercise?.prompt}</p>

        {/* Audio Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handlePlay}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-105"
          >
            {isPlaying ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>
          <button
            onClick={handleReplay}
            disabled={isPlaying}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition-all hover:bg-white/10 disabled:opacity-50"
          >
            Nghe lại ({replayCount})
          </button>
          <button
            onClick={handleHint}
            disabled={showHint}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition-all hover:bg-white/10 disabled:opacity-50"
          >
            <HelpCircle className="inline h-3.5 w-3.5 mr-1" /> Gợi ý
          </button>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-slate-500">Tốc độ:</span>
            {speeds.map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackRate(speed)}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
                  playbackRate === speed
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-500 hover:bg-white/5"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {showHint && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-300">
            💡 Gợi ý: {hintText}
          </motion.div>
        )}

        {/* Segment buttons for FULL_DICTATION */}
        {activeExercise?.type === "FULL_DICTATION" && (
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Nghe từng đoạn:</p>
            <div className="flex flex-wrap gap-2">
              {lesson.segments.map(seg => (
                <button
                  key={seg.id}
                  onClick={() => speak(seg.text)}
                  disabled={isPlaying}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  Đoạn {seg.position}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="mb-4">
          <textarea
            id="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Nhập câu trả lời của bạn..."
            rows={3}
            className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 backdrop-blur-sm transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            disabled={submitting}
          />
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400" role="alert">
            {error}
          </motion.div>
        )}

        {/* Submit / Next */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !answer.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
          >
            {submitting ? "Đang gửi..." : "Gửi bài"}
          </button>
          {activeExerciseIdx < totalExercises - 1 && (
            <button
              onClick={handleNextExercise}
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/10"
            >
              Bỏ qua <SkipForward className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Vocabulary Preview */}
      {lesson.vocabulary.length > 0 && (
        <details className="group rounded-2xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm">
          <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium text-slate-300 hover:bg-white/5">
            <span>📖 Từ vựng trong bài ({lesson.vocabulary.length} từ)</span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-white/10 px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {lesson.vocabulary.map((v) => (
                <div key={v.vocabularyItem.id} className="text-sm">
                  <span className="font-medium text-white">{v.vocabularyItem.displayText}</span>
                  {v.vocabularyItem.ipa && (
                    <span className="ml-2 text-slate-500">{v.vocabularyItem.ipa}</span>
                  )}
                  <p className="text-slate-400">{v.vocabularyItem.meaningVi}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
