"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { DashboardData } from "@/types";
import { BookOpen, Sparkles, TrendingUp, Clock, ChevronRight, Trophy, Target, Zap } from "lucide-react";

function MasteryRing({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 70 ? "#6366f1" : percent >= 40 ? "#06b6d4" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <motion.circle
            cx="40" cy="40" r="36" fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{percent}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
}

export function LearnerDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-bold text-white">
          {data.greeting} 👋
        </h1>
        <p className="mt-2 text-slate-400">
          Hãy tiếp tục hành trình học tiếng Anh của bạn!
        </p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {[
          { icon: Sparkles, label: "Flashcard cần ôn", value: data.cardsDueToday, color: "from-indigo-500 to-cyan-500" },
          { icon: Trophy, label: "Ngày liên tiếp", value: data.currentStreak, color: "from-amber-500 to-orange-500" },
          { icon: Clock, label: "Phút học tuần này", value: data.weeklyStudyTime, color: "from-green-500 to-emerald-500" },
          { icon: TrendingUp, label: "Kỹ năng nghe", value: Math.round(data.listeningMastery * 100) + "%", color: "from-purple-500 to-pink-500" },
        ].map((stat, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:bg-white/[0.07]"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-[0.03]`} />
            <div className="relative z-10">
              <stat.icon className="mb-3 h-5 w-5 text-slate-400" />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recommended Lesson */}
          {data.recommendedLesson && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Link
                href={`/learner/lessons/${data.recommendedLesson.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-cyan-500/5 p-6 transition-all hover:from-indigo-500/20 hover:to-cyan-500/10"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent" />
                <div className="relative z-10">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-400">
                    <Target className="h-4 w-4" />
                    Đề xuất cho bạn
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {data.recommendedLesson.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {data.recommendedLesson.reason}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-indigo-400">
                    Bắt đầu học <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Recent Attempts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="mb-4 text-lg font-semibold text-white">Kết quả gần đây</h2>
            {data.recentAttempts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
                <BookOpen className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-slate-400">Chưa có bài làm nào. Hãy bắt đầu học ngay!</p>
                <Link
                  href="/learner/lessons"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-700"
                >
                  <BookOpen className="h-4 w-4" />
                  Xem bài học
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentAttempts.map((attempt, i) => (
                  <Link
                    key={attempt.id}
                    href={`/learner/attempt/${attempt.id}`}
                    className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/[0.07]"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${
                        attempt.score >= 70
                          ? "bg-green-500/20 text-green-400"
                          : attempt.score >= 40
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-red-500/20 text-red-400"
                      }`}>
                        {attempt.score}
                      </div>
                      <div>
                        <p className="font-medium text-white">{attempt.lessonTitle}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(attempt.createdAt).toLocaleDateString("vi-VN")}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Mastery Scores */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          >
            <h3 className="mb-6 text-sm font-semibold text-white">Trình độ</h3>
            <div className="flex justify-center gap-6">
              <MasteryRing value={data.listeningMastery} label="Nghe" />
              <MasteryRing value={data.vocabularyMastery} label="Từ vựng" />
            </div>
          </motion.div>

          {/* Weak Skills */}
          {data.weakSkills.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-300">Kỹ năng cần cải thiện</h3>
              </div>
              <ul className="space-y-2">
                {data.weakSkills.map((skill) => (
                  <li key={skill} className="flex items-center gap-2 text-sm text-amber-400/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {skill === "listening" && "Nghe hiểu"}
                    {skill === "vocabulary" && "Từ vựng"}
                    {skill === "spelling" && "Chính tả"}
                    {skill === "function_words" && "Từ chức năng"}
                    {skill === "segmentation" && "Phân tách từ"}
                    {skill === "final_sounds" && "Âm cuối"}
                    {!"listening vocabulary spelling function_words segmentation final_sounds".includes(skill) && skill}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
          >
            <h3 className="mb-4 text-sm font-semibold text-white">Truy cập nhanh</h3>
            <div className="space-y-2">
              {[
                { href: "/learner/flashcards", label: "Ôn flashcard", icon: Sparkles, badge: data.cardsDueToday },
                { href: "/learner/lessons", label: "Danh sách bài học", icon: BookOpen },
                { href: "/learner/progress", label: "Xem tiến bộ", icon: TrendingUp },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-all hover:bg-white/5 hover:text-white"
                >
                  <link.icon className="h-4 w-4" />
                  <span>{link.label}</span>
                  {link.badge !== undefined && (
                    <span className="ml-auto rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
