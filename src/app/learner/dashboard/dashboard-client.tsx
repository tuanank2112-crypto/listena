"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CalendarCheck2, Flame, Gamepad2, Sparkles, Target } from "lucide-react";
import type { DashboardData } from "@/types";
import { StartSessionButton } from "@/features/learning-session/start-session-button";

export function LearnerDashboard({ data }: { data: DashboardData }) {
  const mastery = Math.round(((data.listeningMastery + data.vocabularyMastery) / 2) * 100);
  const lessonTitle = data.recommendedLesson?.title.replace(/^Bài \d+ - /, "") ?? "INTRODUCTION";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-7 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Chào {data.greeting}</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Học một chút nhé.</h1>
        </div>
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-[#fffdf8] px-4 shadow-sm">
          <Flame className="h-5 w-5 fill-[#ef765d] text-[#ef765d]" />
          <span className="text-lg font-black">{data.currentStreak}</span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_.75fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="paper-card paper-grid relative min-h-[290px] overflow-hidden rounded-[32px] p-6 sm:p-8">
          <div className="relative z-10 max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#dff2e8] px-3 py-1.5 text-xs font-black text-[#176b55]"><Target className="h-3.5 w-3.5" /> Tiếp tục</span>
            <h2 className="mt-7 text-4xl font-black tracking-[-.06em] sm:text-5xl">{lessonTitle}</h2>
            <p className="mt-3 text-sm font-bold text-[#748079]">10 phút · A2</p>
            <Link href={data.continueLessonId ? `/learner/lessons/${data.continueLessonId}` : "/learner/lessons"} className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">
              Vào bài <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="absolute -bottom-12 -right-8 hidden h-64 w-64 rounded-full bg-[#f7d779] sm:block" />
          <BookOpen className="absolute bottom-10 right-12 hidden h-28 w-28 rotate-[-8deg] text-[#18332d] sm:block" strokeWidth={1.2} />
        </motion.div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link href="/learner/games" className="group rounded-[28px] bg-[#18332d] p-5 text-white transition hover:-translate-y-1">
            <Gamepad2 className="h-7 w-7 text-[#f7d779]" />
            <p className="mt-8 text-xl font-black">AI Missions</p>
            <p className="mt-1 text-xs font-bold text-white/60">3 câu chuyện nhập vai</p>
          </Link>
          <Link href="/learner/flashcards" className="group rounded-[28px] bg-[#ef765d] p-5 text-white transition hover:-translate-y-1">
            <Sparkles className="h-7 w-7 text-white" />
            <p className="mt-8 text-xl font-black">Ôn từ</p>
            <p className="mt-1 text-xs font-bold text-white/70">{data.cardsDueToday} thẻ</p>
          </Link>
        </div>
      </div>

      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-4 flex flex-col gap-5 overflow-hidden rounded-[28px] border border-[#ecd48b] bg-[#fff1bd] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f7d779] text-[#18332d]"><CalendarCheck2 className="h-6 w-6" /></span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#9b6b13]">Daily AI Quest</p>
            <h2 className="mt-1 text-xl font-black tracking-[-.03em]">AI đã chuẩn bị một tình huống cho bạn.</h2>
            <p className="mt-1 text-sm font-bold text-[#776b48]">Dùng bài đang học, từ đến hạn và kỹ năng yếu để tạo nhiệm vụ 5-8 phút.</p>
          </div>
        </div>
        <StartSessionButton lessonId={data.continueLessonId ?? undefined} mode="DAILY_QUEST" label="Bắt đầu quest" className="shrink-0 [&_button]:w-full sm:[&_button]:w-auto" />
      </motion.section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { value: mastery, suffix: "%", label: "Năng lực", color: "#176b55" },
          { value: data.weeklyStudyTime, suffix: "m", label: "Tuần này", color: "#ef765d" },
          { value: data.recentAttempts.length, suffix: "", label: "Lượt học", color: "#d89a2b" },
        ].map((item) => (
          <div key={item.label} className="paper-card rounded-3xl p-5">
            <p className="text-3xl font-black tracking-[-.05em]" style={{ color: item.color }}>{item.value}{item.suffix}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[.12em] text-[#879088]">{item.label}</p>
          </div>
        ))}
      </section>

      {data.recentAttempts.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Vừa học</h2><Link href="/learner/progress" className="text-xs font-black text-[#176b55]">Xem tiến bộ</Link></div>
          <div className="space-y-2">
            {data.recentAttempts.slice(0, 3).map((attempt) => (
              <Link key={attempt.id} href={`/learner/attempt/${attempt.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee7da] text-xs font-black">{attempt.score}</div>
                <p className="min-w-0 flex-1 truncate text-sm font-black">{attempt.lessonTitle}</p>
                <ArrowRight className="h-4 w-4 text-[#9aa19d]" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
