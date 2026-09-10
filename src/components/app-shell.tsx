"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  BrainCircuit,
  BookOpen,
  Gamepad2,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const learnerNav = [
  { href: "/learner/dashboard", label: "Hôm nay", icon: LayoutDashboard },
  { href: "/learner/lessons", label: "Bài học", icon: BookOpen },
  { href: "/learner/personalized-lessons", label: "Bài AI", icon: BrainCircuit },
  { href: "/learner/games", label: "Trò chơi", icon: Gamepad2 },
  { href: "/learner/flashcards", label: "Ôn từ", icon: Sparkles },
  { href: "/learner/progress", label: "Tiến bộ", icon: BarChart3 },
];

const teacherNav = [
  { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/teacher/lessons", label: "Bài học", icon: Library },
  { href: "/teacher/lessons/new", label: "Tạo bài", icon: PlusCircle },
  { href: "/teacher/courses", label: "Khóa học", icon: GraduationCap },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isTeacher = session?.user?.role === "TEACHER" || session?.user?.role === "ADMIN";
  const navItems = isTeacher ? teacherNav : learnerNav;
  const userName = session?.user?.name || "Learner";

  return (
    <div className="min-h-screen text-[#18332d]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-[#ded8cc] bg-[#fffdf8]/95 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href={isTeacher ? "/teacher/dashboard" : "/learner/dashboard"} className="mb-9 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b55] text-white shadow-[0_8px_20px_rgba(23,107,85,.22)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black tracking-[-.04em] text-[#18332d]">ListenAI</p>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#879088]">English studio</p>
          </div>
        </Link>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition",
                  active ? "bg-[#176b55] text-white shadow-[0_7px_18px_rgba(23,107,85,.18)]" : "text-[#68766f] hover:bg-[#eee7da] hover:text-[#18332d]"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-3xl bg-[#eee7da] p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ef765d] text-sm font-black text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{userName}</p>
              <p className="truncate text-[11px] text-[#7b857f]">{session?.user?.email}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-[#7b857f] hover:bg-white/70 hover:text-[#18332d]">
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className={cn("min-h-screen pb-24 lg:ml-[232px] lg:pb-0", isTeacher && "bg-[#030014] text-white")}>{children}</main>

      {!isTeacher && (
        <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-3 rounded-[22px] border border-[#ded8cc] bg-[#fffdf8]/95 p-1.5 shadow-[0_14px_40px_rgba(34,47,40,.18)] backdrop-blur-xl lg:hidden">
          {learnerNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-[16px] text-[10px] font-bold", active ? "bg-[#176b55] text-white" : "text-[#758078]")}>
                <item.icon className="h-[18px] w-[18px]" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
