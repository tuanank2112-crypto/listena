"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CalendarCheck2, Flame, Gamepad2, Sparkles, Target } from "lucide-react";
import type { DashboardData } from "@/types";
import { StartSessionButton } from "@/features/learning-session/start-session-button";
import { LearnerIntentCard } from "@/features/learner-intent/learner-intent-card";
import { LearnerTimeline } from "@/components/learner-timeline";
import type { LearningDecision } from "@/server/learning/decision";

type DashboardSkillObservation = {
  skillKey: string;
  score: number | null;
  evidenceCount: number;
  status: "UNKNOWN" | "PROVISIONAL" | "CALIBRATED";
};

type LearnerDashboardData = DashboardData & {
  skillObservations?: readonly DashboardSkillObservation[];
  nextDecision?: LearningDecision | null;
};

const skillLabels: Record<string, string> = {
  listening: "Nghe",
  vocabulary: "Từ vựng",
};

function skillObservationCopy(observation: DashboardSkillObservation) {
  if (observation.status === "UNKNOWN") return "Chưa có bằng chứng";

  const evidence = `${observation.evidenceCount} bằng chứng`;
  return observation.status === "CALIBRATED"
    ? `Ước tính đã hiệu chỉnh · ${evidence}`
    : `Ước tính · ${evidence}`;
}

function observationForSkill(data: LearnerDashboardData, skillKey: string): DashboardSkillObservation {
  return data.skillObservations?.find((item) => item.skillKey === skillKey) ?? {
    skillKey,
    score: null,
    evidenceCount: 0,
    status: "UNKNOWN",
  };
}

function decisionHeadline(decision: LearningDecision | null | undefined) {
  switch (decision?.kind) {
    case "RESUME": return "Tiếp tục câu chuyện của bạn.";
    case "CALIBRATE": return "Bắt đầu một nhiệm vụ ngắn.";
    case "REVIEW": return "Ôn đúng từ đang đến hạn.";
    case "COACH": return "Củng cố kỹ năng cần thiết.";
    case "PRACTICE": return "Luyện đúng điểm cần sửa.";
    case "QUEST": return "Hôm nay, bạn sẽ nói gì?";
    case "MISSION": return "Bước vào tình huống tiếp theo.";
    default: return "Chọn một Mission để bắt đầu.";
  }
}

function DecisionPrimaryAction({
  decision,
}: {
  decision: LearningDecision | null | undefined;
}) {
  if (!decision) {
    // A planner outage must never become an unpinned Daily Quest start. The
    // learner may still make an explicit manual Mission choice on Games.
    return <Link href="/learner/games" className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">Tự chọn một Mission <ArrowRight className="h-4 w-4" /></Link>;
  }
  if (decision.kind === "RESUME" && decision.targetId) {
    return <Link href={`/learner/session/${decision.targetId}`} className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">Tiếp tục phiên AI <ArrowRight className="h-4 w-4" /></Link>;
  }
  if (decision.kind === "REVIEW") {
    return <Link href="/learner/flashcards" className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">Ôn từ đến hạn <ArrowRight className="h-4 w-4" /></Link>;
  }
  if (decision.kind === "COACH" && decision.targetId) {
    return <StartSessionButton mode="LESSON_COACH" lessonId={decision.targetId} label="Học cùng Coach" className="mt-8" />;
  }
  if (decision.kind === "MISSION" && decision.scenarioKey) {
    return <StartSessionButton mode="MISSION" scenarioKey={decision.scenarioKey} goal={decision.goal} label="Vào Mission" className="mt-8" />;
  }
  if (decision.kind === "PRACTICE" && decision.scenarioKey) {
    return <StartSessionButton mode="MISSION" scenarioKey={decision.scenarioKey} goal={decision.goal} label="Luyện cùng AI" className="mt-8" />;
  }
  if (decision.kind === "CALIBRATE" || decision.kind === "QUEST") {
    return <StartSessionButton mode="DAILY_QUEST" scenarioKey={decision.scenarioKey} goal={decision.goal} label={decision.kind === "CALIBRATE" ? "Bắt đầu khởi động" : "Bắt đầu nhiệm vụ"} className="mt-8" />;
  }
  return <Link href="/learner/games" className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">Khám phá nhiệm vụ <ArrowRight className="h-4 w-4" /></Link>;
}

