import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function TeacherDashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const totalLessons = await prisma.lesson.count();
  const publishedLessons = await prisma.lesson.count({
    where: { status: "PUBLISHED" },
  });
  const draftLessons = await prisma.lesson.count({
    where: { status: "DRAFT" },
  });
  const totalLearners = await prisma.user.count({
    where: { role: "LEARNER" },
  });
  const totalAttempts = await prisma.attempt.count();

  const recentLessons = await prisma.lesson.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          👨‍🏫 Bảng điều khiển giáo viên
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý khóa học, bài học và theo dõi học viên
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-indigo-600">{totalLessons}</p>
          <p className="text-xs text-gray-500">Tổng bài học</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-green-600">{publishedLessons}</p>
          <p className="text-xs text-gray-500">Đã xuất bản</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-600">{draftLessons}</p>
          <p className="text-xs text-gray-500">Bản nháp</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-cyan-600">{totalLearners}</p>
          <p className="text-xs text-gray-500">Học viên</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Lessons */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Bài học gần đây
          </h2>
          <div className="space-y-2">
            {recentLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/teacher/lessons/${lesson.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{lesson.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(lesson.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    lesson.status === "PUBLISHED"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {lesson.status === "PUBLISHED" ? "Đã xuất bản" : "Nháp"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Thao tác nhanh
          </h2>
          <div className="space-y-3">
            <Link
              href="/teacher/lessons/new"
              className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 transition-colors hover:bg-indigo-100"
            >
              <span className="text-2xl">➕</span>
              <div>
                <p className="font-medium text-indigo-900">Tạo bài học mới</p>
                <p className="text-sm text-indigo-600">
                  Tạo bài học thủ công hoặc dùng AI hỗ trợ
                </p>
              </div>
            </Link>
            <Link
              href="/teacher/courses"
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <span className="text-2xl">📚</span>
              <div>
                <p className="font-medium text-gray-900">Quản lý khóa học</p>
                <p className="text-sm text-gray-500">
                  Xem và chỉnh sửa các khóa học
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
