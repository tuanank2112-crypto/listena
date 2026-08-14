import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Bài học</h1>
      <p className="mb-8 text-sm text-gray-500">
        Chọn bài học để bắt đầu luyện tập
      </p>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">Chưa có bài học nào. Vui lòng quay lại sau.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {courses.map((course) => (
            <div key={course.id}>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{course.title}</h2>
                <p className="text-sm text-gray-500">
                  {course.cefrLevel} • {course.lessons.length} bài học
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {course.lessons.map((lesson) => {
                  const lastAttempt = Array.isArray(lesson.attempts)
                    ? lesson.attempts[0]
                    : null;

                  return (
                    <Link
                      key={lesson.id}
                      href={`/learner/lessons/${lesson.id}`}
                      className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {lesson.cefrLevel}
                        </span>
                        {lastAttempt && (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              (lastAttempt.score ?? 0) >= 70
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {lastAttempt.score}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                      <p className="mt-1 text-xs text-gray-500">{lesson.topic}</p>
                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                        <span>⏱ {lesson.estimatedMinutes} phút</span>
                        <span>📝 {lesson._count.exercises} bài tập</span>
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
