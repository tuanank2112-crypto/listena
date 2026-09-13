"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  CalendarCheck2,
  Check,
  Clock3,
  Coffee,
  Gamepad2,
  Headphones,
  Heart,
  LoaderCircle,
  RotateCcw,
  Search,
  Sparkles,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import { StartSessionButton } from "@/features/learning-session/start-session-button";
import {
  createGameAnswerRequest,
  createGameRunRequest,
  friendlyGameApiError,
  type PublicGameAnswerResult,
  type PublicGameRound,
  type PublicGameRun,
  type UiGameMode,
} from "@/features/adaptive-games/client-contract";

type MissionScenarioKey = "lost-luggage" | "cafe-order" | "mystery-clue";
type MatchCard = { token: string; kind: "word" | "meaning"; label: string };
type PendingAnswer = {
  runId: string;
  body: ReturnType<typeof createGameAnswerRequest>;
};

const modeInfo = {
  quiz: { title: "Chọn nhanh", subtitle: "Chạm đúng nghĩa", icon: Sparkles, color: "#ef765d" },
  match: { title: "Ghép cặp", subtitle: "Nối từ và nghĩa", icon: Gamepad2, color: "#176b55" },
  spell: { title: "Nghe & viết", subtitle: "Nghe rồi gõ từ", icon: Headphones, color: "#d89a2b" },
};

const missionInfo: Array<{
  key: MissionScenarioKey;
  eyebrow: string;
  title: string;
  description: string;
  goal: string;
  icon: typeof Briefcase;
  color: string;
  tint: string;
}> = [
  { key: "lost-luggage", eyebrow: "Sân bay · 6-8 lượt", title: "Chiếc vali thất lạc", description: "Mô tả hành lý, trả lời Maya và tìm lại chiếc vali trước giờ đóng quầy.", goal: "Báo thất lạc hành lý và mô tả chiếc vali đủ rõ để nhân viên tìm thấy.", icon: Briefcase, color: "#176b55", tint: "#dff2e8" },
  { key: "cafe-order", eyebrow: "Quán cafe · 5-7 lượt", title: "Ca trưa hỗn loạn", description: "Gọi món, xử lý một nhầm lẫn và giữ cuộc trò chuyện thật lịch sự.", goal: "Gọi đồ uống và món ăn, sau đó giải quyết một vấn đề bằng tiếng Anh lịch sự.", icon: Coffee, color: "#b86245", tint: "#ffe5dc" },
  { key: "mystery-clue", eyebrow: "Bí ẩn · 7-9 lượt", title: "Chiếc cúp biến mất", description: "Hỏi thám tử AI, nối các manh mối và đưa ra kết luận của riêng bạn.", goal: "Hỏi về các manh mối và xác định chiếc cúp bị giấu ở đâu.", icon: Search, color: "#9b6b13", tint: "#fff1bd" },
];

function timeLimitFor(mode: UiGameMode) {
  return mode === "match" ? 90 : mode === "spell" ? 75 : 60;
}

function newClientAnswerId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi) cryptoApi.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readJson(response: Response) {
  return await response.json().catch(() => null) as unknown;
}

