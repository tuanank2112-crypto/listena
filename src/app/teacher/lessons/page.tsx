import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRight, PlusCircle, FileText, Clock } from "lucide-react";

export default async function TeacherLessonsPage() {
  const lessons = await prisma.lesson.findMany({
    include: {
      course: { select: { title: true } },
      createdBy: { select: { name: true } },
      _count: { select: { exercises: true, attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusConfig: Record<string, { label: string; classes: string }> = {
    PUBLISHED: { label: "Đã xuất bản", classes: "bg-green-500/20 text-green-400" },
    REVIEWED: { label: "Đã duyệt", classes: "bg-blue-500/20 text-blue-400" },
    DRAFT: { label: "Nháp", classes: "bg-amber-500/20 text-amber-400" },
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bài học</h1>
          <p className="mt-2 text-slate-400">{lessons.length} bài học</p>
        </div>
        <Link
          href="/teacher/lessons/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500"
        >
          <PlusCircle className="h-4 w-4" />
          Tạo bài học
        </Link>
      </div>

      <div className="space-y-3">
        {lessons.map((lesson) => {
          const status = statusConfig[lesson.status] || { label: "Nháp", classes: "bg-amber-500/20 text-amber-400" };
          return (
            <Link
              key={lesson.id}
              href={`/teacher/lessons/${lesson.id}`}
              className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:bg-white/[0.07]"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">{lesson.title}</h3>
                  <span className="text-xs text-slate-500">{lesson.course.title}</span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {lesson.cefrLevel}
                  </span>
                  <span>📝 {lesson._count.exercises} bài tập</span>
                  <span>👥 {lesson._count.attempts} lượt làm</span>
                  <span>Bởi {lesson.createdBy.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.classes}`}>
                  {status.label}
                </span>
                <ChevronRight className="h-5 w-5 text-slate-600 transition-all group-hover:translate-x-1 group-hover:text-slate-400" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
