import { BookOpen, Brain, CheckCircle2, Repeat2 } from "lucide-react";
import type { TimelineItem } from "@/types";

const timelineCopy = {
  SESSION: { label: "Hoàn thành phiên AI", Icon: Brain, color: "bg-[#dff2e8] text-[#176b55]" },
  EVIDENCE: { label: "AI đánh giá lượt học", Icon: CheckCircle2, color: "bg-[#fff1bd] text-[#9b6b13]" },
  ATTEMPT: { label: "Làm bài luyện tập", Icon: BookOpen, color: "bg-[#fde1da] text-[#b54b39]" },
  REVIEW: { label: "Ôn lại thẻ từ", Icon: Repeat2, color: "bg-[#e5e9ff] text-[#5c6fb3]" },
} as const;

function formatActivityTime(createdAt: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(createdAt));
}

function formatSkill(skillKey: string) {
  const labels: Record<string, string> = {
    LISTENING: "Nghe", VOCABULARY: "Từ vựng", SPELLING: "Chính tả", GRAMMAR: "Ngữ pháp", SPEAKING: "Nói", COMMUNICATION: "Giao tiếp",
  };
  return labels[skillKey.toUpperCase()] ?? skillKey.replaceAll("_", " ").toLowerCase();
}

function formatScore(item: TimelineItem) {
  if (item.score === undefined) return null;
  const score = item.kind === "EVIDENCE" ? Math.round(item.score * 100) : Math.round(item.score);
  return `${score}/100`;
}

export function LearnerTimeline({ items, limit }: { items: TimelineItem[]; limit?: number }) {
  const visibleItems = limit === undefined ? items : items.slice(0, limit);
  if (!visibleItems.length) {
    return <div className="rounded-2xl border border-dashed border-[#ded8cc] bg-[#fffdf8] px-4 py-6 text-center text-sm font-bold text-[#758078]">Chưa có hoạt động nào trong khoảng thời gian này.</div>;
  }

  return <div className="space-y-2">{visibleItems.map((item) => {
    const copy = timelineCopy[item.kind];
    const Icon = copy.Icon;
    return <div key={`${item.kind}-${item.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${copy.color}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-black">{copy.label}</p><p className="mt-0.5 text-xs font-bold text-[#758078]">{formatActivityTime(item.createdAt)}{item.skillKey ? ` · ${formatSkill(item.skillKey)}` : ""}</p></div>
      {formatScore(item) && <span className="rounded-full bg-[#eee7da] px-2 py-1 text-xs font-black">{formatScore(item)}</span>}
    </div>;
  })}</div>;
}
