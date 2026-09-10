"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, BrainCircuit, LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import type { PublicPersonalizedLesson } from "@/server/personalized-learning/service";
import type { SkillKey } from "@/server/personalized-learning/contracts";

const skills: Array<{ value: SkillKey; label: string; description: string }> = [
  { value: "listening", label: "Nghe hiểu", description: "Nghe ý chính và nhận diện chi tiết" },
  { value: "vocabulary", label: "Từ vựng", description: "Ghi nhớ, chọn đúng và dùng theo ngữ cảnh" },
  { value: "spelling", label: "Chính tả", description: "Nghe/nhìn từ rồi viết chuẩn hơn" },
  { value: "grammar", label: "Ngữ pháp", description: "Sửa cấu trúc câu theo đúng mức của bạn" },
  { value: "communication", label: "Giao tiếp", description: "Phản xạ trong tình huống thực tế" },
];

export function PersonalizedLessonsClient({
  initialLessons,
}: {
  initialLessons: PublicPersonalizedLesson[];
}) {
  const router = useRouter();
  const [targetSkill, setTargetSkill] = useState<SkillKey | "AUTO">("AUTO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/learner/personalized-lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetSkill === "AUTO" ? {} : { targetSkill }),
      });
      const payload = await response.json() as {
        lesson?: PublicPersonalizedLesson;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok || !payload.lesson) {
        const retry = payload.retryAfterSeconds ? ` Thử lại sau ${payload.retryAfterSeconds} giây.` : "";
        throw new Error(`${payload.error || "Chưa thể tạo bài học AI."}${retry}`);
      }
      router.push(`/learner/personalized-lessons/${payload.lesson.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa thể tạo bài học AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-[32px] bg-[#18332d] px-6 py-7 text-white sm:px-9 sm:py-10">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#f7d779]">AI-native study path</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.06em] sm:text-5xl">Bài học được tạo theo bằng chứng của riêng bạn.</h1>
          <p className="mt-4 text-sm font-bold leading-6 text-white/70 sm:text-base">AI dùng mức thành thạo, lỗi đã được chấm ở server và từ cần ôn để tạo một bài riêng có thể lưu lại. Không có bài mock được gắn nhãn AI.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black">
              Trọng tâm hôm nay
              <select value={targetSkill} onChange={(event) => setTargetSkill(event.target.value as SkillKey | "AUTO")} disabled={loading} className="mt-1 block w-full bg-transparent text-sm font-bold text-white outline-none">
                <option className="text-[#18332d]" value="AUTO">AI chọn kỹ năng cần nhất</option>
                {skills.map((skill) => <option className="text-[#18332d]" key={skill.value} value={skill.value}>{skill.label}</option>)}
              </select>
            </label>
            <button onClick={() => void generate()} disabled={loading} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#f7d779] px-5 text-sm font-black text-[#18332d] disabled:opacity-55">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {loading ? "AI đang tạo…" : "Tạo bài riêng"}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-[#d6534d]/25 px-3 py-2 text-sm font-bold text-white">{error}</p>}
        </div>
        <BrainCircuit className="absolute -bottom-10 -right-8 h-48 w-48 rotate-[-10deg] text-[#f7d779]/20 sm:h-64 sm:w-64" strokeWidth={1.05} />
      </section>

      <section className="mt-9">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#176b55]">Your saved artifacts</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Bài học của bạn</h2></div>
          <Link href="/learner/lessons" className="text-sm font-black text-[#176b55]">Xem giáo trình chung</Link>
        </div>
        {initialLessons.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {initialLessons.map((lesson) => {
              const skill = skills.find((item) => item.value === lesson.targetSkill);
              return <Link key={lesson.id} href={`/learner/personalized-lessons/${lesson.id}`} className="paper-card group min-h-[238px] rounded-[28px] p-5 transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(51,58,47,.11)]">
                <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ffe5dc] text-[#ef765d]"><Bot className="h-5 w-5" /></span><span className="rounded-full bg-[#dff2e8] px-3 py-1 text-[10px] font-black uppercase tracking-[.1em] text-[#176b55]">{lesson.cefrLevel} · {lesson.difficulty.toFixed(1)}</span></div>
                <p className="mt-6 text-[11px] font-black uppercase tracking-[.15em] text-[#d18b25]">{skill?.label ?? lesson.targetSkill}</p>
                <h3 className="mt-2 line-clamp-2 text-xl font-black tracking-[-.04em]">{lesson.title}</h3>
                <p className="mt-3 line-clamp-2 text-sm font-bold leading-6 text-[#7b857f]">{lesson.objectives[0]}</p>
                <p className="mt-5 text-xs font-black text-[#176b55] group-hover:underline">Mở bài học →</p>
              </Link>;
            })}
          </div>
        ) : (
          <div className="paper-card rounded-[28px] p-8 text-center"><Sparkles className="mx-auto h-8 w-8 text-[#d89a2b]" /><p className="mt-3 text-lg font-black">Chưa có bài học riêng nào.</p><p className="mt-2 text-sm font-bold text-[#758078]">Chọn một trọng tâm phía trên để AI tạo bài đầu tiên dựa trên trạng thái học hiện tại.</p></div>
        )}
      </section>
    </div>
  );
}
