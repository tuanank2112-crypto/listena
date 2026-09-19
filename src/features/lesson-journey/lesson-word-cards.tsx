"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cleanVocabularyMeaning } from "@/core/text/vocabulary";
import { SpeakButton } from "@/features/voice/speak-button";

export interface JourneyWord {
  id: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  exampleSentence: string | null;
}

/**
 * Plan22 SPEC-P224 — step one: read the lesson's words.
 *
 * Nothing here is graded and nothing is submitted. It exists because the rest
 * of the journey asks the learner to recall words they may never have met, and
 * because "I have read these" is the one step no other evidence can prove — so
 * the learner has to reach the end before it counts.
 */
export function LessonWordCards({ words, onDone, onCancel }: {
  words: JourneyWord[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const word = words[index];
  const isLast = index === words.length - 1;

  if (!word) return null;

  return (
    <section className="paper-card mt-6 rounded-[30px] p-5 sm:p-7" aria-labelledby="word-cards-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="word-cards-heading" className="text-lg font-black">Học từ</h2>
        <span className="shrink-0 text-xs font-black text-[#758078]">{index + 1}/{words.length}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee7da]">
        <div
          className="h-full rounded-full bg-[#d89a2b] transition-all"
          style={{ width: `${((index + 1) / words.length) * 100}%` }}
        />
      </div>

      <div className="mt-6 min-w-0 text-center">
        <p className="break-words text-3xl font-black tracking-[-.04em] sm:text-4xl">{word.displayText}</p>
        {word.ipa && <p className="mt-2 text-sm font-bold text-[#879088]">{word.ipa}</p>}
        <div className="mt-4 flex justify-center">
          <SpeakButton text={word.displayText} label={`Nghe ${word.displayText}`} />
        </div>
        <p className="mt-5 break-words text-lg font-black text-[#176b55]">
          {cleanVocabularyMeaning(word.meaningVi)}
        </p>
        {word.exampleSentence && (
          <p className="mx-auto mt-4 max-w-md break-words text-sm font-bold leading-6 text-[#758078]">
            {word.exampleSentence}
          </p>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (index === 0 ? onCancel() : setIndex(index - 1))}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border-2 border-[#ded8cc] px-4 text-sm font-black"
        >
          <ArrowLeft className="h-4 w-4" /> {index === 0 ? "Đóng" : "Từ trước"}
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white"
          >
            <Check className="h-4 w-4" /> Đã đọc hết
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#18332d] px-4 text-sm font-black text-white"
          >
            Từ tiếp theo <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}
