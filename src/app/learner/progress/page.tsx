"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Gamepad2, Sparkles } from "lucide-react";

interface ProgressData {
  listeningMastery: number; vocabularyMastery: number; spellingMastery: number;
  totalStudyMinutes: number; currentStreak: number; weeklyStudyTime: number; cardsDueToday: number;
  recentScores: Array<{ date: string; score: number; lessonTitle: string }>;
  skillMasteries: Array<{ skillKey: string; masteryScore: number }>;
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  useEffect(() => { fetch("/api/learner/progress").then((response) => response.ok ? response.json() : null).then(setData); }, []);
  if (!data) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-40 animate-pulse rounded-[30px] bg-[#eee7da]" /></div>;
  const skills = [
    ["Nghe", data.listeningMastery, "#176b55"], ["Từ vựng", data.vocabularyMastery, "#ef765d"], ["Chính tả", data.spellingMastery, "#d89a2b"],
  ] as const;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header><p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Your growth</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Tiến bộ</h1></header>
      <div className="mt-7 grid grid-cols-3 gap-3">
        {[{v:data.currentStreak,l:"streak",i:Flame,c:"#ef765d"},{v:data.totalStudyMinutes,l:"phút",i:Sparkles,c:"#176b55"},{v:data.cardsDueToday,l:"thẻ",i:Gamepad2,c:"#d89a2b"}].map((item) => <div key={item.l} className="paper-card rounded-3xl p-4 sm:p-5"><item.i className="h-5 w-5" style={{color:item.c}} /><p className="mt-4 text-3xl font-black">{item.v}</p><p className="text-[11px] font-black uppercase tracking-[.12em] text-[#879088]">{item.l}</p></div>)}
      </div>
      <section className="paper-card mt-5 rounded-[30px] p-5 sm:p-7"><h2 className="text-lg font-black">Kỹ năng</h2><div className="mt-6 space-y-5">{skills.map(([label,value,color]) => {const percent=Math.round(value*100);return <div key={label}><div className="mb-2 flex justify-between text-sm font-black"><span>{label}</span><span>{percent}%</span></div><div className="h-3 overflow-hidden rounded-full bg-[#eee7da]"><div className="h-full rounded-full" style={{width:`${percent}%`,backgroundColor:color}} /></div></div>})}</div></section>
      <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Gần đây</h2><Link href="/learner/games" className="text-xs font-black text-[#176b55]">Chơi nhanh</Link></div><div className="space-y-2">{data.recentScores.slice(0,5).map((item,index)=><div key={`${item.date}-${index}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dff2e8] text-sm font-black text-[#176b55]">{item.score}</span><p className="min-w-0 flex-1 truncate text-sm font-black">{item.lessonTitle}</p><ArrowRight className="h-4 w-4 text-[#9aa19d]" /></div>)}</div></section>
    </div>
  );
}
