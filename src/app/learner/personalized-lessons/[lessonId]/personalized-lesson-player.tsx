"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, CircleAlert, LoaderCircle, Sparkles, Volume2 } from "lucide-react";
import { speak } from "@/core/tts/speech";
import type { PublicPersonalizedLesson } from "@/server/personalized-learning/service";

function createClientAttemptId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function PersonalizedLessonPlayer({ lesson }: { lesson: PublicPersonalizedLesson }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Retain the ID until the server acknowledges this exact exercise. A lost
  // response can then be retried without creating another evidence record.
  const pendingAttemptIds = useRef<Record<string, string>>({});
  const exercise = lesson.content.exercises[index];
  const complete = index >= lesson.content.exercises.length;
  const progress = Math.round((Math.min(index, lesson.content.exercises.length) / Math.max(lesson.content.exercises.length, 1)) * 100);
  const vocabulary = useMemo(() => lesson.content.vocabulary, [lesson.content.vocabulary]);

  function next() {
    if (exercise) delete pendingAttemptIds.current[exercise.id];
    setIndex((value) => value + 1);
    setAnswer("");
    setFeedback("");
    setError("");
  }

  async function submit(value = answer) {
    if (!exercise || !value.trim() || loading) return;
    setLoading(true);
    setError("");
    const clientAttemptId = pendingAttemptIds.current[exercise.id] ?? createClientAttemptId();
    pendingAttemptIds.current[exercise.id] = clientAttemptId;
    try {
      const response = await fetch(`/api/learner/personalized-lessons/${lesson.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          answer: value,
          clientAttemptId,
        }),
      });
      const payload = await response.json() as { attempt?: { feedbackVi: string; correct: boolean | null }; error?: string };
      if (!response.ok || !payload.attempt) throw new Error(payload.error || "Không thể chấm câu trả lời.");
      setAnswer(value);
      setFeedback(payload.attempt.feedbackVi);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể chấm câu trả lời.");
    } finally {
      setLoading(false);
    }
  }

  if (complete) {
    return <div className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4"><section className="paper-card w-full rounded-[32px] p-8 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f7d779] text-[#18332d]"><Check className="h-8 w-8" /></span><p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-[#d18b25]">Bài riêng đã hoàn thành</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em]">Dữ liệu mới đã quay lại lộ trình của bạn.</h1><p className="mt-3 text-sm font-bold leading-6 text-[#758078]">Kết quả được chấm ở server và sẽ ảnh hưởng đến bài AI hoặc game tiếp theo.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => router.push("/learner/games")} className="min-h-12 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white">Chơi theo mức mới</button><Link href="/learner/personalized-lessons" className="flex min-h-12 items-center justify-center rounded-2xl bg-[#eee7da] px-4 text-sm font-black">Bài AI của tôi</Link></div></section></div>;
  }

  return <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
    <header className="mb-5 flex items-center gap-3"><Link href="/learner/personalized-lessons" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fffdf8] shadow-sm"><ArrowLeft className="h-5 w-5" /></Link><div className="min-w-0 flex-1"><p className="truncate text-xs font-black uppercase tracking-[.13em] text-[#ef765d]">AI riêng · {lesson.cefrLevel} · độ khó {lesson.difficulty.toFixed(1)}</p><h1 className="truncate text-xl font-black tracking-[-.04em] sm:text-2xl">{lesson.title}</h1></div><span className="hidden rounded-full bg-[#dff2e8] px-3 py-1 text-[10px] font-black uppercase tracking-[.12em] text-[#176b55] sm:block">private artifact</span></header>
    <div className="paper-card mb-5 rounded-[24px] p-4 sm:p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ffe5dc] text-[#ef765d]"><Sparkles className="h-5 w-5" /></span><div><p className="text-sm font-black">Vì sao bài này là của bạn?</p><p className="mt-1 text-sm font-bold leading-6 text-[#758078]">{lesson.content.introVi}</p></div></div><ul className="mt-4 grid gap-2 border-t border-[#ded8cc] pt-4 sm:grid-cols-2">{lesson.objectives.map((objective) => <li className="flex gap-2 text-xs font-bold leading-5 text-[#596960]" key={objective}><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#176b55]" />{objective}</li>)}</ul></div>
    <div className="mb-5 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ded8cc]"><div className="h-full rounded-full bg-[#176b55] transition-all" style={{ width: `${progress}%` }} /></div><span className="text-xs font-black text-[#758078]">{index + 1}/{lesson.content.exercises.length}</span></div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><main className="paper-card rounded-[30px] p-5 sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-[#d18b25]">{exercise.type === "CHOICE" ? "Chọn đáp án" : exercise.type === "SPELL" ? "Viết chính tả" : "Điền từ"}</p><h2 className="mt-4 text-2xl font-black leading-snug tracking-[-.04em] sm:text-3xl">{exercise.prompt}</h2>{exercise.type === "CHOICE" && exercise.options ? <div className="mt-8 grid gap-3 sm:grid-cols-2">{exercise.options.map((option) => <button disabled={Boolean(feedback) || loading} onClick={() => void submit(option)} className={`min-h-16 rounded-2xl border-2 px-4 text-left text-sm font-black transition ${answer === option ? "border-[#176b55] bg-[#dff2e8]" : "border-[#ded8cc] bg-white hover:border-[#176b55]"}`} key={option}>{option}</button>)}</div> : <><label className="mt-8 block text-sm font-black" htmlFor="personal-answer">Câu trả lời</label><input id="personal-answer" value={answer} disabled={Boolean(feedback)} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} className="mt-2 min-h-14 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-4 text-lg font-black outline-none focus:border-[#176b55]" placeholder="Nhập câu trả lời…" /><button onClick={() => void submit()} disabled={!answer.trim() || loading || Boolean(feedback)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-40">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? "Đang chấm…" : "Kiểm tra"}</button></>}{feedback && <div className="mt-6 rounded-2xl bg-[#dff2e8] p-4"><p className="text-sm font-bold leading-6 text-[#245340]">{feedback}</p><button onClick={next} className="mt-4 flex min-h-11 items-center gap-1 rounded-xl bg-[#176b55] px-4 text-sm font-black text-white">{index === lesson.content.exercises.length - 1 ? "Hoàn thành" : "Câu tiếp"}<ChevronRight className="h-4 w-4" /></button></div>}{error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-[#ffe5dc] px-4 py-3 text-sm font-bold text-[#a33f3a]"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}</main>
      <aside className="paper-card rounded-[28px] p-5 xl:sticky xl:top-6"><p className="text-xs font-black uppercase tracking-[.15em] text-[#176b55]">Từ trong bài</p><p className="mt-1 text-sm font-bold text-[#758078]">Nhấn để nghe từ; đáp án vẫn được giữ ở server.</p><div className="mt-4 space-y-2">{vocabulary.map((word) => <button key={word.id} onClick={() => void speak({ text: word.displayText, lang: "en", quality: "high" })} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[#f4efe5] px-3 text-left"><Volume2 className="h-4 w-4 shrink-0 text-[#176b55]" /><span className="min-w-0"><span className="block truncate text-sm font-black">{word.displayText}</span><span className="block truncate text-xs font-bold text-[#7b857f]">{word.meaningVi}</span></span></button>)}</div></aside></div>
  </div>;
}
