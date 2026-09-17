import { describe, expect, it } from "vitest";
import {
  canvasReducer,
  composeAnswer,
  createInitialCanvasState,
  isModeUnlocked,
  selectHintCost,
  type CanvasAction,
  type CanvasState,
} from "./canvas-reducer";
import { PREDICT_WINDOW_MS, type AssistPayload } from "./types";

const skeletonPayload: AssistPayload = {
  mode: "SKELETON",
  hintCost: 1,
  skeleton: [{ length: 4, first: "t" }, { length: 4 }, { length: 2 }, { length: 2 }, { length: 4 }],
  skeletonText: "t _ _ _   _ _ _ _   _ _   _ _   _ _ _ _",
};

const tilesPayload: AssistPayload = {
  mode: "TILES",
  hintCost: 2,
  tiles: ["nang", "went", "hotel", "they", "da", "beach", "to"],
};

function run(actions: CanvasAction[], initial: CanvasState = createInitialCanvasState()): CanvasState {
  return actions.reduce(canvasReducer, initial);
}

describe("canvasReducer — FREE chips", () => {
  it("adds chips and composes a single-spaced answer", () => {
    const state = run([
      { type: "ADD_CHIP", word: " They " },
      { type: "ADD_CHIP", word: "went" },
      { type: "ADD_CHIP", word: "   " },
      { type: "SET_TEXT", value: "They went   to" },
    ]);
    expect(state.mode).toBe("FREE");
    expect(composeAnswer(state)).toBe("They went to");
    expect(run([{ type: "ADD_CHIP", word: "Da" }], state).text).toBe("They went to Da");
  });

  it("removes a chip by index and ignores out-of-range indexes", () => {
    const state = run([{ type: "SET_TEXT", value: "They went to Da Nang" }, { type: "REMOVE_CHIP", index: 2 }]);
    expect(composeAnswer(state)).toBe("They went Da Nang");
    expect(run([{ type: "REMOVE_CHIP", index: 9 }], state)).toBe(state);
  });
});

describe("canvasReducer — SKELETON", () => {
  it("unlocks the skeleton, charges 1 hint once and carries typed words into the slots", () => {
    const loading = run([{ type: "SET_TEXT", value: "They wen" }, { type: "ASSIST_START", mode: "SKELETON" }]);
    expect(loading.loadingAssist).toBe("SKELETON");
    const state = run([{ type: "ASSIST_SUCCESS", payload: skeletonPayload }], loading);
    expect(state.mode).toBe("SKELETON");
    expect(state.loadingAssist).toBeNull();
    expect(selectHintCost(state)).toBe(1);
    // "They" starts with the revealed "t", so only "hey" is carried as typed text.
    expect(state.slotValues).toEqual(["hey", "wen", "", "", ""]);
    expect(state.activeSlot).toBe(1);
    expect(composeAnswer(state)).toBe("they wen");
  });

  it("fills slots with truncation and auto-advances when a slot is full", () => {
    const base = run([{ type: "ASSIST_SUCCESS", payload: skeletonPayload }]);
    const typed = run([{ type: "FILL_SLOT", index: 0, value: "heyyyy" }], base);
    expect(typed.slotValues[0]).toBe("hey");
    expect(typed.activeSlot).toBe(1);
    const partial = run([{ type: "FILL_SLOT", index: 1, value: "we nt" }], typed);
    expect(partial.slotValues[1]).toBe("went");
    expect(partial.activeSlot).toBe(2);
    const done = run(
      [
        { type: "FILL_SLOT", index: 2, value: "to" },
        { type: "FILL_SLOT", index: 3, value: "da" },
        { type: "FILL_SLOT", index: 4, value: "nang" },
      ],
      partial,
    );
    expect(composeAnswer(done)).toBe("they went to da nang");
    expect(done.activeSlot).toBe(4);
    expect(run([{ type: "FOCUS_SLOT", index: 1 }], done).activeSlot).toBe(1);
  });
});