export function LearnerDashboard({ data }: { data: LearnerDashboardData }) {
  const skillObservations = [
    observationForSkill(data, "listening"),
    observationForSkill(data, "vocabulary"),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-7 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Chào {data.greeting}</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Học một chút nhé.</h1>
        </div>
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-[#fffdf8] px-4 shadow-sm">
          <Flame className="h-5 w-5 fill-[#ef765d] text-[#ef765d]" />
          <span className="text-lg font-black">{data.currentStreak}</span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_.75fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="paper-card paper-grid relative min-h-[290px] overflow-hidden rounded-[32px] p-6 sm:p-8">
          <div className="relative z-10 max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#dff2e8] px-3 py-1.5 text-xs font-black text-[#176b55]"><Target className="h-3.5 w-3.5" /> Học cùng AI</span>
            <h2 className="mt-7 text-3xl font-black tracking-[-.06em] sm:text-4xl">{data.activeSession ? "Tiếp tục câu chuyện của bạn." : decisionHeadline(data.nextDecision)}</h2>
            <p className="mt-3 text-sm font-bold text-[#748079]">{data.activeSession?.goal ?? data.nextDecision?.reasonVi ?? "Chưa thể chọn nhiệm vụ cá nhân hóa lúc này. Bạn vẫn có thể tự chọn một Mission."}</p>
            {data.activeSession ? (
              <Link href={`/learner/session/${data.activeSession.id}`} className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)]">
                Tiếp tục phiên AI <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <DecisionPrimaryAction decision={data.nextDecision} />
            )}
          </div>
          <div className="absolute -bottom-12 -right-8 hidden h-64 w-64 rounded-full bg-[#f7d779] sm:block" />
          <BookOpen className="absolute bottom-10 right-12 hidden h-28 w-28 rotate-[-8deg] text-[#18332d] sm:block" strokeWidth={1.2} />
        </motion.div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link href="/learner/games" className="group rounded-[28px] bg-[#18332d] p-5 text-white transition hover:-translate-y-1">
            <Gamepad2 className="h-7 w-7 text-[#f7d779]" />
            <p className="mt-8 text-xl font-black">AI Missions</p>
            <p className="mt-1 text-xs font-bold text-white/60">3 câu chuyện nhập vai</p>
          </Link>
          <Link href="/learner/flashcards" className="group rounded-[28px] bg-[#ef765d] p-5 text-white transition hover:-translate-y-1">
            <Sparkles className="h-7 w-7 text-white" />
            <p className="mt-8 text-xl font-black">Ôn từ</p>
            <p className="mt-1 text-xs font-bold text-white/70">{data.cardsDueToday} thẻ</p>
          </Link>
        </div>
      </div>

      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-4 flex flex-col gap-5 overflow-hidden rounded-[28px] border border-[#ecd48b] bg-[#fff1bd] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f7d779] text-[#18332d]"><CalendarCheck2 className="h-6 w-6" /></span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#9b6b13]">Bước tiếp theo</p>
            <h2 className="mt-1 text-xl font-black tracking-[-.03em]">{data.nextDecision?.kind === "REVIEW" ? "Ôn trước, rồi vào nhiệm vụ mới." : "Một hành động chính cho hôm nay."}</h2>
            <p className="mt-1 text-sm font-bold text-[#776b48]">{data.nextDecision?.reasonVi ?? "Planner đang tạm thời chưa sẵn sàng; hãy tự chọn một Mission hoặc làm mới trang để thử lại."}</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-black text-[#9b6b13]">{data.nextDecision ? `${data.nextDecision.estimatedMinutes} phút · ${data.nextDecision.evidenceRefs.length} bằng chứng` : "Đang chờ bằng chứng"}</p>
      </motion.section>

      <LearnerIntentCard className="mt-8" />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {skillObservations.map((observation) => (
          <div key={observation.skillKey} className="paper-card rounded-3xl p-5">
            <p className="text-3xl font-black tracking-[-.05em] text-[#176b55]">
              {observation.score === null ? "—" : `${Math.round(observation.score * 100)}%`}
            </p>
            <p className="mt-1 text-xs font-black uppercase tracking-[.12em] text-[#879088]">{skillLabels[observation.skillKey] ?? observation.skillKey}</p>
            <p className="mt-2 text-xs font-bold text-[#748079]">{skillObservationCopy(observation)}</p>
          </div>
        ))}
        <div className="paper-card rounded-3xl p-5">
          <p className="text-3xl font-black tracking-[-.05em] text-[#ef765d]">{data.weeklyStudyTime}m</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[.12em] text-[#879088]">Tuần này</p>
        </div>
        <div className="paper-card rounded-3xl p-5">
          <p className="text-3xl font-black tracking-[-.05em] text-[#d89a2b]">{data.recentAttempts.length}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[.12em] text-[#879088]">Bài luyện gần đây</p>
        </div>
      </section>

      {data.recentAttempts.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Bài luyện gần đây</h2><Link href="/learner/progress" className="text-xs font-black text-[#176b55]">Xem tiến bộ</Link></div>
          <div className="space-y-2">
            {data.recentAttempts.slice(0, 3).map((attempt) => (
              <Link key={attempt.id} href={`/learner/attempt/${attempt.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee7da] text-xs font-black">{attempt.score}</div>
                <p className="min-w-0 flex-1 truncate text-sm font-black">{attempt.lessonTitle}</p>
                <ArrowRight className="h-4 w-4 text-[#9aa19d]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Nhịp học gần đây</h2><Link href="/learner/progress" className="text-xs font-black text-[#176b55]">Xem tất cả</Link></div>
        <LearnerTimeline items={data.timeline.items} limit={3} />
      </section>
    </div>
  );
}
