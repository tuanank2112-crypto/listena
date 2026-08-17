import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRight, BookOpen, PlusCircle, Users, BarChart3, FileText, CheckCircle, Clock } from "lucide-react";

export default async function TeacherDashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const totalLessons = await prisma.lesson.count();
  const publishedLessons = await prisma.lesson.count({ where: { status: "PUBLISHED" } });
  const draftLessons = await prisma.lesson.count({ where: { status: "DRAFT" } });
  const totalLearners = await prisma.user.count({ where: { role: "LEARNER" } });
  const totalAttempts = await prisma.attempt.count();

  const recentLessons = await prisma.lesson.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Bảng điều khiển</h1>
        <p className="mt-2 text-slate-400">Quản lý khóa học, bài học và theo dõi học viên</p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: FileText, label: "Tổng bài học", value: totalLessons, color: "from-indigo-500 to-cyan-500" },
          { icon: CheckCircle, label: "Đã xuất bản", value: publishedLessons, color: "from-green-500 to-emerald-500" },
          { icon: Clock, label: "Bản nháp", value: draftLessons, color: "from-amber-500 to-orange-500" },
          { icon: Users, label: "Học viên", value: totalLearners, color: "from-purple-500 to-pink-500" },
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
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Lessons */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Bài học gần đây</h2>
          <div className="space-y-2">
            {recentLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/teacher/lessons/${lesson.id}`}
                className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/[0.07]"
              >
                <div>
                  <p className="font-medium text-white">{lesson.title}</p>
                  <p className="text-xs text-slate-500">{new Date(lesson.createdAt).toLocaleDateString("vi-VN")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    lesson.status === "PUBLISHED"
                      ? "bg-green-500/20 text-green-400"
                      : lesson.status === "REVIEWED"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {lesson.status === "PUBLISHED" ? "Đã xuất bản" : lesson.status === "REVIEWED" ? "Đã duyệt" : "Nháp"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Thao tác nhanh</h2>
          <div className="space-y-3">
            {[
              { href: "/teacher/lessons/new", icon: PlusCircle, title: "Tạo bài học mới", desc: "Tạo bài học thủ công hoặc dùng AI hỗ trợ", color: "from-indigo-500/20 to-cyan-500/10", border: "border-indigo-500/30" },
              { href: "/teacher/lessons", icon: BookOpen, title: "Quản lý bài học", desc: "Xem, duyệt và xuất bản bài học", color: "from-cyan-500/20 to-teal-500/10", border: "border-cyan-500/30" },
              { href: "/teacher/courses", icon: BarChart3, title: "Quản lý khóa học", desc: "Xem và chỉnh sửa các khóa học", color: "from-white/5 to-white/[0.02]", border: "border-white/10" },
            ].map((action, i) => (
              <Link
                key={i}
                href={action.href}
                className={`group flex items-center gap-4 rounded-2xl border ${action.border} bg-gradient-to-r ${action.color} p-4 backdrop-blur-sm transition-all hover:bg-white/[0.07]`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <action.icon className="h-6 w-6 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{action.title}</p>
                  <p className="text-sm text-slate-500">{action.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
