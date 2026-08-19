"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Gamepad2, RefreshCw, Sparkles } from "lucide-react";

interface AttemptData {
  submittedAnswer: string;
  score: number | null;
  replayCount: number;
  hintCount: number;
  exercise: { prompt: string; correctAnswer: string };
  lesson: { id: string; title: string; cefrLevel: string };
  errors: Array<{ id: string; errorType: string; expectedText: string; actualText: string | null; aiExplanation: string | null }>;
  flashcards: Array<{ id: string; front: string; vocabularyItem: { meaningVi: string } }>;
}

const labels: Record<string,string> = { MISSING_WORD:"Thiếu từ", EXTRA_WORD:"Thừa từ", SPELLING:"Chính tả", FUNCTION_WORD:"Từ nhỏ", GRAMMAR:"Ngữ pháp", VOCABULARY:"Từ vựng" };

export function AttemptResultClient({ attempt, recommendation }: { attempt: AttemptData; recommendation: { id: string; title: string } | null }) {
  const score = attempt.score ?? 0;
  const good = score >= 70;
  const color = good ? "#176b55" : score >= 40 ? "#d89a2b" : "#d6534d";
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href={`/learner/lessons/${attempt.lesson.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-[#68766f]"><ArrowLeft className="h-4 w-4" /> Trở lại</Link>
      <motion.section initial={{ opacity:0, scale:.96 }} animate={{ opacity:1, scale:1 }} className="paper-card mt-4 rounded-[32px] p-6 text-center sm:p-9">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full text-4xl font-black text-white" style={{backgroundColor:color}}>{score}</div>
        <p className="mt-5 text-xs font-black uppercase tracking-[.18em]" style={{color}}>{good ? "Làm tốt!" : "Thêm một chút nữa"}</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-.04em]">{attempt.lesson.title.replace(/^Bài \d+ - /,"")}</h1>
        <div className="mx-auto mt-5 flex max-w-xs justify-center gap-5 text-xs font-black text-[#879088]"><span>{attempt.errors.length} lỗi</span><span>{attempt.replayCount} lần nghe</span><span>{attempt.hintCount} gợi ý</span></div>
      </motion.section>

      {attempt.errors.length > 0 && <section className="mt-5"><h2 className="mb-3 text-lg font-black">Cần nhớ</h2><div className="space-y-2">{attempt.errors.slice(0,3).map((error)=><div key={error.id} className="paper-card rounded-2xl p-4"><div className="flex items-center gap-2"><span className="rounded-full bg-[#ffe5dc] px-2 py-1 text-[10px] font-black text-[#d6534d]">{labels[error.errorType]||"Lưu ý"}</span><p className="text-sm font-black">{error.expectedText}</p>{error.actualText&&<span className="text-xs font-bold text-[#879088]">→ {error.actualText}</span>}</div>{error.aiExplanation&&<p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-[#637169]">{error.aiExplanation}</p>}</div>)}</div></section>}

      {!attempt.errors.length && <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#dff2e8] p-4 text-sm font-black text-[#176b55]"><Check className="h-5 w-5" /> Không có lỗi cần sửa.</div>}

      {attempt.flashcards.length > 0 && <section className="mt-5 rounded-[26px] bg-[#18332d] p-5 text-white"><div className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-[#f7d779]" /> Đã thêm {attempt.flashcards.length} thẻ ôn</div><div className="mt-3 flex flex-wrap gap-2">{attempt.flashcards.slice(0,5).map((card)=><span key={card.id} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{card.front}</span>)}</div></section>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`/learner/lessons/${attempt.lesson.id}`} className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#eee7da] text-sm font-black"><RefreshCw className="h-4 w-4" /> Luyện lại</Link>
        <Link href={recommendation ? `/learner/lessons/${recommendation.id}` : "/learner/games"} className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#176b55] text-sm font-black text-white">{recommendation ? "Bài tiếp" : "Chơi nhanh"}{recommendation ? <ArrowRight className="h-4 w-4" /> : <Gamepad2 className="h-4 w-4" />}</Link>
      </div>
    </div>
  );
}
