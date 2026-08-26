"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Clock3, Gamepad2, Headphones, Heart, RotateCcw, Sparkles, Trophy, Volume2, X } from "lucide-react";
import { cleanVocabularyMeaning } from "@/core/text/vocabulary";
import { speak } from "@/core/tts/speech";
import { useSpeechState } from "@/core/tts/use-speech";

type Word = { id: string; displayText: string; meaningVi: string; ipa: string | null; exampleSentence: string | null };
type Unit = { id: string; name: string; title: string; words: Word[] };
type Mode = "quiz" | "match" | "spell";

type QuizRound = { word: Word; options: string[] };

const modeInfo = {
  quiz: { title: "Chọn nhanh", subtitle: "Chạm đúng nghĩa", icon: Sparkles, color: "#ef765d" },
  match: { title: "Ghép cặp", subtitle: "Nối từ và nghĩa", icon: Gamepad2, color: "#176b55" },
  spell: { title: "Nghe & viết", subtitle: "Nghe rồi gõ từ", icon: Headphones, color: "#d89a2b" },
};

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function GamesClient({ units }: { units: Unit[] }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [mode, setMode] = useState<Mode | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(60);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [answer, setAnswer] = useState("");
  const [selectedCards, setSelectedCards] = useState<Array<{ id: string; kind: "word" | "meaning" }>>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [sessionKey, setSessionKey] = useState(0);
  const speechState = useSpeechState();

  const unit = units.find((item) => item.id === unitId) ?? units[0];
  const words = unit?.words ?? [];
  const sessionWords = useMemo(() => shuffle(words).slice(0, 10), [unitId, mode, words, sessionKey]);
  const quizRounds = useMemo<QuizRound[]>(
    () => sessionWords.map((word) => ({
      word,
      options: shuffle([cleanVocabularyMeaning(word.meaningVi), ...shuffle(words.filter((item) => item.id !== word.id)).slice(0, 3).map((item) => cleanVocabularyMeaning(item.meaningVi))]),
    })),
    [sessionWords, words]
  );
  const matchWords = useMemo(() => sessionWords.slice(0, 6), [sessionWords]);
  const matchCards = useMemo(
    () => shuffle(matchWords.flatMap((word) => [
      { id: word.id, kind: "word" as const, label: word.displayText },
      { id: word.id, kind: "meaning" as const, label: cleanVocabularyMeaning(word.meaningVi) },
    ])),
    [matchWords]
  );
  const totalRounds = mode === "match" ? matchWords.length : sessionWords.length;
  const modeComplete = mode === "match"
    ? matchedIds.length === matchWords.length && matchWords.length > 0
    : round >= totalRounds;
  const finished = modeComplete || lives <= 0 || timeLeft <= 0;

  useEffect(() => {
    if (!mode || finished) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [mode, finished]);

  function reset(nextMode: Mode | null = mode) {
    setMode(nextMode);
    setSessionKey((value) => value + 1);
    setRound(0);
    setScore(0);
    setLives(3);
    setTimeLeft(nextMode === "match" ? 90 : 60);
    setFeedback(null);
    setAnswer("");
    setSelectedCards([]);
    setMatchedIds([]);
  }

  function resolve(correct: boolean) {
    setFeedback(correct ? "correct" : "wrong");
    if (correct) setScore((value) => value + Math.max(10, 20 - round));
    else setLives((value) => Math.max(0, value - 1));
    window.setTimeout(() => {
      setFeedback(null);
      setAnswer("");
      setRound((value) => value + 1);
    }, 650);
  }

  function chooseCard(card: { id: string; kind: "word" | "meaning" }) {
    if (matchedIds.includes(card.id)) return;
    const next = [...selectedCards, card].slice(-2);
    setSelectedCards(next);
    if (next.length === 2 && next[0].kind !== next[1].kind) {
      if (next[0].id === next[1].id) {
        setMatchedIds((ids) => [...ids, card.id]);
        setScore((value) => value + 25);
      } else {
        setLives((value) => Math.max(0, value - 1));
      }
      window.setTimeout(() => setSelectedCards([]), 450);
    }
  }

  if (!units.length) {
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><p className="text-lg font-black">Chưa có từ để chơi.</p></div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {!mode ? (
        <>
          <header className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Play lab</p>
              <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Chơi 5 phút</h1>
            </div>
            <div className="hidden rounded-2xl bg-[#fffdf8] px-4 py-3 text-right shadow-sm sm:block">
              <p className="text-2xl font-black text-[#176b55]">{words.length}</p>
              <p className="text-[11px] font-bold text-[#77817b]">từ trong unit</p>
            </div>
          </header>

          <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
            {units.map((item) => (
              <button key={item.id} onClick={() => setUnitId(item.id)} className={`min-h-11 shrink-0 rounded-2xl px-4 text-sm font-black ${unitId === item.id ? "bg-[#18332d] text-white" : "border border-[#ded8cc] bg-[#fffdf8] text-[#68766f]"}`}>
                {item.name} · {item.title}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(modeInfo) as Mode[]).map((key, index) => {
              const item = modeInfo[key];
              return (
                <motion.button
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * .07 }}
                  onClick={() => reset(key)}
                  className="paper-card group min-h-[210px] rounded-[28px] p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(51,58,47,.11)]"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: item.color }}><item.icon className="h-6 w-6" /></span>
                  <h2 className="mt-8 text-2xl font-black tracking-[-.04em]">{item.title}</h2>
                  <p className="mt-1 text-sm font-bold text-[#7b857f]">{item.subtitle}</p>
                  <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#eee7da]"><div className="h-full w-2/3 rounded-full" style={{ backgroundColor: item.color }} /></div>
                </motion.button>
              );
            })}
          </div>
        </>
      ) : finished ? (
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <motion.div initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="paper-card w-full rounded-[32px] p-7 text-center sm:p-9">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f7d779] text-[#18332d]"><Trophy className="h-8 w-8" /></div>
            <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-[#ef765d]">Hoàn thành</p>
            <h1 className="mt-2 text-5xl font-black tracking-[-.06em]">{score}</h1>
            <p className="mt-1 text-sm font-bold text-[#758078]">điểm · {lives} tim còn lại</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button onClick={() => reset(mode)} className="min-h-12 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"><RotateCcw className="mr-2 inline h-4 w-4" /> Chơi lại</button>
              <button onClick={() => reset(null)} className="min-h-12 rounded-2xl bg-[#eee7da] px-4 text-sm font-black">Đổi game</button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">
          <header className="mb-5 flex items-center gap-3">
            <button onClick={() => reset(null)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fffdf8] shadow-sm"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs font-black text-[#758078]"><span>{modeInfo[mode].title}</span><span>{mode === "match" ? matchedIds.length : Math.min(round + 1, totalRounds)}/{totalRounds}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ded8cc]"><motion.div className="h-full rounded-full bg-[#176b55]" animate={{ width: `${((mode === "match" ? matchedIds.length : round) / Math.max(totalRounds,1)) * 100}%` }} /></div>
            </div>
          </header>

          <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#18332d] px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-black"><Clock3 className="h-4 w-4 text-[#f7d779]" /> {timeLeft}s</span>
            <span className="text-sm font-black">{score} điểm</span>
            <span className="flex gap-1">{[0,1,2].map((heart) => <Heart key={heart} className={`h-4 w-4 ${heart < lives ? "fill-[#ef765d] text-[#ef765d]" : "text-white/25"}`} />)}</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.section key={`${mode}-${round}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="paper-card min-h-[430px] rounded-[30px] p-5 sm:p-8">
              {mode === "quiz" && quizRounds[round] && (
                <div>
                  <p className="text-center text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Chọn nghĩa đúng</p>
                  <h2 className="mt-6 text-center text-4xl font-black tracking-[-.05em] sm:text-5xl">{quizRounds[round].word.displayText}</h2>
                  <p className="mt-2 text-center text-sm font-bold text-[#869089]">{quizRounds[round].word.ipa}</p>
                  <div className="mt-9 grid gap-3 sm:grid-cols-2">
                    {quizRounds[round].options.map((option) => (
                      <button key={option} disabled={Boolean(feedback)} onClick={() => resolve(option === cleanVocabularyMeaning(quizRounds[round].word.meaningVi))} className="min-h-16 rounded-2xl border-2 border-[#ded8cc] bg-white px-4 text-left text-sm font-black transition hover:border-[#176b55] hover:bg-[#dff2e8]">{option}</button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "match" && (
                <div>
                  <p className="text-center text-xs font-black uppercase tracking-[.18em] text-[#176b55]">Chọn hai thẻ cùng nghĩa</p>
                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {matchCards.map((card, index) => {
                      const selected = selectedCards.some((item) => item.id === card.id && item.kind === card.kind);
                      const matched = matchedIds.includes(card.id);
                      return (
                        <button key={`${card.id}-${card.kind}-${index}`} onClick={() => chooseCard(card)} disabled={matched} className={`min-h-24 rounded-2xl border-2 p-3 text-sm font-black transition ${matched ? "border-[#b6dfca] bg-[#dff2e8] text-[#176b55] opacity-60" : selected ? "border-[#ef765d] bg-[#ffe5dc]" : "border-[#ded8cc] bg-white hover:border-[#176b55]"}`}>{matched ? <Check className="mx-auto h-5 w-5" /> : card.label}</button>
                      );
                    })}
                  </div>
                </div>
              )}

              {mode === "spell" && sessionWords[round] && (
                <div className="mx-auto max-w-lg text-center">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-[#d89a2b]">Nghe và viết</p>
                  <button onClick={() => void speak({ text: sessionWords[round].displayText, lang: "en", speed: 0.88 })} className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-[#f7d779] shadow-[0_12px_30px_rgba(216,154,43,.25)]"><Volume2 className="h-9 w-9" /></button>
                  {speechState.phase === "downloading-model" && <p className="mt-3 text-xs font-bold text-[#758078]">Đang tải giọng đọc {speechState.downloadProgress ?? 0}%</p>}
                  <p className="mt-5 text-sm font-bold text-[#758078]">{cleanVocabularyMeaning(sessionWords[round].meaningVi)}</p>
                  <input value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && answer.trim()) resolve(answer.trim().toLowerCase() === sessionWords[round].displayText.toLowerCase()); }} autoFocus className="mt-8 min-h-16 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-5 text-center text-xl font-black outline-none focus:border-[#176b55]" placeholder="Gõ từ bạn nghe" />
                  <button onClick={() => resolve(answer.trim().toLowerCase() === sessionWords[round].displayText.toLowerCase())} disabled={!answer.trim() || Boolean(feedback)} className="mt-3 min-h-12 w-full rounded-2xl bg-[#176b55] font-black text-white disabled:opacity-40">Kiểm tra</button>
                </div>
              )}

              <AnimatePresence>{feedback && <motion.div initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-white shadow-xl lg:bottom-8 ${feedback === "correct" ? "bg-[#176b55]" : "bg-[#d6534d]"}`}>{feedback === "correct" ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}{feedback === "correct" ? "Tuyệt!" : "Thử câu tiếp nhé"}</motion.div>}</AnimatePresence>
            </motion.section>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
