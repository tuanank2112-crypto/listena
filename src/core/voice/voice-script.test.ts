import { describe, expect, it } from "vitest";
import { COACH_RATE, NPC_RATE, RECAST_RATE, buildTurnVoiceScript, repeatableLines } from "./voice-script";

const turn = {
  npcReply: "Oh no! What does your suitcase look like? **Tell me the colour.**",
  coachMessage: "Bạn nói 'I lose my bag' — thì quá khứ là 'lost'. Try: I lost my bag.",
  pedagogicalAct: "RECAST",
  detectedError: {
    type: "grammar",
    expected: "I lost my bag.",
    actual: "I lose my bag.",
    explanationVi: "Quá khứ của lose là lost.",
  },
};

describe("buildTurnVoiceScript", () => {
  it("voices the NPC in English and the corrected recast slowly, and nothing else", () => {
    const script = buildTurnVoiceScript(turn);
    expect(script?.version).toBe("v1");
    expect(script?.lines).toEqual([
      { role: "NPC", lang: "en", text: "Oh no!", rate: NPC_RATE },
      { role: "NPC", lang: "en", text: "What does your suitcase look like?", rate: NPC_RATE },
      { role: "NPC", lang: "en", text: "Tell me the colour.", rate: NPC_RATE },
      { role: "RECAST", lang: "en", text: "I lost my bag.", rate: RECAST_RATE },
    ]);
  });

  it("never reads the Coach's explanation aloud", () => {
    // Plan23: a learner practising English is not pulled back into Vietnamese
    // on a turn they may have understood. The explanation waits for a button.
    const script = buildTurnVoiceScript(turn);
    expect(script?.lines.some((line) => line.lang === "vi")).toBe(false);
    expect(script?.lines.map((line) => line.text).join(" ")).not.toContain("thì quá khứ");
  });

  it("still says nothing at all for a turn with neither an NPC reply nor a coach message", () => {
    expect(buildTurnVoiceScript({ pedagogicalAct: "ASK_GUIDING" })).toBeNull();
  });

  it("voices a turn that carries only an NPC reply", () => {
    const script = buildTurnVoiceScript({ npcReply: "Hello there." });
    expect(script?.lines).toEqual([{ role: "NPC", lang: "en", text: "Hello there.", rate: NPC_RATE }]);
  });

  it("never voices the learner's erroneous sentence as a model", () => {
    const script = buildTurnVoiceScript(turn);
    const modelled = repeatableLines(script).map((line) => line.text);
    expect(modelled).not.toContain("I lose my bag.");
    expect(modelled).toContain("I lost my bag.");
  });

  it("skips the recast when it is a single word or identical to the learner's text", () => {
    const single = buildTurnVoiceScript({ ...turn, detectedError: { expected: "lost", actual: "lose" } });
    expect(single?.lines.some((line) => line.role === "RECAST")).toBe(false);
    const same = buildTurnVoiceScript({ ...turn, detectedError: { expected: "I lost my bag", actual: "i lost my bag." } });
    expect(same?.lines.some((line) => line.role === "RECAST")).toBe(false);
  });

  it("moves a Vietnamese sentence that slipped into npcReply to the coach voice", () => {
    const script = buildTurnVoiceScript({ npcReply: "Great. Bạn làm tốt lắm.", coachMessage: "" });
    expect(script?.lines).toEqual([
      { role: "NPC", lang: "en", text: "Great.", rate: NPC_RATE },
      { role: "COACH", lang: "vi", text: "Bạn làm tốt lắm.", rate: COACH_RATE },
    ]);
  });

  it("returns null for legacy string turns and empty content", () => {
    expect(buildTurnVoiceScript("plain text")).toBeNull();
    expect(buildTurnVoiceScript({ npcReply: "", coachMessage: "" })).toBeNull();
    expect(buildTurnVoiceScript(null)).toBeNull();
  });
});
