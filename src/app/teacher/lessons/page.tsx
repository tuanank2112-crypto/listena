import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function TeacherLessonsPage() {
  const lessons = await prisma.lesson.findMany({
    include: {
      course: { select: { title: true } },
      createdBy: { select: { name: true } },
      _count: { select: { exercises: true, attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài học</h1>
          <p className="mt-1 text-sm text-gray-500">
            {lessons.length} bài học
          </p>
        </div>
        <Link
          href="/teacher/lessons/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          + Tạo bài học
        </Link>
      </div>

      <div className="space-y-3">
        {lessons.map((lesson) => (
          <Link
            key={lesson.id}
            href={`/teacher/lessons/${lesson.id}`}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                <span className="text-xs text-gray-400">
                  {lesson.course.title}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                <span>{lesson.cefrLevel}</span>
                <span>{lesson._count.exercises} bài tập</span>
                <span>{lesson._count.attempts} lượt làm</span>
                <span>Bởi {lesson.createdBy.name}</span>
              </div>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                lesson.status === "PUBLISHED"
                  ? "bg-green-100 text-green-700"
                  : lesson.status === "REVIEWED"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {lesson.status === "PUBLISHED"
                ? "Đã xuất bản"
                : lesson.status === "REVIEWED"
                  ? "Đã duyệt"
                  : "Nháp"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
