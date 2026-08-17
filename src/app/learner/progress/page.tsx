"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, Clock, Trophy, Sparkles, BarChart3, ChevronRight } from "lucide-react";

interface ProgressData {
  listeningMastery: number;
  vocabularyMastery: number;
  spellingMastery: number;
  totalStudyMinutes: number;
  currentStreak: number;
  weeklyStudyTime: number;
  cardsDueToday: number;
  recentScores: Array<{
    date: string;
    score: number;
    lessonTitle: string;
  }>;
  skillMasteries: Array<{
    skillKey: string;
    masteryScore: number;
  }>;
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch("/api/learner/progress");
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch progress", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProgress();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="h-8 w-48 skeleton mb-2" />
        <div className="h-4 w-64 skeleton mb-8" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Tiến bộ</h1>
        <p className="text-slate-400">Không thể tải dữ liệu. Vui lòng thử lại sau.</p>
      </div>
    );
  }

  const allMasteries = [
    { label: "Nghe", value: data.listeningMastery, color: "from-indigo-500 to-blue-500" },
    { label: "Từ vựng", value: data.vocabularyMastery, color: "from-cyan-500 to-teal-500" },
    { label: "Chính tả", value: data.spellingMastery, color: "from-amber-500 to-orange-500" },
    ...data.skillMasteries
      .filter((s) => !["listening", "vocabulary", "spelling"].includes(s.skillKey))
      .map((s) => ({
        label: s.skillKey === "function_words" ? "Từ chức năng" : s.skillKey === "segmentation" ? "Phân tách từ" : s.skillKey === "final_sounds" ? "Âm cuối" : s.skillKey,
        value: s.masteryScore,
        color: "from-purple-500 to-pink-500",
      })),
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white">Tiến bộ học tập</h1>
        <p className="mt-2 text-slate-400">Theo dõi sự tiến bộ của bạn qua từng kỹ năng</p>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {[
          { icon: Clock, label: "Tổng phút học", value: data.totalStudyMinutes, color: "from-indigo-500 to-cyan-500" },
          { icon: Trophy, label: "Ngày liên tiếp", value: data.currentStreak, color: "from-amber-500 to-orange-500" },
          { icon: TrendingUp, label: "Phút tuần này", value: data.weeklyStudyTime, color: "from-green-500 to-emerald-500" },
          { icon: Sparkles, label: "Flashcard cần ôn", value: data.cardsDueToday, color: "from-purple-500 to-pink-500" },
        ].map((stat, i) => (
          <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:bg-white/[0.07]">
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-[0.03]`} />
            <div className="relative z-10">
              <stat.icon className="mb-3 h-5 w-5 text-slate-400" />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* Mastery Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm lg:col-span-3"
        >
          <h2 className="mb-6 text-lg font-semibold text-white">Trình độ kỹ năng</h2>
          <div className="space-y-5">
            {allMasteries.map((item) => {
              const percent = Math.round(item.value * 100);
              return (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-300">{item.label}</span>
                    <span className="font-semibold text-white">{percent}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Recent Scores */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm lg:col-span-2"
        >
          <h2 className="mb-4 text-lg font-semibold text-white">Kết quả gần đây</h2>
          {data.recentScores.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có bài làm nào.</p>
          ) : (
            <div className="space-y-3">
              {data.recentScores.map((score, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{score.lessonTitle}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(score.date).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    score.score >= 70
                      ? "bg-green-500/20 text-green-400"
                      : score.score >= 40
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                  }`}>
                    {score.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
