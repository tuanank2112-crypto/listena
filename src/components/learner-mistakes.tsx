"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Quote } from "lucide-react";
import { segmentHighlights } from "@/core/learning/text-highlight";

interface MistakeExample {
  learnerText: string;
  highlights: string[];
  explanationVi: string;
  sessionGoal: string;
  occurredAt: string;
}

interface MistakeFamily {
  key: string;
  labelVi: string;
  hintVi: string;
  count: number;
  examples: MistakeExample[];
}

/**
 * Plan21 SPEC-P214 — "Lỗi hay lặp".
 *
 * The Coach already explains every mistake, once, in the turn where it
 * happened. This gives that explanation a second life: grouped by mistake
 * family, named in Vietnamese, next to the sentence the learner actually wrote.
 *
 * Deliberately silent. Plan14 forbids speaking a learner's own error aloud, and
 * this whole panel is made of learner errors, so it carries no listen button.
 *
 * The quote is the sentence the learner actually sent. `detectedError.actual`
 * only decides what to underline inside it, and only when it really occurs
 * there: production has produced a description in that field, and showing a
 * learner words they never wrote is worse than showing no underline at all.
 */
export function LearnerMistakes() {
  const [families, setFamilies] = useState<MistakeFamily[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learner/mistakes")
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        setFamilies(body.families);
        setOpenKey(body.families[0]?.key ?? null);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // A panel that adds nothing says nothing: no error box, no empty frame on a
  // page that is already useful without it.
  if (failed || (families && families.length === 0)) return null;

  if (!families) {
    return <div className="mt-5 h-28 animate-pulse rounded-[30px] bg-[#eee7da]" aria-hidden />;
  }

  return (
    <section className="mt-5" aria-labelledby="mistakes-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="mistakes-heading" className="text-lg font-black">Lỗi hay lặp</h2>
        <span className="shrink-0 text-xs font-black text-[#758078]">Coach đã sửa cho bạn</span>
      </div>
      <ul className="space-y-2">
        {families.map((family) => {
          const open = openKey === family.key;
          return (
            <li key={family.key} className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fffdf8]">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : family.key)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffe1de] text-sm font-black text-[#d6534d]">
                  {family.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{family.labelVi}</span>
                  <span className="block truncate text-xs font-bold text-[#758078]">{family.hintVi}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[#9aa19d] transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && family.examples.length > 0 && (
                <div className="border-t border-[#ded8cc] px-4 py-3">
                  <ul className="space-y-3">
                    {family.examples.map((example, index) => (
                      <li key={`${family.key}-${index}`} className="min-w-0">
                        {example.learnerText && (
                          <p className="flex items-start gap-2 text-sm font-bold text-[#4a5750]">
                            <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a0443f]" aria-hidden />
                            <span className="min-w-0 break-words">
                              {segmentHighlights(example.learnerText, example.highlights).map((segment, part) => (
                                segment.marked
                                  ? <mark key={part} className="rounded bg-[#ffd9d4] px-0.5 font-black text-[#a0443f]">{segment.text}</mark>
                                  : <span key={part}>{segment.text}</span>
                              ))}
                            </span>
                          </p>
                        )}
                        <p className={`break-words text-xs font-bold leading-5 text-[#4a5750] ${example.learnerText ? "mt-1" : ""}`}>{example.explanationVi}</p>
                        <p className="mt-1 truncate text-[11px] font-bold text-[#9aa19d]">trong: {example.sessionGoal}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {open && family.examples.length === 0 && (
                <p className="border-t border-[#ded8cc] px-4 py-3 text-xs font-bold text-[#758078]">
                  Lỗi này được đếm từ các phiên trước, chưa còn câu ví dụ nào được lưu lại.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
