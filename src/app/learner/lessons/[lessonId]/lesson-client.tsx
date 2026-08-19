"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cleanVocabularyMeaning } from "@/core/text/vocabulary";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Gamepad2,
  Headphones,
  HelpCircle,
  LoaderCircle,
  Play,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";

interface ExerciseMetadata {
  content?: string[];
  answerMode?: "open" | "guided";
}

interface LessonData {
  id: string;
  title: string;
  topic: string;
  cefrLevel: string;
  transcript: string;
  audioUrl: string | null;
  accent: string;
  defaultPlaybackRate: number;
  estimatedMinutes: number;
  course: { title: string };
  segments: Array<{ id: string; position: number; text: string; audioUrl: string | null; difficulty: number }>;
  vocabulary: Array<{
    vocabularyItem: {
      id: string;
      displayText: string;
      ipa: string | null;
      meaningVi: string;
      exampleSentence: string | null;
    };
  }>;
  exercises: Array<{
    id: string;
    type: string;
    prompt: string;
    correctAnswer: string;
    metadata: string | null;
    position: number;
    segmentId: string | null;
  }>;
}

interface LearningContext {
  unit: number;
  title: string;
  objectives: string[];
  grammar: Array<{ id: string; title: string; content: string }>;
}

interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; title: string; type: string }>;
}

