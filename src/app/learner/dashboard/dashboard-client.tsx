"use client";

import Link from "next/link";
import type { DashboardData } from "@/types";

function MasteryBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  const color =
    percent >= 70 ? "bg-green-500" : percent >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function LearnerDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{data.greeting}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hãy tiếp tục hành trình học tiếng Anh của bạn!
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-indigo-600">{data.cardsDueToday}</p>
          <p className="mt-1 text-xs text-gray-500">Flashcard cần ôn</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-600">{data.currentStreak}</p>
          <p className="mt-1 text-xs text-gray-500">Ngày liên tiếp</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-green-600">{data.weeklyStudyTime}</p>
          <p className="mt-1 text-xs text-gray-500">Phút học tuần này</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-cyan-600">
            {Math.round(data.listeningMastery * 100)}%
          </p>
          <p className="mt-1 text-xs text-gray-500">Kỹ năng nghe</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recommended Lesson */}
          {data.recommendedLesson && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">
                ĐỀ XUẤT CHO BẠN
              </p>
              <Link
                href={`/learner/lessons/${data.recommendedLesson.id}`}
                className="mt-2 block"
              >
                <h3 className="text-lg font-semibold text-indigo-900 hover:text-indigo-700">
                  {data.recommendedLesson.title}
                </h3>
                <p className="mt-1 text-sm text-indigo-600">
                  {data.recommendedLesson.reason}
                </p>
              </Link>
            </div>
          )}

          {/* Recent Attempts */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Kết quả gần đây</h2>
            {data.recentAttempts.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <p className="text-gray-500">Chưa có bài làm nào. Hãy bắt đầu học ngay!</p>
                <Link
                  href="/learner/lessons"
                  className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Xem bài học
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentAttempts.map((attempt) => (
                  <Link
                    key={attempt.id}
                    href={`/learner/attempt/${attempt.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{attempt.lessonTitle}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(attempt.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                    <div
                      className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                        attempt.score >= 70
                          ? "bg-green-100 text-green-700"
                          : attempt.score >= 40
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {attempt.score}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Mastery Scores */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Trình độ</h3>
            <div className="space-y-3">
              <MasteryBar value={data.listeningMastery} label="Nghe" />
              <MasteryBar value={data.vocabularyMastery} label="Từ vựng" />
            </div>
          </div>

          {/* Weak Skills */}
          {data.weakSkills.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">Kỹ năng cần cải thiện</h3>
              <ul className="mt-2 space-y-1">
                {data.weakSkills.map((skill) => (
                  <li key={skill} className="text-sm text-amber-700">
                    • {skill === "listening" && "Nghe hiểu"}
                    {skill === "vocabulary" && "Từ vựng"}
                    {skill === "spelling" && "Chính tả"}
                    {skill === "function_words" && "Từ chức năng"}
                    {skill === "segmentation" && "Phân tách từ"}
                    {skill === "final_sounds" && "Âm cuối"}
                    {!"listening vocabulary spelling function_words segmentation final_sounds".includes(skill) && skill}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick Links */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Truy cập nhanh</h3>
            <div className="space-y-2">
              <Link
                href="/learner/flashcards"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <span>🃏</span> Ôn flashcard ({data.cardsDueToday})
              </Link>
              <Link
                href="/learner/lessons"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <span>📚</span> Danh sách bài học
              </Link>
              <Link
                href="/learner/progress"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <span>📊</span> Xem tiến bộ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
