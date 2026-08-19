"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, RotateCw, Sparkles, Volume2, X } from "lucide-react";
import { cleanVocabularyMeaning } from "@/core/text/vocabulary";

interface Flashcard {
  id: string;
  front: string;
  vocabularyItem: { id: string; displayText: string; meaningVi: string; ipa: string | null };
}

export function FlashcardsClient({ flashcards, dueCount, totalCount }: { flashcards: Flashcard[]; dueCount: number; totalCount: number }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const card = flashcards[index];

  function speak() {
    if (!card) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(card.front);
    utterance.lang = "en-GB";
    window.speechSynthesis.speak(utterance);
  }

  async function rate(rating: "AGAIN" | "HARD" | "GOOD" | "EASY") {
    if (!card) return;
    setSaving(true);
    try {
      const response = await fetch("/api/flashcard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flashcardId: card.id, rating, responseTimeMs: 1000 }) });
      if (!response.ok) throw new Error("review failed");
      setFlipped(false);
      setIndex((value) => (value + 1) % flashcards.length);
    } finally { setSaving(false); }
  }

  if (!flashcards.length) {
    return <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-4"><div className="paper-card w-full rounded-[30px] p-8 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dff2e8]"><Check className="h-8 w-8 text-[#176b55]" /></div><h1 className="mt-5 text-2xl font-black">Xong hôm nay!</h1><p className="mt-2 text-sm font-bold text-[#7b857f]">Học thêm để mở thẻ mới.</p></div></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Quick review</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em]">Ôn từ</h1></div><p className="text-xs font-black text-[#7b857f]">{dueCount}/{totalCount}</p></header>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#ded8cc]"><motion.div className="h-full rounded-full bg-[#176b55]" animate={{ width: `${((index + 1) / flashcards.length) * 100}%` }} /></div>

      <motion.button key={`${card.id}-${flipped}`} initial={{ opacity: 0, rotateY: -6 }} animate={{ opacity: 1, rotateY: 0 }} onClick={() => setFlipped((value) => !value)} className="paper-card relative flex min-h-[390px] w-full flex-col items-center justify-center rounded-[32px] p-8 text-center">
        <span className="absolute right-5 top-5 flex items-center gap-1 text-[11px] font-black text-[#9aa19d]"><RotateCw className="h-3.5 w-3.5" /> Lật thẻ</span>
        {!flipped ? <><p className="text-4xl font-black tracking-[-.05em] sm:text-5xl">{card.front}</p><p className="mt-3 text-sm font-bold text-[#879088]">{card.vocabularyItem.ipa}</p><button type="button" onClick={(event) => { event.stopPropagation(); speak(); }} className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-[#f7d779]"><Volume2 className="h-5 w-5" /></button></> : <><p className="text-xs font-black uppercase tracking-[.18em] text-[#ef765d]">Nghĩa</p><p className="mt-4 text-3xl font-black leading-tight">{cleanVocabularyMeaning(card.vocabularyItem.meaningVi)}</p><p className="mt-5 text-sm font-bold text-[#879088]">{card.front}</p></>}
      </motion.button>

      {flipped && <div className="mt-4 grid grid-cols-4 gap-2">{[
        ["AGAIN", "Lại", "#d6534d", X], ["HARD", "Khó", "#d89a2b", Sparkles], ["GOOD", "Tốt", "#176b55", Check], ["EASY", "Dễ", "#5c6fb3", Check],
      ].map(([rating, label, color, Icon]) => <button key={rating as string} onClick={() => rate(rating as "AGAIN"|"HARD"|"GOOD"|"EASY")} disabled={saving} className="min-h-16 rounded-2xl text-xs font-black text-white disabled:opacity-40" style={{ backgroundColor: color as string }}><Icon className="mx-auto mb-1 h-4 w-4" />{label as string}</button>)}</div>}
    </div>
  );
}