describe("canvasReducer — TILES", () => {
  it("unlocks tiles for 2 hints and arranges them by tap, ignoring duplicate placement", () => {
    const state = run([
      { type: "ASSIST_SUCCESS", payload: tilesPayload },
      { type: "PLACE_TILE", index: 3 },
      { type: "PLACE_TILE", index: 1 },
      { type: "PLACE_TILE", index: 3 },
      { type: "PLACE_TILE", index: 6 },
    ]);
    expect(state.mode).toBe("TILES");
    expect(selectHintCost(state)).toBe(2);
    expect(state.arranged).toEqual([3, 1, 6]);
    expect(composeAnswer(state)).toBe("they went to");
    const removed = run([{ type: "UNPLACE_TILE", position: 1 }], state);
    expect(composeAnswer(removed)).toBe("they to");
    expect(run([{ type: "CLEAR_TILES" }], removed).arranged).toEqual([]);
  });

  it("keeps the composed text when switching FREE ⇄ TILES without paying again", () => {
    const arranged = run([
      { type: "ASSIST_SUCCESS", payload: tilesPayload },
      { type: "PLACE_TILE", index: 3 },
      { type: "PLACE_TILE", index: 1 },
    ]);
    const free = run([{ type: "SET_MODE", mode: "FREE" }], arranged);
    expect(free.mode).toBe("FREE");
    expect(free.text).toBe("they went");
    const edited = run([{ type: "ADD_CHIP", word: "TO" }, { type: "ADD_CHIP", word: "sea" }], free);
    const back = run([{ type: "SET_MODE", mode: "TILES" }], edited);
    expect(back.mode).toBe("TILES");
    expect(back.arranged).toEqual([3, 1, 6]);
    expect(selectHintCost(back)).toBe(2);
    expect(isModeUnlocked(back, "SKELETON")).toBe(false);
    expect(run([{ type: "SET_MODE", mode: "SKELETON" }], back)).toBe(back);
  });
});

describe("canvasReducer — hint cost, errors, confidence, predict", () => {
  it("sums hint cost across modes and never double-charges a replayed payload", () => {
    const both = run([
      { type: "ASSIST_SUCCESS", payload: skeletonPayload },
      { type: "ASSIST_SUCCESS", payload: tilesPayload },
      { type: "ASSIST_SUCCESS", payload: skeletonPayload },
      { type: "ASSIST_SUCCESS", payload: { ...tilesPayload, hintCost: 99 } },
    ]);
    expect(selectHintCost(both)).toBe(3);
    expect(both.paid).toEqual({ SKELETON: 1, TILES: 2 });
    expect(both.mode).toBe("TILES");
  });

  it("records assist failures, blocks further assist on ASSIST_LIMIT and clears errors", () => {
    const failed = run([{ type: "ASSIST_START", mode: "TILES" }, { type: "ASSIST_FAILURE", error: "Bận" }]);
    expect(failed.loadingAssist).toBeNull();
    expect(failed.error).toBe("Bận");
    expect(failed.assistBlocked).toBe(false);
    const blocked = run([{ type: "ASSIST_FAILURE", error: "Hết lượt", blocked: true }], failed);
    expect(blocked.assistBlocked).toBe(true);
    expect(run([{ type: "ASSIST_START", mode: "SKELETON" }], blocked)).toBe(blocked);
    expect(run([{ type: "CLEAR_ERROR" }], blocked).error).toBe("");
  });

  it("stores confidence, opens a single 20s predict window and resets fully", () => {
    const state = run([
      { type: "SET_CONFIDENCE", value: 3 },
      { type: "PREDICT_START", now: 1_000 },
      { type: "PREDICT_START", now: 5_000 },
    ]);
    expect(state.confidence).toBe(3);
    expect(state.predictUntil).toBe(1_000 + PREDICT_WINDOW_MS);
    expect(state.predictUsed).toBe(true);
    const ended = run([{ type: "PREDICT_END" }], state);
    expect(ended.predictUntil).toBeNull();
    expect(run([{ type: "PREDICT_START", now: 9_000 }], ended).predictUntil).toBeNull();
    expect(run([{ type: "RESET" }], ended)).toEqual(createInitialCanvasState());
  });
});
