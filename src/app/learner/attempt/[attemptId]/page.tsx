import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Ear, Puzzle, Shuffle, Star } from "lucide-react";
import { AttemptResultClient } from "./result-client";

const ASSIST_MODE_LABEL: Record<string, { label: string; Icon: typeof Puzzle }> = {
  FREE: { label: "Gõ tự do", Icon: Ear },
  SKELETON: { label: "Viết dần", Icon: Puzzle },
  TILES: { label: "Ghép mảnh", Icon: Shuffle },
};

const CONFIDENCE_LABEL: Record<number, string> = { 1: "Đoán thôi", 2: "Khá chắc", 3: "Rất chắc" };
const CALIBRATION_SAMPLE = 50;
const CONFIDENT_THRESHOLD = 3;
const CORRECT_THRESHOLD = 70;

type CalibrationBucket = "correctSure" | "correctUnsure" | "wrongSure" | "wrongUnsure";

/** Answer Canvas calibration: (score >= 70) × (confidence === 3). */
function calibrationBucket(score: number | null, confidence: number): CalibrationBucket {
  const correct = (score ?? 0) >= CORRECT_THRESHOLD;
  const sure = confidence >= CONFIDENT_THRESHOLD;
  if (correct) return sure ? "correctSure" : "correctUnsure";
  return sure ? "wrongSure" : "wrongUnsure";
}

export default async function AttemptResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      errors: true,
      exercise: true,
      lesson: {
        select: { id: true, title: true, transcript: true, cefrLevel: true },
      },
      flashcards: {
        include: { vocabularyItem: true },
      },
    },
  });

  if (!attempt || attempt.userId !== userId) {
    notFound();
  }

  // Get recommendations for next lesson
  const recommendation = await prisma.recommendation.findFirst({
    where: { userId, status: "PENDING" },
    include: { lesson: { select: { id: true, title: true } } },
    orderBy: { score: "desc" },
  });

  // P133: confidence bet + assist mode badges and a simple calibration history
  // over the learner's recent bets. Columns are additive (Plan13 migration);
  // attempts without a bet simply do not contribute.
  const confidence = attempt.confidence ?? null;
  const assistMode = attempt.assistMode ?? null;
  const history = confidence
    ? await prisma.attempt.findMany({
        where: { userId, confidence: { not: null } },
        orderBy: { createdAt: "desc" },
        take: CALIBRATION_SAMPLE,
        select: { score: true, confidence: true },
      })
    : [];
  const calibration: Record<CalibrationBucket, number> = { correctSure: 0, correctUnsure: 0, wrongSure: 0, wrongUnsure: 0 };
  for (const row of history) {
    if (row.confidence) calibration[calibrationBucket(row.score, row.confidence)] += 1;
  }
  const bucket = confidence ? calibrationBucket(attempt.score, confidence) : null;
  const modeBadge = assistMode ? ASSIST_MODE_LABEL[assistMode] : null;

  return (
    <>
      <AttemptResultClient
        attempt={JSON.parse(JSON.stringify(attempt))}
        recommendation={recommendation
          ? { id: recommendation.lesson.id, title: recommendation.lesson.title }
          : null}
      />
      {(modeBadge || confidence) && (
        <section aria-label="Cách làm bài" className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
          <div className="paper-card rounded-[26px] p-5">
            <div className="flex flex-wrap items-center gap-2">
              {modeBadge && (
                <span data-testid="assist-mode-badge" className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#dff2e8] px-3 text-xs font-black text-[#176b55]"><modeBadge.Icon className="h-4 w-4" /> {modeBadge.label}</span>
              )}
              {confidence && (
                <span data-testid="confidence-badge" className="flex min-h-9 items-center gap-1 rounded-full bg-[#fff1c9] px-3 text-xs font-black text-[#795c19]">
                  {Array.from({ length: 3 }, (_, index) => <Star key={index} className="h-4 w-4" fill={index < confidence ? "currentColor" : "none"} />)}
                  <span className="ml-1">{confidence} sao · {CONFIDENCE_LABEL[confidence]}</span>
                </span>
              )}
            </div>
            {bucket && (
              <>
                <p className="mt-3 text-sm font-black">
                  {bucket === "correctSure" && "Bạn đoán đúng độ chắc chắn: chắc và đúng."}
                  {bucket === "correctUnsure" && "Đúng rồi, nhưng bạn chưa tin mình — lần sau mạnh dạn hơn nhé."}
                  {bucket === "wrongSure" && "Rất chắc mà chưa đúng: xem lại lỗi bên trên để hiệu chỉnh."}
                  {bucket === "wrongUnsure" && "Bạn đoán đúng độ chắc chắn: không chắc và chưa đúng. Ôn thêm rồi thử lại."}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-[#68766f] sm:grid-cols-4">
                  <div className="rounded-xl bg-[#dff2e8] p-3"><dt>Đúng · chắc</dt><dd className="text-lg font-black text-[#176b55]">{calibration.correctSure}</dd></div>
                  <div className="rounded-xl bg-[#f4efe5] p-3"><dt>Đúng · không chắc</dt><dd className="text-lg font-black text-[#18332d]">{calibration.correctUnsure}</dd></div>
                  <div className="rounded-xl bg-[#ffe5dc] p-3"><dt>Sai · chắc</dt><dd className="text-lg font-black text-[#d6534d]">{calibration.wrongSure}</dd></div>
                  <div className="rounded-xl bg-[#f4efe5] p-3"><dt>Sai · không chắc</dt><dd className="text-lg font-black text-[#18332d]">{calibration.wrongUnsure}</dd></div>
                </dl>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
