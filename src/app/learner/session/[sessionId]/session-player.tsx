"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CircleHelp,
  Flag,
  Gauge,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Volume2,
} from "lucide-react";
import { speak } from "@/core/tts/speech";
import { InterventionRenderer } from "@/features/learning-session/intervention-renderer";
import { makeClientId } from "@/features/learning-session/client-id";
import {
  createInitialPlayerState,
  learningSessionPlayerReducer,
} from "@/features/learning-session/reducer";
import {
  extractAiMessages,
  extractTurnText,
  getPendingIntervention,
  type PublicIntervention,
  type PublicLearningSession,
  type SessionPhase,
  type SessionTurn,
  type TurnSubmission,
} from "@/features/learning-session/types";

const phaseLabels: Record<SessionPhase, string> = {
  BRIEFING: "Nhận nhiệm vụ",
  ENCOUNTER: "Đối thoại",
  CONSEQUENCE: "Tình huống đổi hướng",
  COMEBACK: "Sửa lỗi thông minh",
  BOSS: "Thử thách cuối",
  DEBRIEF: "Nhìn lại",
};

const phaseOrder: SessionPhase[] = ["BRIEFING", "ENCOUNTER", "CONSEQUENCE", "COMEBACK", "BOSS", "DEBRIEF"];

interface TurnEnvelope {
  session?: PublicLearningSession;
  learnerTurn?: SessionTurn;
  aiTurn?: SessionTurn;
  intervention?: PublicIntervention | null;
  error?: string;
}

function mergeTurnEnvelope(payload: TurnEnvelope) {
  if (!payload.session) throw new Error(payload.error || "AI chưa trả lại phiên học.");
  const session = payload.session;
  const turns = [...session.turns];
  for (const turn of [payload.learnerTurn, payload.aiTurn]) {
    if (turn && !turns.some((item) => item.id === turn.id)) turns.push(turn);
  }
  turns.sort((a, b) => a.sequence - b.sequence);

  const interventions = [...session.interventions];
  if (payload.intervention) {
    const index = interventions.findIndex((item) => item.id === payload.intervention?.id);
    if (index >= 0) interventions[index] = payload.intervention;
    else interventions.push(payload.intervention);
  }
  return { ...session, turns, interventions };
}

function hintFor(intervention: PublicIntervention | null) {
  if (!intervention) return "Hãy trả lời ngắn trước. AI sẽ hỏi tiếp dựa trên chính câu bạn viết.";
  switch (intervention.type) {
    case "CHOICE":
      return "Loại phương án không hợp ngữ cảnh trước, rồi đọc lại câu với phương án còn lại.";
    case "REORDER":
      return "Tìm chủ ngữ trước, sau đó là động từ và phần bổ sung.";
    case "FILL_BLANK":
      return "Đọc cả câu và xác định loại từ còn thiếu trước khi điền.";
    case "RETRY":
      return "Giữ nguyên ý bạn muốn nói, chỉ sửa phần AI vừa nhắc.";
    case "USE_IN_SENTENCE":
      return "Viết một câu thật về bạn; câu đơn giản nhưng đúng sẽ tốt hơn câu dài.";
  }
}

function shouldOfferCompletion(session: PublicLearningSession) {
  if (session.state.phase === "DEBRIEF" || session.state.turnCount >= session.state.maxTurns) return true;
  const latestAiTurn = [...session.turns].reverse().find((turn) => turn.actor === "AI");
  if (!latestAiTurn?.content || typeof latestAiTurn.content !== "object") return false;
  return (latestAiTurn.content as Record<string, unknown>).shouldComplete === true;
}

