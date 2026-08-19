import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center px-4"><div className="paper-card max-w-md rounded-[32px] p-8 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ffe5dc]"><Sparkles className="h-7 w-7 text-[#ef765d]" /></div><p className="mt-5 text-6xl font-black tracking-[-.08em]">404</p><h1 className="mt-2 text-xl font-black">Trang này đi lạc rồi.</h1><Link href="/" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" /> Về trang chủ</Link></div></main>;
}
