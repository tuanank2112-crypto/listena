"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ear,
  Keyboard,
  LoaderCircle,
  Puzzle,
  Shuffle,
  Star,
  Timer,
  Volume2,
  X,
} from "lucide-react";
import { speak } from "@/core/tts/speech";
import {
  canvasReducer,
  composeAnswer,
  createInitialCanvasState,
  isModeUnlocked,
  selectHintCost,
  slotCapacity,
  wordsOf,
} from "./canvas-reducer";
import {
  AssistRequestError,
  type AnswerCanvasProps,
  type AssistMode,
  type CanvasMode,
  type Confidence,
} from "./types";

const MODE_LABEL: Record<CanvasMode, string> = {
  FREE: "Gõ tự do",
  SKELETON: "Viết dần",
  TILES: "Ghép mảnh",
};

const UNLOCK_LABEL: Record<AssistMode, string> = {
  SKELETON: "Mở khung",
  TILES: "Lấy mảnh",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: "Đoán thôi",
  2: "Khá chắc",
  3: "Rất chắc",
};

const PILL = "flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition";
const CHIP = "flex min-h-11 items-center gap-1 rounded-xl bg-[#dff2e8] pl-3 pr-1 text-sm font-black text-[#18332d]";
const TILE = "min-h-11 min-w-11 rounded-xl border-2 px-3 text-sm font-black transition";

/**
 * Answer Canvas (SPEC-P133): FREE chips, SKELETON per-word boxes, TILES
 * tap-to-arrange, CONFIDENCE stars and PREDICT-before-listening. Every mode
 * submits one string; the server still holds the answer and grades it.
 */