function parseMetadata(value: string | null): ExerciseMetadata {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export function LessonDetailClient({ lesson, lastAttemptMap, learningContext }: {
  lesson: LessonData;
  lastAttemptMap: Record<string, { score: number | null }>;
  learningContext: LearningContext | null;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [replayCount, setReplayCount] = useState(0);
  const [rate, setRate] = useState(lesson.defaultPlaybackRate);
  const [playing, setPlaying] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [tutorOpen, setTutorOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);

  const exercise = lesson.exercises[index];
  const metadata = parseMetadata(exercise?.metadata ?? null);
  const segment = lesson.segments.find((item) => item.id === exercise?.segmentId);
  const progress = ((index + 1) / Math.max(lesson.exercises.length, 1)) * 100;
  const audioAvailable = Boolean(segment?.audioUrl || lesson.audioUrl || exercise?.type === "FULL_DICTATION");

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lesson.accent === "uk" ? "en-GB" : "en-US";
    utterance.rate = rate;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }, [lesson.accent, rate]);

  const play = useCallback(async (target = segment) => {
    const url = target?.audioUrl || lesson.audioUrl;
    if (!url) return speak(target?.text ?? exercise?.correctAnswer ?? "");
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.onplay = () => setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => { setPlaying(false); speak(target?.text ?? ""); };
    audioRef.current = audio;
    try { await audio.play(); } catch { speak(target?.text ?? ""); }
  }, [exercise?.correctAnswer, lesson.audioUrl, rate, segment, speak]);

  function move(next: number) {
    setIndex(next);
    setAnswer("");
    setError("");
    setHint(false);
    setHintCount(0);
    setReplayCount(0);
    setStartedAt(Date.now());
  }

  async function submit() {
    if (!answer.trim()) return setError("Nhập câu trả lời trước nhé.");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          lessonId: lesson.id,
          submittedAnswer: answer.trim(),
          completionTimeMs: Date.now() - startedAt,
          replayCount,
          hintCount,
          playbackRate: rate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể chấm bài");
      router.push(`/learner/attempt/${payload.attempt.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Thử lại nhé.");
    } finally { setLoading(false); }
  }

  async function askTutor() {
    const text = question.trim();
    if (!text || asking) return;
    setQuestion("");
    setMessages((items) => [...items, { role: "user", content: text }]);
    setAsking(true);
    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, exerciseId: exercise.id, question: text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tutor đang bận");
      setMessages((items) => [...items, { role: "assistant", content: payload.answer, sources: payload.sources }]);
    } catch (caught) {
      setMessages((items) => [...items, { role: "assistant", content: caught instanceof Error ? caught.message : "Thử lại nhé." }]);
    } finally { setAsking(false); }
  }

  const hintText = metadata.answerMode === "open" ? "Viết 2–3 câu ngắn. Ưu tiên đúng ý." : `${exercise?.correctAnswer.split(/\s+/).slice(0, 4).join(" ")}…`;

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/learner/lessons" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fffdf8] shadow-sm"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black uppercase tracking-[.13em] text-[#ef765d]">{lesson.cefrLevel} · {lesson.estimatedMinutes} phút</p>
          <h1 className="truncate text-xl font-black tracking-[-.04em] sm:text-2xl">{lesson.title.replace(/^Bài \d+ - /, "")}</h1>
        </div>
        <Link href="/learner/games" className="hidden min-h-11 items-center gap-2 rounded-2xl bg-[#18332d] px-4 text-xs font-black text-white sm:flex"><Gamepad2 className="h-4 w-4" /> Chơi</Link>
      </header>

      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ded8cc]"><motion.div className="h-full rounded-full bg-[#176b55]" animate={{ width: `${progress}%` }} /></div>
        <span className="text-xs font-black text-[#77817b]">{index + 1}/{lesson.exercises.length}</span>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main>
          <motion.section key={exercise?.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="paper-card rounded-[30px] p-5 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dff2e8] text-sm font-black text-[#176b55]">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[.14em] text-[#879088]">{exercise?.type === "VOCABULARY" ? "Từ vựng" : exercise?.type === "FULL_DICTATION" ? "Nghe" : "Thực hành"}</p>
                <h2 className="mt-1 text-xl font-black leading-snug tracking-[-.03em] sm:text-2xl">{exercise?.prompt}</h2>
              </div>
            </div>

            {metadata.content?.length ? (
              <div className="mt-6 max-h-[330px] space-y-2 overflow-y-auto rounded-2xl bg-[#f4efe5] p-4 sm:p-5">
                {metadata.content.map((line, lineIndex) => <p key={lineIndex} className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#45584f]">{line}</p>)}
              </div>
            ) : null}

            {audioAvailable && (
              <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl bg-[#18332d] p-3 text-white">
                <button onClick={() => { setReplayCount((value) => value + 1); void play(); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f7d779] px-4 text-sm font-black text-[#18332d]">{playing ? <Volume2 className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />} {playing ? "Đang nghe" : "Nghe"}</button>
                {[.75, .9, 1, 1.15].map((speed) => <button key={speed} onClick={() => setRate(speed)} className={`min-h-9 rounded-lg px-2 text-xs font-black ${rate === speed ? "bg-white text-[#18332d]" : "text-white/60"}`}>{speed}x</button>)}
                {lesson.segments.length > 1 && <span className="ml-auto text-xs font-bold text-white/50">{lesson.segments.length} đoạn</span>}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <label htmlFor="answer" className="text-sm font-black">Câu trả lời</label>
              <button onClick={() => { setHint(true); setHintCount((value) => value + 1); }} className="flex min-h-10 items-center gap-1.5 px-2 text-xs font-black text-[#d18b25]"><HelpCircle className="h-4 w-4" /> Gợi ý</button>
            </div>
            <AnimatePresence>{hint && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-2xl bg-[#fff1c9] px-4 py-3 text-sm font-bold text-[#795c19]">{hintText}</motion.div>}</AnimatePresence>
            <textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} className="mt-3 block w-full resize-none rounded-2xl border-2 border-[#ded8cc] bg-white px-4 py-3 text-sm font-bold outline-none placeholder:text-[#a4aaa6] focus:border-[#176b55]" placeholder="Nhập đáp án…" />
            {error && <p role="alert" className="mt-2 text-sm font-bold text-[#d6534d]">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button onClick={submit} disabled={loading || !answer.trim()} className="min-h-12 flex-1 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-40">{loading ? "Đang chấm…" : "Kiểm tra"}</button>
              {index < lesson.exercises.length - 1 && <button onClick={() => move(index + 1)} className="flex min-h-12 items-center gap-1 rounded-2xl bg-[#eee7da] px-4 text-sm font-black">Tiếp <ArrowRight className="h-4 w-4" /></button>}
            </div>
          </motion.section>

          <details className="paper-card group mt-4 rounded-[24px] px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black"><span>{lesson.vocabulary.length} từ trong bài</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {lesson.vocabulary.map(({ vocabularyItem }) => <button key={vocabularyItem.id} onClick={() => speak(vocabularyItem.displayText)} className="flex min-h-14 items-center gap-3 rounded-2xl bg-[#f4efe5] px-3 text-left"><Volume2 className="h-4 w-4 shrink-0 text-[#176b55]" /><div className="min-w-0"><p className="truncate text-sm font-black">{vocabularyItem.displayText}</p><p className="truncate text-xs font-bold text-[#7b857f]">{cleanVocabularyMeaning(vocabularyItem.meaningVi)}</p></div></button>)}
            </div>
          </details>
        </main>

        <aside className="xl:sticky xl:top-6">
          <div className="paper-card overflow-hidden rounded-[28px]">
            <button onClick={() => setTutorOpen((value) => !value)} className="flex min-h-16 w-full items-center gap-3 px-4 text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ffe5dc] text-[#ef765d]"><Bot className="h-5 w-5" /></span>
              <div className="flex-1"><p className="text-sm font-black">Hỏi AI</p><p className="text-xs font-bold text-[#879088]">Gợi ý theo bài</p></div>
              <Sparkles className="h-4 w-4 text-[#d89a2b]" />
            </button>
            <div className={`${tutorOpen ? "block" : "hidden xl:block"} border-t border-[#ded8cc]`}>
              <div className="max-h-[360px] space-y-3 overflow-y-auto p-4">
                {!messages.length && <div className="rounded-2xl bg-[#f4efe5] p-4 text-sm font-bold leading-6 text-[#65746c]">Hỏi một từ hoặc điểm ngữ pháp bạn chưa rõ.</div>}
                {messages.map((message, messageIndex) => <div key={messageIndex} className={`rounded-2xl px-3.5 py-3 text-sm font-bold leading-6 ${message.role === "user" ? "ml-8 bg-[#176b55] text-white" : "mr-3 bg-[#f4efe5] text-[#45584f]"}`}>{message.content.length > 700 ? `${message.content.slice(0,700)}…` : message.content}</div>)}
                {asking && <LoaderCircle className="h-5 w-5 animate-spin text-[#176b55]" />}
              </div>
              <div className="flex gap-2 border-t border-[#ded8cc] p-3">
                <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askTutor(); }} className="min-h-11 min-w-0 flex-1 rounded-xl bg-[#f4efe5] px-3 text-sm font-bold outline-none" placeholder="Hỏi nhanh…" />
                <button onClick={askTutor} disabled={!question.trim() || asking} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ef765d] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {learningContext && <div className="mt-4 hidden rounded-[24px] bg-[#18332d] p-5 text-white xl:block"><p className="text-xs font-black uppercase tracking-[.14em] text-[#f7d779]">Trọng tâm</p><div className="mt-3 space-y-2">{learningContext.grammar.slice(0,2).map((item) => <p key={item.id} className="flex items-start gap-2 text-sm font-bold"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f7d779]" />{item.title}</p>)}</div></div>}
        </aside>
      </div>
    </div>
  );
}
