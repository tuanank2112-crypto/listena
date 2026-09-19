"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Gamepad2, Headphones, ListChecks, PenLine, Sparkles } from "lucide-react";
import type { LessonJourneyStep } from "@/core/learning/lesson-journey";
import { LessonWordCards, type JourneyWord } from "./lesson-word-cards";

interface JourneyStepView {
  step: LessonJourneyStep;
  order: number;
  labelVi: string;
  hintVi: string;
  ctaVi: string;
  done: boolean;
}

interface JourneyView {
  lessonId: string;
  percent: number;
  nextStep: LessonJourneyStep | null;
  isComplete: boolean;
  steps: JourneyStepView[];
}

const ICONS: Record<LessonJourneyStep, typeof Sparkles> = {
  LEARN: Sparkles,
  PRACTICE: PenLine,
  PLAY: Gamepad2,
  LISTEN: Headphones,
  TEST: ListChecks,
};

/**
 * Plan22 SPEC-P224 — the lesson's path, and where the learner is on it.
 *
 * The point of the reference vocabulary app is not any one exercise: it is that
 * a learner opening a lesson is never left deciding what to do. Every step here
 * leads to a surface that already grades on the server, so this band moves
 * people between them and reports progress — it never marks anything itself.
 */
export function LessonJourneyBand({
  lessonId,
  words,
  onGoToExercises,
}: {
  lessonId: string;
  words: JourneyWord[];
  /** Bring the exercises into view; PRACTICE and TEST both live down there. */
  onGoToExercises: () => void;
}) {
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [failed, setFailed] = useState(false);
  const [learning, setLearning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/learner/lessons/${lessonId}/journey`)
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((view) => { if (!cancelled) setJourney(view); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [lessonId]);

  /** The learner finished the word cards; record it and refresh the path. */
  const finishLearning = useCallback(async () => {
    setLearning(false);
    try {
      const response = await fetch(`/api/learner/lessons/${lessonId}/journey`, { method: "POST" });
      if (response.ok) setJourney(await response.json());
    } catch {
      // The cards were still worth reading. Leaving the step unticked is better
      // than claiming progress that was never recorded.
    }
  }, [lessonId]);

  // The lesson is perfectly usable without this band; a failed load says
  // nothing rather than putting an error in front of someone trying to study.
  if (failed) return null;
  if (!journey) return <div className="paper-card mt-6 h-40 animate-pulse rounded-[30px]" aria-hidden />;

  if (learning) {
    return (
      <LessonWordCards
        words={words}
        onDone={() => void finishLearning()}
        onCancel={() => setLearning(false)}
      />
    );
  }

  return (
    <section className="paper-card mt-6 rounded-[30px] p-5 sm:p-7" aria-labelledby="journey-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journey-heading" className="text-lg font-black">Chặng học</h2>
        <span className="shrink-0 text-sm font-black text-[#176b55]">{journey.percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee7da]">
        <div className="h-full rounded-full bg-[#176b55] transition-all" style={{ width: `${journey.percent}%` }} />
      </div>

      {journey.isComplete && (
        <p className="mt-4 rounded-2xl bg-[#dff2e8] px-4 py-3 text-sm font-black text-[#176b55]">
          Bạn đã đi hết chặng này. Quay lại bất cứ bước nào để ôn thêm.
        </p>
      )}

      <ol className="mt-4 space-y-2">
        {journey.steps.map((step) => {
          const Icon = ICONS[step.step];
          const isNext = journey.nextStep === step.step;
          return (
            <li
              key={step.step}
              data-step={step.step}
              data-done={step.done}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-3 transition ${
                isNext ? "border-[#176b55] bg-[#f3fbf6]" : "border-[#ded8cc] bg-[#fffdf8]"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                  step.done ? "bg-[#176b55] text-white" : "bg-[#eee7da] text-[#68766f]"
                }`}
              >
                {step.done ? <Check className="h-5 w-5" /> : step.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-[#758078]" aria-hidden />
                  <span className="truncate text-sm font-black">{step.labelVi}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold text-[#758078]">{step.hintVi}</span>
              </span>
              <StepAction
                step={step}
                lessonId={lessonId}
                isNext={isNext}
                hasWords={words.length > 0}
                onLearn={() => setLearning(true)}
                onGoToExercises={onGoToExercises}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepAction({ step, lessonId, isNext, hasWords, onLearn, onGoToExercises }: {
  step: JourneyStepView;
  lessonId: string;
  isNext: boolean;
  hasWords: boolean;
  onLearn: () => void;
  onGoToExercises: () => void;
}) {
  // Every step stays reachable after it is done — a learner may always practise
  // again — but only the next one is dressed as the thing to do now.
  const className = isNext
    ? "shrink-0 rounded-xl bg-[#176b55] px-3 py-2 text-xs font-black text-white"
    : "shrink-0 rounded-xl border-2 border-[#ded8cc] px-3 py-2 text-xs font-black text-[#4a5750]";
  const label = isNext ? step.ctaVi : "Mở";

  if (step.step === "LEARN") {
    if (!hasWords) return <span className="shrink-0 text-xs font-bold text-[#9aa19d]">Bài chưa có từ</span>;
    return <button type="button" onClick={onLearn} className={className}>{label}</button>;
  }
  if (step.step === "PRACTICE" || step.step === "TEST") {
    return <button type="button" onClick={onGoToExercises} className={className}>{label}</button>;
  }
  const mode = step.step === "PLAY" ? "match" : "spell";
  return (
    <Link href={`/learner/games?lesson=${lessonId}&mode=${mode}`} className={className}>{label}</Link>
  );
}