export function AnswerCanvas({
  exerciseKey,
  hasAudio,
  allowAssist,
  fetchAssist,
  onSubmit,
  submitting = false,
  onPredictingChange,
  secondaryAction,
}: AnswerCanvasProps) {
  const [state, dispatch] = useReducer(canvasReducer, undefined, createInitialCanvasState);
  // Uncommitted tail of the FREE input; committed words live in the reducer.
  const [draft, setDraft] = useState("");
  // Wall clock sampled by the PREDICT countdown interval (event-driven only).
  const [now, setNow] = useState(() => Date.now());
  // Prop-change reset during render (React "adjusting state when a prop changes").
  const [seenKey, setSeenKey] = useState(exerciseKey);
  if (seenKey !== exerciseKey) {
    setSeenKey(exerciseKey);
    setDraft("");
    dispatch({ type: "RESET" });
  }
  const slotRefs = useRef<Array<HTMLInputElement | null>>([]);
  const freeInputRef = useRef<HTMLInputElement | null>(null);
  const exerciseRef = useRef(exerciseKey);

  useEffect(() => {
    exerciseRef.current = exerciseKey;
  }, [exerciseKey]);

  useEffect(() => {
    if (state.mode !== "SKELETON") return;
    slotRefs.current[state.activeSlot]?.focus();
  }, [state.mode, state.activeSlot]);

  const predictUntil = state.predictUntil;
  useEffect(() => {
    if (!predictUntil) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= predictUntil) {
        dispatch({ type: "PREDICT_END" });
        onPredictingChange?.(false);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [predictUntil, onPredictingChange]);

  const predictRemaining = predictUntil ? Math.max(0, Math.ceil((predictUntil - now) / 1000)) : 0;

  function startPredict() {
    if (state.predictUsed) return;
    const startedAt = Date.now();
    setNow(startedAt);
    dispatch({ type: "PREDICT_START", now: startedAt });
    onPredictingChange?.(true);
  }

  const freeAnswer = [composeAnswer({ ...state, mode: "FREE" }), draft.trim()].filter(Boolean).join(" ");
  const answer = state.mode === "FREE" ? freeAnswer : composeAnswer(state);
  const hintCost = selectHintCost(state);
  const predicting = state.predictUntil !== null;

  const flushDraft = useCallback(() => {
    const tail = draft.trim();
    if (tail) dispatch({ type: "ADD_CHIP", word: tail });
    setDraft("");
  }, [draft]);

  function handleFreeChange(value: string) {
    if (!/\s/.test(value)) return setDraft(value);
    const parts = value.split(/\s+/);
    const tail = /\s$/.test(value) ? "" : (parts.pop() ?? "");
    for (const word of parts) if (word) dispatch({ type: "ADD_CHIP", word });
    setDraft(tail);
  }

  function handleFreeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !draft) {
      const words = wordsOf(state.text);
      if (words.length) {
        event.preventDefault();
        dispatch({ type: "REMOVE_CHIP", index: words.length - 1 });
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      flushDraft();
    }
  }

  async function requestAssist(mode: AssistMode) {
    if (state.loadingAssist || state.assistBlocked) return;
    flushDraft();
    if (isModeUnlocked(state, mode)) return dispatch({ type: "SET_MODE", mode });
    const key = exerciseRef.current;
    dispatch({ type: "ASSIST_START", mode });
    try {
      const payload = await fetchAssist(mode);
      if (exerciseRef.current !== key) return;
      dispatch({ type: "ASSIST_SUCCESS", payload });
    } catch (caught) {
      if (exerciseRef.current !== key) return;
      const blocked = caught instanceof AssistRequestError && caught.code === "ASSIST_LIMIT";
      dispatch({
        type: "ASSIST_FAILURE",
        error: caught instanceof Error ? caught.message : "Không lấy được trợ giúp. Thử lại nhé.",
        blocked,
      });
    }
  }

  function switchMode(mode: CanvasMode) {
    if (mode === "FREE") {
      flushDraft();
      dispatch({ type: "SET_MODE", mode });
      return;
    }
    void requestAssist(mode);
  }

  function handleSubmit() {
    const trimmed = answer.trim();
    if (!trimmed || submitting) return;
    flushDraft();
    void onSubmit({ answer: trimmed, hintCount: hintCost, confidence: state.confidence, assistMode: state.mode });
  }

  const showAssist = allowAssist && !state.assistBlocked;
  const wordCount = wordsOf(answer).length;

  return (
    <div className="mt-6" data-canvas-mode={state.mode}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="answer" className="text-sm font-black">Câu trả lời</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {state.skeleton && (
            <span className="rounded-full bg-[#f4efe5] px-2.5 py-1 text-[11px] font-black text-[#68766f]">{wordCount}/{state.skeleton.length} từ</span>
          )}
          {hintCost > 0 && (
            <span className="rounded-full bg-[#fff1c9] px-2.5 py-1 text-[11px] font-black text-[#795c19]">Trợ giúp: {hintCost}</span>
          )}
          {state.predictUsed && (
            <span className="flex items-center gap-1 rounded-full bg-[#ffe5dc] px-2.5 py-1 text-[11px] font-black text-[#ef765d]"><Ear className="h-3 w-3" /> {predicting ? `Đoán trước · ${predictRemaining}s` : "Đã đoán trước"}</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showAssist && (
          <div role="group" aria-label="Cách điền đáp án" className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => switchMode("FREE")} aria-pressed={state.mode === "FREE"} className={`${PILL} ${state.mode === "FREE" ? "bg-[#18332d] text-white" : "bg-[#f4efe5] text-[#45584f]"}`}><Keyboard className="h-4 w-4" /> {MODE_LABEL.FREE}</button>
            {(["SKELETON", "TILES"] as const).map((mode) => {
              const unlocked = isModeUnlocked(state, mode);
              const loading = state.loadingAssist === mode;
              const Icon = mode === "SKELETON" ? Puzzle : Shuffle;
              return (
                <button key={mode} type="button" onClick={() => switchMode(mode)} disabled={Boolean(state.loadingAssist)} aria-pressed={state.mode === mode} className={`${PILL} ${state.mode === mode ? "bg-[#18332d] text-white" : unlocked ? "bg-[#f4efe5] text-[#45584f]" : "bg-[#fff1c9] text-[#795c19]"} disabled:opacity-60`}>
                  {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  {unlocked ? MODE_LABEL[mode] : UNLOCK_LABEL[mode]}
                  {!unlocked && <span className="rounded-md bg-white/70 px-1 text-[10px]">−{mode === "SKELETON" ? 1 : 2}</span>}
                </button>
              );
            })}
          </div>
        )}
        {hasAudio && !state.predictUsed && (
          <button type="button" onClick={startPredict} className={`${PILL} ml-auto bg-[#ffe5dc] text-[#ef765d]`}><Timer className="h-4 w-4" /> Đoán trước khi nghe</button>
        )}
      </div>

      <AnimatePresence>
        {predicting && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 rounded-2xl bg-[#ffe5dc] px-4 py-3 text-sm font-bold text-[#a33f3a]">Nút nghe ẩn trong {predictRemaining}s. Đoán câu từ ngữ cảnh, rồi nghe và sửa lại.</motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 rounded-2xl border-2 border-[#ded8cc] bg-white p-3 focus-within:border-[#176b55]">
        {state.mode === "FREE" && (
          <div className={`flex gap-2 ${allowAssist ? "overflow-x-auto pb-1" : "flex-wrap"}`} onClick={() => freeInputRef.current?.focus()}>
            <div role="list" aria-label="Các từ đã gõ" className={`flex shrink-0 gap-1.5 ${allowAssist ? "" : "flex-wrap"}`}>
              {wordsOf(state.text).map((word, index) => (
                <span key={`${index}-${word}`} role="listitem" className={CHIP}>
                  {word}
                  <button type="button" aria-label={`Xoá từ ${word}`} onClick={(event) => { event.stopPropagation(); dispatch({ type: "REMOVE_CHIP", index }); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#176b55] hover:bg-[#c7e8d8]"><X className="h-4 w-4" /></button>
                </span>
              ))}
            </div>
            <input
              id="answer"
              ref={freeInputRef}
              value={draft}
              onChange={(event) => handleFreeChange(event.target.value)}
              onKeyDown={handleFreeKeyDown}
              onBlur={flushDraft}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-11 min-w-[8rem] flex-1 bg-transparent px-1 text-sm font-bold outline-none placeholder:text-[#a4aaa6]"
              placeholder={state.text ? "từ tiếp theo…" : "Gõ từng từ, cách ra để tạo viên…"}
            />
          </div>
        )}

        {state.mode === "SKELETON" && state.skeleton && (
          <div>
            <div role="group" aria-label="Khung từ" className="flex flex-wrap gap-2">
              {state.skeleton.map((slot, index) => {
                const capacity = slotCapacity(slot);
                return (
                  <span key={index} className={`flex min-h-12 items-center rounded-xl border-2 px-2 font-mono text-base font-black tracking-[.2em] ${state.activeSlot === index ? "border-[#176b55] bg-[#dff2e8]" : "border-[#ded8cc] bg-[#fffdf8]"}`}>
                    {slot.first && <span className="text-[#176b55]">{slot.first}</span>}
                    {capacity > 0 && (
                      <input
                        ref={(element) => { slotRefs.current[index] = element; }}
                        value={state.slotValues[index] ?? ""}
                        onChange={(event) => dispatch({ type: "FILL_SLOT", index, value: event.target.value })}
                        onFocus={() => dispatch({ type: "FOCUS_SLOT", index })}
                        onKeyDown={(event) => {
                          if (event.key === "Backspace" && !(state.slotValues[index] ?? "") && index > 0) {
                            event.preventDefault();
                            dispatch({ type: "FOCUS_SLOT", index: index - 1 });
                          }
                        }}
                        maxLength={capacity}
                        size={capacity}
                        aria-label={`Từ ${index + 1}, ${slot.length} chữ`}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        style={{ width: `${Math.max(capacity, 1) * 1.15 + 0.6}em` }}
                        className="min-h-11 bg-transparent text-center outline-none"
                        placeholder={"_".repeat(capacity)}
                      />
                    )}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-xs font-bold text-[#879088]">Gõ từng từ, ô tự nhảy khi đủ chữ. Chữ xanh là chữ cái đã lộ.</p>
          </div>
        )}

        {state.mode === "TILES" && state.tiles && (
          <div>
            <div role="group" aria-label="Câu đang xếp" className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl bg-[#f4efe5] p-2">
              {state.arranged.length === 0 && <span className="px-2 text-sm font-bold text-[#a4aaa6]">Chạm mảnh bên dưới để xếp thành câu.</span>}
              {state.arranged.map((tileIndex, position) => (
                <button key={`${position}-${tileIndex}`} type="button" onClick={() => dispatch({ type: "UNPLACE_TILE", position })} aria-label={`Bỏ mảnh ${state.tiles?.[tileIndex]}`} className={`${TILE} border-[#176b55] bg-[#dff2e8] text-[#18332d]`}>{state.tiles?.[tileIndex]}</button>
              ))}
            </div>
            <div role="group" aria-label="Mảnh chữ" className="mt-3 flex flex-wrap gap-2">
              {state.tiles.map((tile, index) =>
                state.arranged.includes(index) ? (
                  <span key={index} aria-hidden className={`${TILE} border-dashed border-[#ded8cc] text-transparent`}>{tile}</span>
                ) : (
                  <button key={index} type="button" onClick={() => dispatch({ type: "PLACE_TILE", index })} className={`${TILE} border-[#ded8cc] bg-[#fffdf8] text-[#18332d] hover:border-[#176b55]`}>{tile}</button>
                ),
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!answer} onClick={() => void speak({ text: answer, lang: "en", quality: "high" })} className={`${PILL} bg-[#18332d] text-white disabled:opacity-40`}><Volume2 className="h-4 w-4" /> Nghe lại câu đang xếp</button>
              <button type="button" disabled={!state.arranged.length} onClick={() => dispatch({ type: "CLEAR_TILES" })} className={`${PILL} bg-[#f4efe5] text-[#45584f] disabled:opacity-40`}>Xếp lại</button>
            </div>
          </div>
        )}
      </div>

      {state.error && <p role="alert" className="mt-2 text-sm font-bold text-[#d6534d]">{state.error}</p>}

      <div role="group" aria-label="Cược tự tin" className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-black text-[#68766f]">Bạn chắc bao nhiêu?</span>
        {([1, 2, 3] as const).map((value) => {
          const active = state.confidence !== null && state.confidence >= value;
          return (
            <button key={value} type="button" aria-label={`${value} sao — ${CONFIDENCE_LABEL[value]}`} aria-pressed={state.confidence === value} onClick={() => dispatch({ type: "SET_CONFIDENCE", value: state.confidence === value ? null : value })} className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${active ? "bg-[#fff1c9] text-[#d18b25]" : "bg-[#f4efe5] text-[#c2c8c4]"}`}>
              <Star className="h-5 w-5" fill={active ? "currentColor" : "none"} />
            </button>
          );
        })}
        {state.confidence && <span className="text-xs font-black text-[#d18b25]">{CONFIDENCE_LABEL[state.confidence]}</span>}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={submitting || !answer.trim()} className="min-h-12 flex-1 rounded-2xl bg-[#176b55] px-4 text-sm font-black text-white disabled:opacity-40">{submitting ? "Đang chấm…" : "Kiểm tra"}</button>
        {secondaryAction}
      </div>
    </div>
  );
}
