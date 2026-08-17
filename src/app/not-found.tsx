import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030014] px-4">
      <div className="absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-6xl font-extrabold text-white">404</h1>
        <p className="mt-4 text-xl text-slate-400">Trang không tồn tại</p>
        <p className="mt-2 text-sm text-slate-500">Trang bạn đang tìm kiếm không có ở đây.</p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
