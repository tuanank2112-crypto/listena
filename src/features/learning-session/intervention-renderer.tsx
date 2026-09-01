"use client";

import { useMemo, useState } from "react";
import { Check, Headphones, RotateCcw, Send, Volume2 } from "lucide-react";
import type { PublicIntervention } from "./types";

interface InterventionRendererProps {
  intervention: PublicIntervention;
  disabled: boolean;
  onReplay: (text: string) => void;
  onSubmit: (content: string) => void;
}

export function InterventionRenderer({ intervention, disabled, onReplay, onSubmit }: InterventionRendererProps) {
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [orderedIndexes, setOrderedIndexes] = useState<number[]>([]);
  const tokens = useMemo(() => intervention.spec.tokens ?? [], [intervention.spec.tokens]);
  const availableTokens = useMemo(
    () => tokens.map((token, index) => ({ token, index })).filter((item) => !orderedIndexes.includes(item.index)),
    [orderedIndexes, tokens],
  );
  const orderedTokens = orderedIndexes.map((index) => tokens[index]);
  const response = intervention.type === "CHOICE" ? selectedOption ?? "" : intervention.type === "REORDER" ? orderedTokens.join(" ") : answer.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (response) onSubmit(response);
  }

  return (
    <form onSubmit={submit} className="rounded-[26px] border-2 border-[#ef765d]/30 bg-[#fff7ef] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[#b95843]">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ffe0d5]"><RotateCcw className="h-4 w-4" /></span>
        <p className="text-[11px] font-black uppercase tracking-[.16em]">Comeback challenge</p>
      </div>
      <h3 className="mt-3 text-lg font-black leading-snug tracking-[-.025em]">{intervention.prompt}</h3>

      {intervention.spec.audioText && (
        <button
          type="button"
          onClick={() => onReplay(intervention.spec.audioText ?? "")}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#18332d] px-4 text-sm font-black text-white"
        >
          <Volume2 className="h-4 w-4 text-[#f7d779]" /> Nghe lại
        </button>
      )}

      {intervention.type === "CHOICE" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(intervention.spec.options ?? []).map((option, index) => {
            const selected = option === selectedOption;
            return (
              <button
                key={`${option}-${index}`}
                type="button"
                onClick={() => setSelectedOption(option)}
                className={`min-h-13 rounded-2xl border-2 px-4 text-left text-sm font-black transition ${selected ? "border-[#176b55] bg-[#dff2e8] text-[#176b55]" : "border-[#ded8cc] bg-white hover:border-[#b8cfc4]"}`}
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-black/5 text-xs">{String.fromCharCode(65 + index)}</span>
                {option}
              </button>
            );
          })}
        </div>
      )}

      {intervention.type === "REORDER" && (
        <div className="mt-4 space-y-3">
          <div className="min-h-20 rounded-2xl border-2 border-dashed border-[#cfc5b7] bg-white/70 p-3">
            {orderedIndexes.length === 0 ? (
              <p className="px-1 py-3 text-sm font-bold text-[#8a918d]">Chạm các từ theo đúng thứ tự.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {orderedIndexes.map((tokenIndex, position) => (
                  <button
                    key={`${tokenIndex}-${position}`}
                    type="button"
                    onClick={() => setOrderedIndexes((items) => items.filter((_, itemPosition) => itemPosition !== position))}
                    className="min-h-10 rounded-xl bg-[#176b55] px-3 text-sm font-black text-white"
                    aria-label={`Bỏ từ ${tokens[tokenIndex]}`}
                  >
                    {tokens[tokenIndex]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTokens.map((item) => (
              <button
                key={item.index}
                type="button"
                onClick={() => setOrderedIndexes((items) => [...items, item.index])}
                className="min-h-10 rounded-xl border border-[#ded8cc] bg-white px-3 text-sm font-black hover:border-[#176b55]"
              >
                {item.token}
              </button>
            ))}
          </div>
        </div>
      )}

      {(intervention.type === "RETRY" || intervention.type === "USE_IN_SENTENCE" || intervention.type === "FILL_BLANK") && (
        <div className="relative mt-4">
          {intervention.type === "RETRY" && <Headphones className="absolute left-4 top-4 h-5 w-5 text-[#176b55]" />}
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={intervention.type === "USE_IN_SENTENCE" ? 3 : 2}
            className={`w-full resize-none rounded-2xl border-2 border-[#ded8cc] bg-white py-3 pr-4 text-base font-bold outline-none focus:border-[#176b55] ${intervention.type === "RETRY" ? "pl-12" : "pl-4"}`}
            placeholder={intervention.spec.placeholder ?? (intervention.type === "USE_IN_SENTENCE" ? "Write your own sentence..." : "Try again...")}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || !response}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ef765d] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(239,118,93,.2)] disabled:opacity-40 sm:w-auto"
      >
        {disabled ? "AI đang xem..." : "Gửi comeback"} {disabled ? null : intervention.type === "CHOICE" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      </button>
    </form>
  );
}