export function LearningSessionPlayer({ sessionId }: { sessionId: string }) {
  const [player, dispatch] = useReducer(learningSessionPlayerReducer, undefined, () => createInitialPlayerState());
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const session = player.session;
  const pendingIntervention = getPendingIntervention(session);
  const busy = player.phase === "submitting" || player.phase === "completing";

  const loadSession = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    dispatch({ type: "LOAD_START" });
    try {
      const response = await fetch(`/api/learning-sessions/${sessionId}`, { cache: "no-store", signal: controller.signal });
      const payload = (await response.json()) as { session?: PublicLearningSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Không thể tải phiên học.");
      dispatch({ type: "LOAD_SUCCESS", session: payload.session, now: Date.now() });
    } catch (caught) {
      if (controller.signal.aborted) return;
      dispatch({ type: "LOAD_FAILURE", error: caught instanceof Error ? caught.message : "Không thể tải phiên học." });
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
    return () => requestControllerRef.current?.abort();
  }, [loadSession]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns.length, pendingIntervention?.id]);

  const recordEvent = useCallback(async (type: "HINT" | "REPLAY" | "PAUSE" | "RESUME") => {
    try {
      await fetch(`/api/learning-sessions/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, clientEventId: makeClientId("event") }),
        keepalive: true,
      });
    } catch {
      // Analytics events never block the learner's main interaction.
    }
  }, [sessionId]);

  useEffect(() => {
    function onVisibilityChange() {
      void recordEvent(document.hidden ? "PAUSE" : "RESUME");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [recordEvent]);

  const submitTurn = useCallback(async (content?: string, interventionId?: string, retrySubmission?: TurnSubmission) => {
    const normalizedContent = content?.trim() ?? "";
    const submission = retrySubmission ?? {
      clientTurnId: makeClientId("turn"),
      content: normalizedContent,
      responseTimeMs: Math.max(0, Date.now() - player.turnStartedAt),
      hintCount: player.hintCount,
      replayCount: player.replayCount,
      interventionId,
    };
    if (!submission.content || busy) return;

    dispatch({ type: "SUBMIT_START", submission });
    try {
      const response = await fetch(`/api/learning-sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      const payload = (await response.json()) as TurnEnvelope;
      if (!response.ok) throw new Error(payload.error || "AI chưa phản hồi. Thử lại nhé.");
      dispatch({ type: "SUBMIT_SUCCESS", session: mergeTurnEnvelope(payload), now: Date.now() });
    } catch (caught) {
      dispatch({ type: "SUBMIT_FAILURE", error: caught instanceof Error ? caught.message : "AI chưa phản hồi. Thử lại nhé." });
    }
  }, [busy, player.hintCount, player.replayCount, player.turnStartedAt, sessionId]);

  async function completeSession() {
    if (!session || busy) return;
    dispatch({ type: "COMPLETE_START" });
    try {
      const response = await fetch(`/api/learning-sessions/${sessionId}/complete`, { method: "POST" });
      const payload = (await response.json()) as { session?: PublicLearningSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Chưa thể kết thúc phiên.");
      dispatch({ type: "COMPLETE_SUCCESS", session: payload.session });
    } catch (caught) {
      dispatch({ type: "COMPLETE_FAILURE", error: caught instanceof Error ? caught.message : "Chưa thể kết thúc phiên." });
    }
  }

  function replay(text: string) {
    dispatch({ type: "COUNT_REPLAY" });
    void recordEvent("REPLAY");
    void speak({ text, lang: "en", quality: "high", speed: 0.92 });
  }

  function requestHint() {
    dispatch({ type: "COUNT_HINT" });
    void recordEvent("HINT");
  }

  const learnerTurns = useMemo(() => session?.turns.filter((turn) => turn.actor === "LEARNER").length ?? 0, [session?.turns]);

  if (player.phase === "loading" && !session) return <LoadingState />;

  if (player.phase === "fatal-error" || !session) {
    return (
      <div className="mx-auto flex min-h-[72vh] max-w-lg items-center px-5 py-12">
        <div className="paper-card w-full rounded-[30px] p-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffe5dc] text-[#d6534d]"><RefreshCw className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-black">Phiên học chưa mở được</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-[#748079]">{player.error}</p>
          <button onClick={() => void loadSession()} className="mt-6 min-h-12 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white">Tải lại phiên</button>
        </div>
      </div>
    );
  }

  if (player.phase === "completed" || session.status === "COMPLETED") {
    return <Debrief session={session} />;
  }

  const mission = session.state;
  const progress = Math.min(100, Math.round((mission.turnCount / Math.max(mission.maxTurns, 1)) * 100));

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-center gap-3">
        <Link href={session.lessonId ? `/learner/lessons/${session.lessonId}` : "/learner/dashboard"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fffdf8] shadow-sm" aria-label="Rời phiên học">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-[.15em] text-[#ef765d]">AI Mission · {phaseLabels[mission.phase]}</p>
          <h1 className="truncate text-xl font-black tracking-[-.04em] sm:text-2xl">{mission.scenarioTitle}</h1>
        </div>
        {shouldOfferCompletion(session) && (
          <button onClick={() => void completeSession()} disabled={busy} className="hidden min-h-11 items-center gap-2 rounded-2xl bg-[#18332d] px-4 text-xs font-black text-white disabled:opacity-50 sm:flex">
            <Flag className="h-4 w-4 text-[#f7d779]" /> Kết thúc
          </button>
        )}
      </header>

      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ded8cc]"><motion.div className="h-full rounded-full bg-[#176b55]" animate={{ width: `${progress}%` }} /></div>
        <span className="text-xs font-black text-[#77817b]">{mission.turnCount}/{mission.maxTurns}</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="paper-card overflow-hidden rounded-[30px]">
          <div className="border-b border-[#ded8cc] bg-[#18332d] px-5 py-4 text-white sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f7d779] font-black text-[#18332d]">{mission.npcName.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{mission.npcName}</p>
                <p className="truncate text-xs font-bold text-white/55">{mission.npcRole} · đang phản ứng theo câu trả lời của bạn</p>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-[#7fdda9] shadow-[0_0_0_5px_rgba(127,221,169,.12)]" />
            </div>
          </div>

          <div className="min-h-[430px] space-y-4 bg-[radial-gradient(rgba(23,107,85,.07)_1px,transparent_1px)] bg-[length:22px_22px] px-4 py-5 sm:max-h-[62vh] sm:overflow-y-auto sm:px-6">
            {session.turns.length === 0 && <MissionBrief mission={mission} />}
            {session.turns.map((turn) => <TurnBubble key={turn.id} turn={turn} npcName={mission.npcName} onReplay={replay} />)}

            <AnimatePresence>
              {busy && player.phase === "submitting" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mr-auto flex max-w-[85%] items-center gap-3 rounded-2xl rounded-bl-md bg-[#18332d] px-4 py-3 text-sm font-bold text-white">
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#f7d779]" /> {mission.npcName} đang cân nhắc câu trả lời...
                </motion.div>
              )}
            </AnimatePresence>

            {pendingIntervention && (
              <InterventionRenderer intervention={pendingIntervention} disabled={busy} onReplay={replay} onSubmit={(content) => void submitTurn(content, pendingIntervention.id)} />
            )}
            <div ref={conversationEndRef} />
          </div>

          <div className="border-t border-[#ded8cc] bg-[#fffdf8] p-4 sm:p-5">
            {player.error && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#ffe5dc] px-4 py-3 text-sm font-bold text-[#a33f3a]" role="alert">
                <span>{player.error}</span>
                {player.pendingSubmission && <button onClick={() => void submitTurn(undefined, undefined, player.pendingSubmission ?? undefined)} className="rounded-xl bg-white px-3 py-2 text-xs font-black">Gửi lại</button>}
              </div>
            )}

            {player.hintCount > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-2xl bg-[#fff2bf] px-4 py-3 text-sm font-bold leading-6 text-[#765b16]">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /> {hintFor(pendingIntervention)}
              </div>
            )}

            {!pendingIntervention && (
              <form onSubmit={(event) => { event.preventDefault(); void submitTurn(player.draft); }}>
                <label htmlFor="session-answer" className="sr-only">Trả lời nhân vật AI</label>
                <textarea
                  id="session-answer"
                  value={player.draft}
                  onChange={(event) => dispatch({ type: "SET_DRAFT", value: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitTurn(player.draft);
                    }
                  }}
                  rows={2}
                  disabled={busy}
                  className="w-full resize-none rounded-2xl border-2 border-[#ded8cc] bg-white px-4 py-3 text-base font-bold outline-none focus:border-[#176b55] disabled:opacity-60"
                  placeholder={`Trả lời ${mission.npcName} bằng tiếng Anh...`}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={requestHint} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-black text-[#b27a20] disabled:opacity-50">
                    <CircleHelp className="h-4 w-4" /> Gợi ý Socratic
                  </button>
                  <button type="submit" disabled={busy || !player.draft.trim()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.2)] disabled:opacity-40">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi câu trả lời
                  </button>
                </div>
              </form>
            )}

            {pendingIntervention && (
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#77817b]">
                <button type="button" onClick={requestHint} disabled={busy} className="inline-flex min-h-10 items-center gap-2 text-[#b27a20]"><CircleHelp className="h-4 w-4" /> Xin gợi ý</button>
                <span>Hoàn thành comeback để tiếp tục hội thoại</span>
              </div>
            )}
          </div>
        </main>

        <MissionSidebar session={session} learnerTurns={learnerTurns} onComplete={() => void completeSession()} completing={player.phase === "completing"} />
      </div>
    </div>
  );
}

function TurnBubble({ turn, npcName, onReplay }: { turn: SessionTurn; npcName: string; onReplay: (text: string) => void }) {
  if (turn.actor === "LEARNER") {
    return (
      <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-[#176b55] px-4 py-3 text-sm font-bold leading-6 text-white sm:max-w-[76%]">
        {extractTurnText(turn.content)}
      </motion.div>
    );
  }

  const { npcReply, coachMessage } = extractAiMessages(turn.content);
  const fallbackText = extractTurnText(turn.content);
  const message = npcReply || fallbackText;

  return (
    <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      {message && (
        <div className="mr-auto max-w-[90%] rounded-2xl rounded-bl-md bg-[#18332d] px-4 py-3 text-sm font-bold leading-6 text-white sm:max-w-[80%]">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[.12em] text-[#f7d779]">
            <span>{npcName}</span>
            <button type="button" onClick={() => onReplay(message)} className="rounded-lg p-1 text-white/70 hover:bg-white/10" aria-label={`Nghe ${npcName} nói`}><Volume2 className="h-4 w-4" /></button>
          </div>
          <p className="whitespace-pre-wrap">{message}</p>
        </div>
      )}
      {coachMessage && (
        <div className="mr-auto flex max-w-[92%] items-start gap-3 rounded-2xl border border-[#e7c969] bg-[#fff2bf] px-4 py-3 text-sm font-bold leading-6 text-[#675119] sm:max-w-[82%]">
          <Bot className="mt-0.5 h-4 w-4 shrink-0" />
          <div><p className="mb-0.5 text-[10px] font-black uppercase tracking-[.13em]">AI Coach</p><p className="whitespace-pre-wrap">{coachMessage}</p></div>
        </div>
      )}
    </motion.div>
  );
}

function MissionBrief({ mission }: { mission: PublicLearningSession["state"] }) {
  return (
    <div className="rounded-[24px] border border-[#ded8cc] bg-[#fffdf8] p-5">
      <div className="flex items-center gap-2 text-[#ef765d]"><Target className="h-5 w-5" /><p className="text-xs font-black uppercase tracking-[.15em]">Nhiệm vụ của bạn</p></div>
      <p className="mt-3 text-lg font-black leading-snug">{mission.learnerGoal}</p>
      {mission.targetVocabulary.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">{mission.targetVocabulary.map((word) => <span key={word} className="rounded-xl bg-[#dff2e8] px-3 py-1.5 text-xs font-black text-[#176b55]">{word}</span>)}</div>
      )}
    </div>
  );
}

function Meter({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Gauge; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-black"><span className="flex items-center gap-1.5"><Icon className="h-4 w-4" />{label}</span><span>{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full rounded-full" style={{ backgroundColor: color }} animate={{ width: `${value}%` }} /></div>
    </div>
  );
}

function MissionSidebar({ session, learnerTurns, onComplete, completing }: { session: PublicLearningSession; learnerTurns: number; onComplete: () => void; completing: boolean }) {
  const state = session.state;
  const currentPhaseIndex = phaseOrder.indexOf(state.phase);
  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <div className="rounded-[28px] bg-[#18332d] p-5 text-white shadow-[0_18px_45px_rgba(24,51,45,.16)]">
        <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#f7d779]">Mission pulse</p>
        <div className="mt-5 space-y-5">
          <Meter label="Trust" value={state.trust} icon={ShieldCheck} color="#7fdda9" />
          <Meter label="Evidence" value={state.evidence} icon={Sparkles} color="#f7d779" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-center">
          <div><p className="text-xl font-black">{state.successfulTurns}</p><p className="text-[10px] font-bold text-white/50">lượt tốt</p></div>
          <div><p className="text-xl font-black">{state.recoveryCount}</p><p className="text-[10px] font-bold text-white/50">comeback</p></div>
        </div>
      </div>

      <div className="paper-card rounded-[26px] p-5">
        <p className="text-[11px] font-black uppercase tracking-[.15em] text-[#879088]">Hành trình</p>
        <div className="mt-4 space-y-3">
          {phaseOrder.map((phase, index) => {
            const active = phase === state.phase;
            const done = index < currentPhaseIndex;
            return (
              <div key={phase} className={`flex items-center gap-3 text-xs font-black ${active ? "text-[#176b55]" : done ? "text-[#748079]" : "text-[#b0b1aa]"}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${active ? "bg-[#176b55] text-white" : done ? "bg-[#dff2e8] text-[#176b55]" : "bg-[#eee7da]"}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                {phaseLabels[phase]}
              </div>
            );
          })}
        </div>
      </div>

      {(shouldOfferCompletion(session) || learnerTurns >= 3) && (
        <button onClick={onComplete} disabled={completing} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#18332d] bg-[#fffdf8] px-4 text-sm font-black disabled:opacity-50">
          {completing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Kết thúc & xem debrief
        </button>
      )}
    </aside>
  );
}

function Debrief({ session }: { session: PublicLearningSession }) {
  const state = session.state;
  return (
    <div className="mx-auto flex min-h-[78vh] max-w-3xl items-center px-4 py-10 sm:px-6">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="paper-card relative w-full overflow-hidden rounded-[34px] p-6 sm:p-9">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#f7d779]/55" />
        <div className="relative">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#176b55] text-white shadow-[0_12px_28px_rgba(23,107,85,.25)]"><Trophy className="h-8 w-8" /></span>
          <p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Mission debrief</p>
          <h1 className="mt-2 max-w-xl text-3xl font-black tracking-[-.05em] sm:text-5xl">Bạn đã làm tình huống chuyển động.</h1>
          <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-[#65746c]">{session.summary || `Bạn đã hoàn thành “${state.scenarioTitle}” bằng ${state.turnCount} lượt tương tác. AI đã ghi nhận những gì bạn tự nói, tự sửa và dùng lại trong ngữ cảnh mới.`}</p>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { value: state.trust, label: "Trust" },
              { value: state.evidence, label: "Evidence" },
              { value: state.successfulTurns, label: "Lượt tốt" },
              { value: state.recoveryCount, label: "Comeback" },
            ].map((item) => <div key={item.label} className="rounded-2xl bg-[#f4efe5] p-4"><p className="text-2xl font-black text-[#176b55]">{item.value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.1em] text-[#7b857f]">{item.label}</p></div>)}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={session.lessonId ? `/learner/lessons/${session.lessonId}` : "/learner/dashboard"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white">Tiếp tục học <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/learner/dashboard" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#eee7da] px-5 text-sm font-black">Về trang hôm nay</Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex min-h-[72vh] max-w-md items-center justify-center px-5 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#18332d] text-[#f7d779]"><MessageCircleMore className="h-7 w-7 animate-pulse" /></div>
        <h1 className="mt-5 text-2xl font-black">Đang khôi phục tình huống...</h1>
        <p className="mt-2 text-sm font-bold text-[#748079]">AI đang lấy lại hội thoại và tiến độ gần nhất của bạn.</p>
      </div>
    </div>
  );
}
