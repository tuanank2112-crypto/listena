"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [show,setShow]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  async function submit(event:React.FormEvent){event.preventDefault();setLoading(true);setError("");const result=await signIn("credentials",{email,password,redirect:false});if(result?.error){setError("Email hoặc mật khẩu chưa đúng.");setLoading(false);return;}const response=await fetch("/api/auth/session");const session=await response.json();router.push(session?.user?.role==="TEACHER"||session?.user?.role==="ADMIN"?"/teacher/dashboard":"/learner/dashboard");router.refresh();}
  return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="hidden paper-grid items-end bg-[#18332d] p-12 text-white lg:flex"><div className="max-w-md"><p className="text-xs font-black uppercase tracking-[.2em] text-[#f7d779]">Welcome back</p><h2 className="mt-4 text-5xl font-black leading-none tracking-[-.06em]">Một bài nhỏ.<br/>Một bước xa.</h2><div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-[#ef765d]" /></div></div></section>
    <section className="flex items-center justify-center px-4 py-10 sm:px-8"><div className="w-full max-w-md"><Link href="/" className="mb-10 inline-flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#176b55] text-white"><Sparkles className="h-5 w-5" /></span><span className="font-black">ListenAI</span></Link><p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Sign in</p><h1 className="mt-2 text-4xl font-black tracking-[-.06em]">Tiếp tục học.</h1>
    <form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm font-black">Email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required placeholder="you@example.com" className="mt-2 min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-[#fffdf8] px-4 font-bold outline-none focus:border-[#176b55]" /></label><label className="block text-sm font-black">Mật khẩu<div className="relative mt-2"><input type={show?"text":"password"} value={password} onChange={event=>setPassword(event.target.value)} required placeholder="••••••••" className="min-h-13 w-full rounded-2xl border-2 border-[#ded8cc] bg-[#fffdf8] px-4 pr-12 font-bold outline-none focus:border-[#176b55]" /><button type="button" onClick={()=>setShow(value=>!value)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-[#879088]">{show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></label>{error&&<p className="text-sm font-bold text-[#d6534d]">{error}</p>}<button disabled={loading} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#176b55] text-sm font-black text-white disabled:opacity-50">{loading?"Đang vào…":"Đăng nhập"}<ArrowRight className="h-4 w-4"/></button></form><p className="mt-6 text-center text-sm font-bold text-[#7b857f]">Chưa có tài khoản? <Link href="/register" className="text-[#176b55]">Tạo mới</Link></p>
    </div></section>
  </main>;
}
