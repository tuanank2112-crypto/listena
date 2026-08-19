import Link from "next/link";
import { ArrowRight, BookOpen, Gamepad2, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden px-4 py-5 sm:px-6">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b55] text-white"><Sparkles className="h-5 w-5" /></span><div><p className="font-black tracking-[-.04em]">ListenAI</p><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#879088]">English studio</p></div></Link>
        <Link href="/login" className="flex min-h-11 items-center rounded-2xl bg-[#18332d] px-5 text-sm font-black text-white">Đăng nhập</Link>
      </nav>

      <section className="paper-grid mx-auto mt-8 grid max-w-6xl items-center gap-8 overflow-hidden rounded-[36px] border border-[#ded8cc] bg-[#fffdf8] px-5 py-12 sm:px-10 lg:grid-cols-[1.08fr_.92fr] lg:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#ef765d]">English, made personal</p>
          <h1 className="mt-5 text-balance text-5xl font-black leading-[.98] tracking-[-.07em] sm:text-6xl lg:text-7xl">Học ít hơn.<br /><span className="text-[#176b55]">Nhớ lâu hơn.</span></h1>
          <p className="mt-6 max-w-lg text-base font-bold leading-7 text-[#68766f]">Bài ngắn, trò chơi nhanh và một gia sư luôn theo sát.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-6 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">Bắt đầu học <ArrowRight className="h-4 w-4" /></Link><Link href="/login" className="flex min-h-13 items-center rounded-2xl bg-[#eee7da] px-6 text-sm font-black">Xem bản demo</Link></div>
        </div>
        <div className="relative mx-auto min-h-[340px] w-full max-w-md">
          <div className="absolute left-2 top-8 w-[72%] rotate-[-5deg] rounded-[28px] bg-[#18332d] p-6 text-white shadow-xl"><Gamepad2 className="h-7 w-7 text-[#f7d779]" /><p className="mt-16 text-3xl font-black">Chọn nhanh</p><p className="mt-2 text-sm font-bold text-white/55">+80 điểm</p></div>
          <div className="absolute bottom-4 right-0 w-[68%] rotate-[4deg] rounded-[28px] bg-[#ef765d] p-6 text-white shadow-xl"><BookOpen className="h-7 w-7" /><p className="mt-14 text-2xl font-black">5 chặng học</p><div className="mt-4 h-2 rounded-full bg-white/20"><div className="h-full w-3/5 rounded-full bg-white" /></div></div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 py-8 sm:grid-cols-3">
        {[["10 phút","mỗi bài"],["3 game","mỗi unit"],["1 tutor","đúng ngữ cảnh"]].map(([value,label])=><div key={value} className="paper-card rounded-[26px] p-5"><p className="text-3xl font-black tracking-[-.05em] text-[#176b55]">{value}</p><p className="mt-1 text-xs font-black uppercase tracking-[.12em] text-[#879088]">{label}</p></div>)}
      </section>
    </main>
  );
}
