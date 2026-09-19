"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Dice5, Gamepad2, Sparkles } from "lucide-react";
import { SpeakButton } from "@/features/voice/speak-button";

interface ReviewWord {
  vocabularyItemId: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number;
  standing: "weak" | "shaky" | "learned";
  dueNow: boolean;
}

interface VocabularyReview {
  weakWords: ReviewWord[];
  randomReview: ReviewWord[];
  seenCount: number;
  learnedCount: number;
  weakCount: number;
}

/**
 * Plan20 SPEC-P202. Shows what the server already knows about the learner's
 * vocabulary: the words they keep missing, and a random pool to re-check.
 *
 * Revealing a meaning here is not an answer and is not reported anywhere. The
 * only things that move mastery remain the graded surfaces — Ôn từ, Trò chơi
 * and Mission — which is why both sections end in a link to one of them
 * rather than a score.
 */
export function VocabularyReviewClient() {
  const [data, setData] = useState<VocabularyReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const response = await fetch("/api/learner/vocabulary-review");
        if (!response.ok) throw new Error("failed");
        const body = await response.json();
        if (!cancelled) {
          setData(body);
          setRevealed(new Set());
        }
      } catch {
        if (!cancelled) setError("Chưa tải được danh sách từ. Bạn thử lại sau ít phút nhé.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const toggleReveal = useCallback((id: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div role="alert" className="paper-card rounded-[30px] p-7 text-center">
          <p className="font-black">{error}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 min-h-11 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white">Thử lại</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-3xl px-4 py-10"><div className="h-40 animate-pulse rounded-[30px] bg-[#eee7da]" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Word check</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-.05em] sm:text-4xl">Từ yếu</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-[#758078]">Máy chủ ghi lại từng lần bạn trả lời đúng hay sai. Đây là những từ bạn hay nhầm nhất, và một nhóm từ ngẫu nhiên để tự kiểm tra lại.</p>
      </header>

      <div className="mt-7 grid grid-cols-3 gap-3">
        {[
          { value: data.weakCount, label: "hay sai", icon: AlertTriangle, color: "#d6534d" },
          { value: data.learnedCount, label: "đã thuộc", icon: Check, color: "#176b55" },
          { value: data.seenCount, label: "đã gặp", icon: Sparkles, color: "#d89a2b" },
        ].map((stat) => (
          <div key={stat.label} className="paper-card rounded-3xl p-4 sm:p-5">
            <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
            <p className="mt-4 text-3xl font-black">{stat.value}</p>
            <p className="text-[11px] font-black uppercase tracking-[.12em] text-[#879088]">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6" aria-labelledby="weak-words-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="weak-words-heading" className="text-lg font-black">Từ hay sai</h2>
          <Link href="/learner/flashcards" className="shrink-0 text-xs font-black text-[#176b55]">Ôn thẻ đến hạn</Link>
        </div>
        {data.weakWords.length === 0 ? (
          <div className="paper-card rounded-[30px] p-7 text-center">
            <p className="font-black">Chưa có từ nào bạn trả lời sai.</p>
            <p className="mt-2 text-sm font-bold text-[#758078]">Cứ học tiếp — khi có từ bị nhầm, nó sẽ xuất hiện ở đây kèm số lần.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.weakWords.map((word) => (
              <li key={word.vocabularyItemId} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffe1de] text-sm font-black text-[#d6534d]">{word.incorrectCount}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{word.displayText}</p>
                  <p className="truncate text-xs font-bold text-[#758078]">
                    {word.meaningVi}
                    {word.dueNow && <span className="ml-2 text-[#d89a2b]">đến hạn ôn</span>}
                  </p>
                </div>
                <SpeakButton text={word.displayText} label={`Nghe ${word.displayText}`} compact className="shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7" aria-labelledby="random-review-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="random-review-heading" className="text-lg font-black">Ôn tập ngẫu nhiên</h2>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#18332d] px-3 text-xs font-black text-white"
          >
            <Dice5 className="h-4 w-4" /> Nhóm từ khác
          </button>
        </div>
        <p className="mb-3 text-xs font-bold leading-5 text-[#758078]">Máy chủ bốc nhóm từ này từ mọi bài bạn đã gặp, nghiêng về từ bạn chưa chắc. Nhấn để xem nghĩa — đây là tự kiểm tra, không tính điểm.</p>
        {data.randomReview.length === 0 ? (
          <div className="paper-card rounded-[30px] p-7 text-center">
            <p className="font-black">Chưa có từ nào để ôn ngẫu nhiên.</p>
            <p className="mt-2 text-sm font-bold text-[#758078]">Học một bài hoặc chơi một lượt là kho từ của bạn có dữ liệu.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.randomReview.map((word) => {
              const open = revealed.has(word.vocabularyItemId);
              return (
                <li key={word.vocabularyItemId} className="paper-card rounded-3xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">{word.displayText}</p>
                      {word.ipa && <p className="truncate text-xs font-bold text-[#879088]">{word.ipa}</p>}
                    </div>
                    <SpeakButton text={word.displayText} label={`Nghe ${word.displayText}`} compact className="shrink-0" />
                  </div>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleReveal(word.vocabularyItemId)}
                    className="mt-3 min-h-11 w-full rounded-2xl border-2 border-[#ded8cc] bg-white px-3 text-sm font-black"
                  >
                    {open ? word.meaningVi : "Xem nghĩa"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/learner/games" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"><Gamepad2 className="h-4 w-4" /> Chơi nhanh để tính điểm</Link>
          <Link href="/learner/dashboard" className="inline-flex min-h-11 items-center rounded-2xl border-2 border-[#ded8cc] px-4 text-sm font-black">Học cùng AI</Link>
        </div>
      </section>
    </div>
  );
}
