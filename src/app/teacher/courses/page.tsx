import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function TeacherCoursesPage() {
  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { lessons: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khóa học</h1>
          <p className="mt-1 text-sm text-gray-500">
            {courses.length} khóa học
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{course.title}</h3>
                <p className="text-sm text-gray-500">{course.description}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                  <span>{course.cefrLevel}</span>
                  <span>{course._count.lessons} bài học</span>
                  <span>Bởi {course.createdBy.name}</span>
                </div>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  course.status === "PUBLISHED"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {course.status === "PUBLISHED" ? "Đã xuất bản" : "Nháp"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
