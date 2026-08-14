"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  segments: Array<{
    id: string;
    position: number;
    text: string;
    difficulty: number;
  }>;
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
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const activeExercise = lesson.exercises[activeExerciseIdx];
  const totalExercises = lesson.exercises.length;

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = playbackRate;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    },
    [playbackRate]
  );

  const handlePlay = () => {
    if (activeExercise?.type === "FULL_DICTATION") {
      // Play the full segment
      const segment = lesson.segments.find(
        (s) => s.id === activeExercise.segmentId
      );
      speak(segment?.text ?? activeExercise.correctAnswer);
    } else {
      // Play the answer
      speak(activeExercise?.correctAnswer ?? "");
    }
  };

  const handlePlaySegment = (segmentText: string) => {
    speak(segmentText);
  };

  const handleReplay = () => {
    setReplayCount((c) => c + 1);
    handlePlay();
  };

  const handleHint = () => {
    setHintCount((c) => c + 1);
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

      // Navigate to result page
      router.push(`/learner/attempt/${data.attempt.id}`);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextExercise = () => {
    if (activeExerciseIdx < totalExercises - 1) {
      setActiveExerciseIdx((i) => i + 1);
      setAnswer("");
      setReplayCount(0);
      setHintCount(0);
      setShowHint(false);
      setError("");
    }
  };

  const speeds = [0.75, 0.9, 1.0, 1.15];

  // Get the hint text (first few words of answer)
  const hintText =
    activeExercise?.correctAnswer.split(" ").slice(0, 3).join(" ") + "...";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/learner/lessons"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Quay lại danh sách bài học
        </Link>
      </div>

      {/* Lesson Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {lesson.cefrLevel}
          </span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {lesson.course.title}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{lesson.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{lesson.topic}</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Bài tập {activeExerciseIdx + 1} / {totalExercises}
          </span>
          <span className="text-gray-500">
            {activeExercise?.type === "FULL_DICTATION" && "Chép chính tả"}
            {activeExercise?.type === "PARTIAL_DICTATION" && "Điền từ"}
            {activeExercise?.type === "GIST" && "Câu hỏi tổng quát"}
            {activeExercise?.type === "VOCABULARY" && "Từ vựng"}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{
              width: `${((activeExerciseIdx + 1) / totalExercises) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Exercise Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Prompt */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeExercise?.prompt}
          </h2>
        </div>

        {/* Audio Controls */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePlay}
              disabled={isPlaying}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              aria-label="Phát audio"
            >
              {isPlaying ? "⏹" : "▶"}
            </button>
            <button
              onClick={handleReplay}
              disabled={isPlaying}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              aria-label="Phát lại"
            >
              🔄 Nghe lại ({replayCount})
            </button>
            <button
              onClick={handleHint}
              disabled={showHint}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              aria-label="Xem gợi ý"
            >
              💡 Gợi ý
            </button>

            {/* Speed selector */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-gray-400">Tốc độ:</span>
              {speeds.map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackRate(speed)}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                    playbackRate === speed
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {showHint && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              💡 Gợi ý: {hintText}
            </div>
          )}
        </div>

        {/* Audio from segments (for FULL_DICTATION) */}
        {activeExercise?.type === "FULL_DICTATION" && (
          <div className="mb-6 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nghe từng đoạn:
            </p>
            <div className="flex flex-wrap gap-2">
              {lesson.segments.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => handlePlaySegment(seg.text)}
                  disabled={isPlaying}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Đoạn {seg.position}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="mb-4">
          <label htmlFor="answer" className="sr-only">
            Câu trả lời của bạn
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Nhập câu trả lời của bạn..."
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
            {error}
          </div>
        )}

        {/* Submit / Next */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !answer.trim()}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Đang gửi..." : "Gửi bài"}
          </button>
          {activeExerciseIdx < totalExercises - 1 && (
            <button
              onClick={handleNextExercise}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Bỏ qua →
            </button>
          )}
        </div>
      </div>

      {/* Vocabulary Preview */}
      {lesson.vocabulary.length > 0 && (
        <details className="mt-6 rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            📖 Từ vựng trong bài ({lesson.vocabulary.length} từ)
          </summary>
          <div className="border-t border-gray-100 px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {lesson.vocabulary.map((v) => (
                <div key={v.vocabularyItem.id} className="text-sm">
                  <span className="font-medium text-gray-900">
                    {v.vocabularyItem.displayText}
                  </span>
                  {v.vocabularyItem.ipa && (
                    <span className="ml-2 text-gray-400">
                      {v.vocabularyItem.ipa}
                    </span>
                  )}
                  <p className="text-gray-500">{v.vocabularyItem.meaningVi}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Disclaimer */}
      <p className="mt-6 text-xs text-gray-400">
        ⚠ Phản hồi AI có thể sai. Hãy kiểm tra thông tin từ nguồn đáng tin cậy.
      </p>
    </div>
  );
}
