import {
  PREDICT_WINDOW_MS,
  type AssistMode,
  type AssistPayload,
  type CanvasMode,
  type Confidence,
  type SkeletonSlot,
} from "./types";

/**
 * Pure state machine behind the Answer Canvas. Every mode composes the same
 * `submittedAnswer` string (see `composeAnswer`), and switching modes carries
 * the current words across so a learner never loses typed text.
 *
 * Assist state lives only in memory (CẤM localStorage — SPEC-P133).
 */
export interface CanvasState {
  mode: CanvasMode;
  /** FREE composition: the full raw text (chips are derived from it). */
  text: string;
  skeleton: SkeletonSlot[] | null;
  skeletonText: string | null;
  /** Typed characters per skeleton slot, excluding a revealed first letter. */
  slotValues: string[];
  activeSlot: number;
  tiles: string[] | null;
  /** Indices into `tiles` in the order the learner placed them. */
  arranged: number[];
  /** Hint cost paid per assist mode; paid at most once per exercise. */
  paid: Partial<Record<AssistMode, number>>;
  confidence: Confidence | null;
  loadingAssist: AssistMode | null;
  assistBlocked: boolean;
  error: string;
  predictUntil: number | null;
  predictUsed: boolean;
}

export type CanvasAction =
  | { type: "SET_TEXT"; value: string }
  | { type: "ADD_CHIP"; word: string }
  | { type: "REMOVE_CHIP"; index: number }
  | { type: "ASSIST_START"; mode: AssistMode }
  | { type: "ASSIST_SUCCESS"; payload: AssistPayload }
  | { type: "ASSIST_FAILURE"; error: string; blocked?: boolean }
  | { type: "SET_MODE"; mode: CanvasMode }
  | { type: "FILL_SLOT"; index: number; value: string }
  | { type: "FOCUS_SLOT"; index: number }
  | { type: "PLACE_TILE"; index: number }
  | { type: "UNPLACE_TILE"; position: number }
  | { type: "CLEAR_TILES" }
  | { type: "SET_CONFIDENCE"; value: Confidence | null }
  | { type: "PREDICT_START"; now: number }
  | { type: "PREDICT_END" }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" };

export function createInitialCanvasState(): CanvasState {
  return {
    mode: "FREE",
    text: "",
    skeleton: null,
    skeletonText: null,
    slotValues: [],
    activeSlot: 0,
    tiles: null,
    arranged: [],
    paid: {},
    confidence: null,
    loadingAssist: null,
    assistBlocked: false,
    error: "",
    predictUntil: null,
    predictUsed: false,
  };
}

export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function slotCapacity(slot: SkeletonSlot): number {
  return Math.max(0, slot.length - (slot.first ? 1 : 0));
}

export function slotDisplay(slot: SkeletonSlot, value: string): string {
  return `${slot.first ?? ""}${value}`;
}

export function composeAnswer(state: CanvasState): string {
  switch (state.mode) {
    case "SKELETON":
      return (state.skeleton ?? [])
        .map((slot, index) => slotDisplay(slot, state.slotValues[index] ?? ""))
        .filter(Boolean)
        .join(" ");
    case "TILES":
      return state.arranged.map((index) => state.tiles?.[index] ?? "").filter(Boolean).join(" ");
    default:
      return wordsOf(state.text).join(" ");
  }
}

export function selectHintCost(state: CanvasState): number {
  return Object.values(state.paid).reduce((sum, cost) => sum + (cost ?? 0), 0);
}

export function isModeUnlocked(state: CanvasState, mode: CanvasMode): boolean {
  if (mode === "FREE") return true;
  if (mode === "SKELETON") return state.skeleton !== null;
  return state.tiles !== null;
}

function slotValuesFrom(text: string, skeleton: SkeletonSlot[]): string[] {
  const words = wordsOf(text);
  return skeleton.map((slot, index) => {
    const word = words[index] ?? "";
    const stripped =
      slot.first && word.slice(0, 1).toLowerCase() === slot.first.toLowerCase() ? word.slice(1) : word;
    return stripped.slice(0, slotCapacity(slot));
  });
}

function arrangedFrom(text: string, tiles: string[]): number[] {
  const used = new Set<number>();
  const arranged: number[] = [];
  for (const word of wordsOf(text)) {
    const needle = word.toLowerCase();
    const index = tiles.findIndex((tile, tileIndex) => !used.has(tileIndex) && tile.toLowerCase() === needle);
    if (index === -1) continue;
    used.add(index);
    arranged.push(index);
  }
  return arranged;
}

