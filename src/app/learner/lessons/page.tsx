import Link from "next/link";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { ArrowRight, BookOpen, Bot, Gamepad2 } from "lucide-react";

const COLORS = ["#176b55", "#ef765d", "#d89a2b", "#5c6fb3", "#9a5f7a"];

export default async function LessonsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    include: {
      _count: { select: { exercises: true, vocabulary: true } },
      attempts: userId ? { where: { userId }, select: { score: true } } : false,
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-7 flex items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Lộ trình học</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Các chặng đang mở</h1></div>
        <div className="hidden items-center gap-2 sm:flex"><Link href="/learner/personalized-lessons" className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#ffe5dc] px-4 text-xs font-black text-[#a84e3f]"><Bot className="h-4 w-4" /> Bài AI riêng</Link><Link href="/learner/games" className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#18332d] px-4 text-xs font-black text-white"><Gamepad2 className="h-4 w-4" /> Chơi nhanh</Link></div>
      </header>

      <div className="relative space-y-4 before:absolute before:bottom-12 before:left-7 before:top-12 before:w-px before:bg-[#cfc8bc] sm:before:left-10">
        {lessons.map((lesson, index) => {
          const attempts = Array.isArray(lesson.attempts) ? lesson.attempts : [];
          const best = attempts.length ? Math.max(...attempts.map((attempt) => attempt.score ?? 0)) : null;
          const title = lesson.title.replace(/^Bài \d+ - /, "");
          return (
            <Link key={lesson.id} href={`/learner/lessons/${lesson.id}`} className="paper-card group relative flex min-h-[128px] items-center gap-4 rounded-[28px] p-4 transition hover:-translate-y-0.5 sm:min-h-[150px] sm:gap-6 sm:p-6">
              <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-white sm:h-20 sm:w-20 sm:text-2xl" style={{ backgroundColor: COLORS[index % COLORS.length] }}>{index + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h2 className="truncate text-xl font-black tracking-[-.04em] sm:text-2xl">{title}</h2>{best !== null && <span className="rounded-full bg-[#dff2e8] px-2 py-1 text-[10px] font-black text-[#176b55]">{best}</span>}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#758078]"><span>{lesson._count.exercises} bài</span><span>·</span><span>{lesson._count.vocabulary} từ</span><span>·</span><span>{lesson.estimatedMinutes} phút</span></div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eee7da] transition group-hover:bg-[#176b55] group-hover:text-white"><ArrowRight className="h-4 w-4" /></div>
            </Link>
          );
        })}
      </div>

      {!lessons.length && <div className="paper-card rounded-3xl p-10 text-center"><BookOpen className="mx-auto h-8 w-8" /><p className="mt-3 font-black">Chưa có bài học đã xuất bản.</p></div>}
    </div>
  );
}
