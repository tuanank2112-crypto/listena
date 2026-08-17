import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRight, PlusCircle, FileText, Users } from "lucide-react";

export default async function TeacherCoursesPage() {
  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { lessons: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Khóa học</h1>
          <p className="mt-2 text-slate-400">{courses.length} khóa học</p>
        </div>
      </div>

      <div className="space-y-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:bg-white/[0.07]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{course.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{course.description}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {course.cefrLevel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {course._count.lessons} bài học
                  </span>
                  <span>Bởi {course.createdBy.name}</span>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                course.status === "PUBLISHED"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}>
                {course.status === "PUBLISHED" ? "Đã xuất bản" : "Nháp"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
