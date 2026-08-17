import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default async function LessonsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const courses = await prisma.course.findMany({
    include: {
      lessons: {
        where: { status: "PUBLISHED" },
        include: {
          _count: { select: { exercises: true } },
          attempts: userId
            ? { where: { userId }, take: 1, orderBy: { createdAt: "desc" } }
            : false,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-bold text-white">Bài học</h1>
      <p className="mt-2 text-slate-400">Chọn bài học để bắt đầu luyện tập</p>

      {courses.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-16 text-center">
          <p className="text-slate-400">Chưa có bài học nào. Vui lòng quay lại sau.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {courses.map((course) => (
            <div key={course.id}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{course.title}</h2>
                  <p className="text-sm text-slate-500">
                    {course.cefrLevel} • {course.lessons.length} bài học
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {course.lessons.map((lesson, i) => {
                  const lastAttempt = Array.isArray(lesson.attempts)
                    ? lesson.attempts[0]
                    : null;

                  return (
                    <Link
                      key={lesson.id}
                      href={`/learner/lessons/${lesson.id}`}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:bg-white/[0.07] hover:border-white/20"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative z-10">
                        <div className="mb-4 flex items-center justify-between">
                          <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                            {lesson.cefrLevel}
                          </span>
                          {lastAttempt && (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              (lastAttempt.score ?? 0) >= 70
                                ? "bg-green-500/20 text-green-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}>
                              {lastAttempt.score}
                            </span>
                          )}
                          {!lastAttempt && (
                            <span className="rounded-full bg-slate-500/20 px-2.5 py-0.5 text-xs text-slate-400">
                              Mới
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                          {lesson.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">{lesson.topic}</p>
                        <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                          <span>⏱ {lesson.estimatedMinutes} phút</span>
                          <span>📝 {lesson._count.exercises} bài tập</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