/** Re-targets the composition of `state` into `mode` without losing words. */
function carryInto(state: CanvasState, mode: CanvasMode): CanvasState {
  const text = composeAnswer(state);
  if (mode === "SKELETON" && state.skeleton) {
    const slotValues = slotValuesFrom(text, state.skeleton);
    const firstEmpty = slotValues.findIndex((value, index) => value.length < slotCapacity(state.skeleton![index]));
    return { ...state, mode, text, slotValues, activeSlot: firstEmpty === -1 ? 0 : firstEmpty, error: "" };
  }
  if (mode === "TILES" && state.tiles) {
    return { ...state, mode, text, arranged: arrangedFrom(text, state.tiles), error: "" };
  }
  return { ...state, mode: "FREE", text, error: "" };
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "SET_TEXT":
      return { ...state, text: action.value, error: "" };
    case "ADD_CHIP": {
      const word = action.word.trim();
      if (!word) return state;
      return { ...state, text: [...wordsOf(state.text), word].join(" "), error: "" };
    }
    case "REMOVE_CHIP": {
      const words = wordsOf(state.text);
      if (action.index < 0 || action.index >= words.length) return state;
      words.splice(action.index, 1);
      return { ...state, text: words.join(" ") };
    }
    case "ASSIST_START":
      if (state.assistBlocked) return state;
      return { ...state, loadingAssist: action.mode, error: "" };
    case "ASSIST_SUCCESS": {
      const { payload } = action;
      const paid = payload.mode in state.paid ? state.paid : { ...state.paid, [payload.mode]: payload.hintCost };
      const unlocked: CanvasState =
        payload.mode === "SKELETON"
          ? {
              ...state,
              paid,
              loadingAssist: null,
              skeleton: payload.skeleton ?? [],
              skeletonText: payload.skeletonText ?? null,
              slotValues: state.skeleton ? state.slotValues : (payload.skeleton ?? []).map(() => ""),
            }
          : {
              ...state,
              paid,
              loadingAssist: null,
              tiles: payload.tiles ?? [],
              arranged: state.tiles ? state.arranged : [],
            };
      return carryInto(unlocked, payload.mode);
    }
    case "ASSIST_FAILURE":
      return { ...state, loadingAssist: null, error: action.error, assistBlocked: state.assistBlocked || Boolean(action.blocked) };
    case "SET_MODE":
      if (action.mode === state.mode || !isModeUnlocked(state, action.mode)) return state;
      return carryInto(state, action.mode);
    case "FILL_SLOT": {
      if (!state.skeleton || !state.skeleton[action.index]) return state;
      const capacity = slotCapacity(state.skeleton[action.index]);
      const value = action.value.replace(/\s+/g, "").slice(0, capacity);
      const slotValues = [...state.slotValues];
      slotValues[action.index] = value;
      const full = value.length >= capacity;
      const activeSlot = full ? Math.min(action.index + 1, state.skeleton.length - 1) : action.index;
      return { ...state, slotValues, activeSlot, error: "" };
    }
    case "FOCUS_SLOT":
      if (!state.skeleton || action.index < 0 || action.index >= state.skeleton.length) return state;
      return { ...state, activeSlot: action.index };
    case "PLACE_TILE":
      if (!state.tiles || !state.tiles[action.index] || state.arranged.includes(action.index)) return state;
      return { ...state, arranged: [...state.arranged, action.index], error: "" };
    case "UNPLACE_TILE":
      if (action.position < 0 || action.position >= state.arranged.length) return state;
      return { ...state, arranged: state.arranged.filter((_, position) => position !== action.position) };
    case "CLEAR_TILES":
      return { ...state, arranged: [] };
    case "SET_CONFIDENCE":
      return { ...state, confidence: action.value };
    case "PREDICT_START":
      if (state.predictUsed) return state;
      return { ...state, predictUsed: true, predictUntil: action.now + PREDICT_WINDOW_MS };
    case "PREDICT_END":
      return { ...state, predictUntil: null };
    case "CLEAR_ERROR":
      return { ...state, error: "" };
    case "RESET":
      return createInitialCanvasState();
    default:
      return state;
  }
}