export function GamesClient() {
  const [mode, setMode] = useState<UiGameMode | null>(null);
  const [run, setRun] = useState<PublicGameRun | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(60);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [selectedCards, setSelectedCards] = useState<MatchCard[]>([]);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const [startError, setStartError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [runIssue, setRunIssue] = useState("");
  const [audioError, setAudioError] = useState("");
  const promptStartedAtRef = useRef(0);
  const resolvingRef = useRef(false);
  const pendingAnswerRef = useRef<PendingAnswer | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const currentRound = run?.rounds[roundIndex];
  const totalRounds = run?.rounds.length ?? 0;
  const finished = Boolean(run && (roundIndex >= totalRounds || lives <= 0 || timeLeft <= 0));
  const gameEndedByRounds = Boolean(run && roundIndex >= totalRounds);

  useEffect(() => {
    if (!mode || !run || finished || runIssue) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [finished, mode, run, runIssue]);

  useEffect(() => () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (currentRound?.id) promptStartedAtRef.current = performance.now();
  }, [currentRound?.id]);

  function resetLocalState() {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setRoundIndex(0);
    setScore(0);
    setLives(3);
    setFeedback(null);
    setFeedbackMessage("");
    setAnswer("");
    setSelectedCards([]);
    setSubmitting(false);
    setRetryable(false);
    setRequestError("");
    setRunIssue("");
    setAudioError("");
    pendingAnswerRef.current = null;
    resolvingRef.current = false;
  }

  function leaveGame() {
    resetLocalState();
    setMode(null);
    setRun(null);
  }

  async function startGame(nextMode: UiGameMode) {
    if (starting) return;
    resetLocalState();
    setMode(null);
    setRun(null);
    setStarting(true);
    setStartError("");
    try {
      const response = await fetch("/api/game-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createGameRunRequest(nextMode)),
      });
      const payload = await readJson(response) as { run?: PublicGameRun } | null;
      if (!response.ok || !payload?.run?.id || !Array.isArray(payload.run.rounds)) {
        throw new Error(friendlyGameApiError(
          response.status,
          payload,
          response.headers.get("Retry-After"),
        ));
      }
      setMode(nextMode);
      setRun(payload.run);
      setTimeLeft(timeLimitFor(nextMode));
    } catch (caught) {
      setStartError(caught instanceof Error ? caught.message : "Chưa thể tạo lượt game.");
    } finally {
      setStarting(false);
    }
  }

  async function sendPendingAnswer() {
    const pending = pendingAnswerRef.current;
    if (!pending || !run || pending.runId !== run.id) return;

    resolvingRef.current = true;
    setSubmitting(true);
    setRetryable(false);
    setRequestError("");
    let accepted = false;

    try {
      const response = await fetch(`/api/game-runs/${pending.runId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body),
      });
      const payload = await readJson(response) as { result?: PublicGameAnswerResult } | null;
      if (!response.ok || !payload?.result) {
        const message = friendlyGameApiError(response.status, payload);
        if (response.status === 409 || response.status === 410 || response.status === 401) {
          pendingAnswerRef.current = null;
          setRunIssue(message);
        } else {
          setRequestError(message);
          setRetryable(true);
        }
        return;
      }

      accepted = true;
      pendingAnswerRef.current = null;
      settleServerResult(payload.result);
    } catch {
      // Keep the same idempotency key: the request may have reached the server
      // even when the browser did not receive a response.
      setRequestError("Không chắc máy chủ đã nhận đáp án. Gửi lại cùng đáp án để kiểm tra an toàn.");
      setRetryable(true);
    } finally {
      setSubmitting(false);
      if (!accepted) resolvingRef.current = false;
    }
  }

  function submitAnswer(nextAnswer: string | string[], answeredAt: number) {
    if (!run || !currentRound || resolvingRef.current || retryable || finished) return;
    const payload = createGameAnswerRequest({
      roundId: currentRound.id,
      answer: nextAnswer,
      clientAnswerId: newClientAnswerId(),
      responseTimeMs: answeredAt - promptStartedAtRef.current,
    });
    pendingAnswerRef.current = { runId: run.id, body: payload };
    void sendPendingAnswer();
  }

  function retryPendingAnswer() {
    if (!pendingAnswerRef.current || submitting) return;
    void sendPendingAnswer();
  }

  function settleServerResult(result: PublicGameAnswerResult) {
    setFeedback(result.correct ? "correct" : "wrong");
    setFeedbackMessage(result.feedbackVi);
    if (result.correct) {
      // This is display-only; the server's score/evidence is authoritative.
      setScore((value) => value + Math.max(10, Math.round(result.score * 20)));
    } else {
      setLives((value) => Math.max(0, value - 1));
    }

    advanceTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      setFeedbackMessage("");
      setAnswer("");
      setSelectedCards([]);
      setRoundIndex((value) => value + 1);
      resolvingRef.current = false;
      advanceTimerRef.current = null;
    }, 700);
  }

  function chooseCard(card: MatchCard, answeredAt: number) {
    if (resolvingRef.current || retryable || submitting || !currentRound) return;
    if (selectedCards.some((selected) => selected.token === card.token)) return;

    const first = selectedCards[0];
    if (!first || first.kind === card.kind) {
      setSelectedCards([card]);
      return;
    }
    setSelectedCards([first, card]);
    submitAnswer([first.token, card.token], answeredAt);
  }

  function playSpellAudio(audioUrl: string) {
    setAudioError("");
    const audio = new Audio(audioUrl);
    void audio.play().catch(() => setAudioError("Thiết bị không phát được âm thanh của lượt này."));
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {!mode ? (
        <>
          <header className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">AI playground</p>
              <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Bước vào câu chuyện.</h1>
            </div>
            <div className="hidden rounded-2xl bg-[#fffdf8] px-4 py-3 text-right shadow-sm sm:block">
              <p className="text-2xl font-black text-[#176b55]">6–8</p>
              <p className="text-[11px] font-bold text-[#77817b]">lượt do server chọn</p>
            </div>
          </header>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative mb-9 overflow-hidden rounded-[32px] bg-[#18332d] p-6 text-white sm:p-8">
            <div className="relative z-10 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-[#f7d779]"><CalendarCheck2 className="h-3.5 w-3.5" /> Daily AI Quest</span>
              <h2 className="mt-5 text-3xl font-black tracking-[-.05em] sm:text-4xl">Xem nhiệm vụ được chọn cho hôm nay.</h2>
              <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-white/65">Trang Hôm nay chọn một bước tiếp theo từ bằng chứng học, mục tiêu và thời lượng bạn đã lưu. Ở đây bạn vẫn có thể tự chọn một Mission bên dưới.</p>
              <Link href="/learner/dashboard" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#f7d779] px-5 text-sm font-black text-[#18332d] shadow-none transition hover:-translate-y-0.5 sm:w-fit">
                Xem nhiệm vụ hôm nay
              </Link>
            </div>
            <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#f7d779]/15" />
            <Bot className="absolute bottom-7 right-9 hidden h-28 w-28 rotate-6 text-[#f7d779] sm:block" strokeWidth={1.15} />
          </motion.section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#176b55]">Mission talk</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Bạn muốn nhập vai ai?</h2></div>
              <p className="hidden text-xs font-bold text-[#7b857f] sm:block">AI phản ứng theo từng câu bạn nói</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {missionInfo.map((mission, index) => (
                <motion.article key={mission.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 + index * .07 }} className="paper-card flex min-h-[310px] flex-col rounded-[28px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: mission.color, backgroundColor: mission.tint }}><mission.icon className="h-6 w-6" /></span>
                    <span className="rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-[.1em] text-[#68766f]">AI live</span>
                  </div>
                  <p className="mt-6 text-[11px] font-black uppercase tracking-[.14em]" style={{ color: mission.color }}>{mission.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-.04em]">{mission.title}</h3>
                  <p className="mt-2 flex-1 text-sm font-bold leading-6 text-[#7b857f]">{mission.description}</p>
                  <StartSessionButton mode="MISSION" scenarioKey={mission.key} goal={mission.goal} label="Vào vai" className="mt-5 [&_button]:w-full" />
                </motion.article>
              ))}
            </div>
          </section>

          <section className="mt-10 border-t border-[#ded8cc] pt-8">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[.16em] text-[#d89a2b]">Quick comeback</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Luyện phản xạ trong 5 phút</h2>
              <p className="mt-1 text-sm font-bold text-[#7b857f]">Server chọn từ, mức độ và lượt ôn dựa trên bằng chứng học của riêng bạn.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.keys(modeInfo) as UiGameMode[]).map((key, index) => {
                const item = modeInfo[key];
                return (
                  <motion.button key={key} type="button" disabled={starting} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .28 + index * .07 }} onClick={() => void startGame(key)} className="paper-card group min-h-[210px] rounded-[28px] p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(51,58,47,.11)] disabled:cursor-wait disabled:opacity-60">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: item.color }}><item.icon className="h-6 w-6" /></span>
                    <h2 className="mt-8 text-2xl font-black tracking-[-.04em]">{item.title}</h2>
                    <p className="mt-1 text-sm font-bold text-[#7b857f]">{item.subtitle}</p>
                    <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#eee7da]"><div className="h-full w-2/3 rounded-full" style={{ backgroundColor: item.color }} /></div>
                  </motion.button>
                );
              })}
            </div>
            {starting && <p className="mt-4 flex items-center gap-2 text-sm font-bold text-[#68766f]"><LoaderCircle className="h-4 w-4 animate-spin" /> Đang tạo lượt theo trình độ của bạn…</p>}
            {startError && <p className="mt-4 rounded-2xl bg-[#ffe5dc] px-4 py-3 text-sm font-bold text-[#a6493c]" role="alert">{startError}</p>}
          </section>
        </>
      ) : runIssue ? (
        <GameIssue mode={mode} message={runIssue} onLeave={leaveGame} onRestart={() => void startGame(mode)} />
      ) : finished ? (
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <motion.div initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="paper-card w-full rounded-[32px] p-7 text-center sm:p-9">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f7d779] text-[#18332d]"><Trophy className="h-8 w-8" /></div>
            <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-[#ef765d]">{gameEndedByRounds ? "Hoàn thành" : "Tạm dừng"}</p>
            <h1 className="mt-2 text-5xl font-black tracking-[-.06em]">{score}</h1>
            <p className="mt-1 text-sm font-bold text-[#758078]">điểm · {lives} tim còn lại</p>
            {!gameEndedByRounds && <p className="mt-3 text-sm font-bold text-[#a6493c]">Lượt còn lại sẽ hết hạn an toàn; bạn có thể tạo lượt mới khi sẵn sàng.</p>}
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => void startGame(mode)} className="min-h-12 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"><RotateCcw className="mr-2 inline h-4 w-4" /> Chơi lại</button>
              <button type="button" onClick={leaveGame} className="min-h-12 rounded-2xl bg-[#eee7da] px-4 text-sm font-black">Đổi game</button>
            </div>
          </motion.div>
        </div>
      ) : !run || !currentRound ? (
        <GameIssue mode={mode} message="Không tìm thấy lượt game hợp lệ. Hãy tạo lượt mới." onLeave={leaveGame} onRestart={() => void startGame(mode)} />
      ) : (
        <div className="mx-auto max-w-3xl">
          <header className="mb-5 flex items-center gap-3">
            <button type="button" onClick={leaveGame} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fffdf8] shadow-sm"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs font-black text-[#758078]"><span>{modeInfo[mode].title}</span><span>{Math.min(roundIndex + 1, totalRounds)}/{totalRounds}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ded8cc]"><motion.div className="h-full rounded-full bg-[#176b55]" animate={{ width: `${(roundIndex / Math.max(totalRounds, 1)) * 100}%` }} /></div>
            </div>
          </header>

          <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#18332d] px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-black"><Clock3 className="h-4 w-4 text-[#f7d779]" /> {timeLeft}s</span>
            <span className="text-sm font-black">{score} điểm</span>
            <span className="flex gap-1">{[0, 1, 2].map((heart) => <Heart key={heart} className={`h-4 w-4 ${heart < lives ? "fill-[#ef765d] text-[#ef765d]" : "text-white/25"}`} />)}</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.section key={`${run.id}-${currentRound.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="paper-card min-h-[430px] rounded-[30px] p-5 sm:p-8">
              <RoundView
                round={currentRound}
                answer={answer}
                selectedCards={selectedCards}
                disabled={Boolean(feedback) || submitting || retryable}
                onAnswerChange={setAnswer}
                onQuizAnswer={submitAnswer}
                onMatchCard={chooseCard}
                onSpellAnswer={(answeredAt) => submitAnswer(answer.trim(), answeredAt)}
                onPlayAudio={playSpellAudio}
                audioError={audioError}
              />
              {requestError && (
                <div className="mt-6 rounded-2xl bg-[#fff1bd] px-4 py-3 text-sm font-bold text-[#805c15]" role="alert">
                  <p>{requestError}</p>
                  {retryable && <button type="button" onClick={retryPendingAnswer} className="mt-3 min-h-10 rounded-xl bg-[#805c15] px-4 text-xs font-black text-white">Gửi lại đáp án</button>}
                </div>
              )}
              <AnimatePresence>{feedback && <motion.div initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-white shadow-xl lg:bottom-8 ${feedback === "correct" ? "bg-[#176b55]" : "bg-[#d6534d]"}`}>{feedback === "correct" ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}{feedbackMessage}</motion.div>}</AnimatePresence>
            </motion.section>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function RoundView({
  round,
  answer,
  selectedCards,
  disabled,
  onAnswerChange,
  onQuizAnswer,
  onMatchCard,
  onSpellAnswer,
  onPlayAudio,
  audioError,
}: {
  round: PublicGameRound;
  answer: string;
  selectedCards: MatchCard[];
  disabled: boolean;
  onAnswerChange: (value: string) => void;
  onQuizAnswer: (answer: string, answeredAt: number) => void;
  onMatchCard: (card: MatchCard, answeredAt: number) => void;
  onSpellAnswer: (answeredAt: number) => void;
  onPlayAudio: (audioUrl: string) => void;
  audioError: string;
}) {
  const content = round.content;
  if (content.kind === "quiz") {
    return (
      <div>
        <p className="text-center text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">{content.prompt}</p>
        <h2 className="mt-6 text-center text-4xl font-black tracking-[-.05em] sm:text-5xl">{content.word}</h2>
        <p className="mt-2 text-center text-sm font-bold text-[#869089]">{content.ipa}</p>
        {content.context && <p className="mx-auto mt-4 max-w-xl text-center text-sm font-bold leading-6 text-[#758078]">{content.context}</p>}
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          {content.options.map((option, index) => (
            <button key={`${round.id}-${index}`} type="button" disabled={disabled} onClick={(event) => onQuizAnswer(option, event.timeStamp)} className="min-h-16 rounded-2xl border-2 border-[#ded8cc] bg-white px-4 text-left text-sm font-black transition hover:border-[#176b55] hover:bg-[#dff2e8] disabled:cursor-wait disabled:opacity-60">{option}</button>
          ))}
        </div>
      </div>
    );
  }

  if (content.kind === "match") {
    return (
      <div>
        <p className="text-center text-xs font-black uppercase tracking-[.18em] text-[#176b55]">{content.prompt}</p>
        <p className="mx-auto mt-4 max-w-md text-center text-sm font-bold leading-6 text-[#758078]">Chạm một thẻ từ và một thẻ nghĩa. Máy chủ sẽ chấm cặp bạn chọn.</p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {content.cards.map((card) => {
            const selected = selectedCards.some((item) => item.token === card.token);
            return (
              <button key={card.token} type="button" onClick={(event) => onMatchCard(card, event.timeStamp)} disabled={disabled} className={`min-h-24 rounded-2xl border-2 p-3 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${selected ? "border-[#ef765d] bg-[#ffe5dc]" : "border-[#ded8cc] bg-white hover:border-[#176b55]"}`}>{card.label}</button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      <p className="text-xs font-black uppercase tracking-[.18em] text-[#d89a2b]">{content.prompt}</p>
      <button type="button" onClick={() => content.audioUrl && onPlayAudio(content.audioUrl)} disabled={!content.audioUrl} className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-[#f7d779] shadow-[0_12px_30px_rgba(216,154,43,.25)] disabled:cursor-not-allowed disabled:opacity-50"><Volume2 className="h-9 w-9" /></button>
      {content.audioUrl ? <p className="mt-3 text-xs font-bold text-[#758078]">Nghe lại bao nhiêu lần tùy bạn.</p> : <p className="mt-3 text-xs font-bold text-[#a06a18]">Tệp nghe chưa sẵn sàng cho lượt này. Bạn vẫn có thể luyện chính tả theo gợi ý nghĩa mà không lộ đáp án.</p>}
      {audioError && <p className="mt-3 text-xs font-bold text-[#d6534d]">{audioError}</p>}
      <p className="mt-5 text-sm font-bold text-[#758078]">{content.meaning}</p>
      <input value={answer} onChange={(event) => onAnswerChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && answer.trim()) onSpellAnswer(event.timeStamp); }} disabled={disabled} autoFocus className="mt-8 min-h-16 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-5 text-center text-xl font-black outline-none focus:border-[#176b55] disabled:cursor-wait disabled:opacity-60" placeholder="Gõ từ tiếng Anh" />
      <button type="button" onClick={(event) => onSpellAnswer(event.timeStamp)} disabled={!answer.trim() || disabled} className="mt-3 min-h-12 w-full rounded-2xl bg-[#176b55] font-black text-white disabled:opacity-40">Kiểm tra với máy chủ</button>
    </div>
  );
}

function GameIssue({ mode, message, onLeave, onRestart }: {
  mode: UiGameMode;
  message: string;
  onLeave: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
      <div className="paper-card w-full rounded-[32px] p-7 text-center sm:p-9">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ef765d]">Lượt game cần làm mới</p>
        <h1 className="mt-3 text-2xl font-black tracking-[-.04em]">Máy chủ không thể tiếp tục lượt này</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-[#758078]">{message}</p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" onClick={onRestart} className="min-h-12 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"><RotateCcw className="mr-2 inline h-4 w-4" /> Tạo lượt mới</button>
          <button type="button" onClick={onLeave} className="min-h-12 rounded-2xl bg-[#eee7da] px-4 text-sm font-black">Đổi game</button>
        </div>
        <p className="mt-4 text-xs font-bold text-[#8b948d]">Chế độ: {modeInfo[mode].title}</p>
      </div>
    </div>
  );
}
