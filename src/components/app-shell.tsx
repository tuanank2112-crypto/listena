"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  GraduationCap,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  User,
  BarChart3,
  Library,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const learnerNav = [
  { href: "/learner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/learner/lessons", label: "Bài học", icon: BookOpen },
  { href: "/learner/flashcards", label: "Flashcard", icon: Sparkles },
  { href: "/learner/progress", label: "Tiến bộ", icon: BarChart3 },
];

const teacherNav = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/lessons", label: "Bài học", icon: Library },
  { href: "/teacher/lessons/new", label: "Tạo bài học", icon: PlusCircle },
  { href: "/teacher/courses", label: "Khóa học", icon: GraduationCap },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const isTeacher = session?.user?.role === "TEACHER" || session?.user?.role === "ADMIN";
  const navItems = isTeacher ? teacherNav : learnerNav;
  const userName = session?.user?.name || "User";

  return (
    <div className="flex min-h-screen bg-[#030014]">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl transition-all duration-300 lg:static",
          collapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className={cn("flex h-16 items-center border-b border-white/10 px-4", collapsed && "justify-center")}>
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-white">
                Listen<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI</span>
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  collapsed && "justify-center px-2",
                  isActive
                    ? "bg-gradient-to-r from-indigo-500/20 to-cyan-500/10 text-white border border-indigo-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-indigo-400" : "")} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className={cn("border-t border-white/10 p-3", collapsed && "flex flex-col items-center")}>
          <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", collapsed && "px-0 justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{userName}</p>
                <p className="truncate text-xs text-slate-500">{session?.user?.email}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={cn(
              "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-white",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>

        {/* Collapse toggle - desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#030014] text-slate-400 hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-black/30 backdrop-blur-xl px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-xs font-bold text-white">
              L
            </div>
            <span className="text-sm font-bold text-white">ListenAI</span>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
