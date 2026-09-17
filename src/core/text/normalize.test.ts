import { describe, expect, it } from "vitest";
import { normalizeText, tokenize } from "./normalize";

describe("normalizeText (Plan13 L3: Unicode-aware normalization)", () => {
  it("folds the iOS typographic apostrophe so don’t equals don't", () => {
    expect(normalizeText("don’t")).toBe("don't");
    expect(normalizeText("don’t")).toBe(normalizeText("don't"));
    expect(normalizeText("don‘t")).toBe("don't");
    expect(normalizeText("donʼt")).toBe("don't");
    expect(tokenize(normalizeText("I don’t know"))).toEqual(["i", "don't", "know"]);
  });

  it("strips curly double quotes like ASCII double quotes", () => {
    expect(normalizeText("“hello” world")).toBe("hello world");
    expect(normalizeText("“hello” world")).toBe(normalizeText('"hello" world'));
  });

  it("keeps accented Latin letters intact (café)", () => {
    expect(normalizeText("Café!")).toBe("café");
    // Decomposed form (e + combining acute) normalizes to the same token.
    expect(normalizeText("café")).toBe("café");
  });

  it("keeps Vietnamese letters intact (thực đơn)", () => {
    expect(normalizeText("Thực đơn, xin mời.")).toBe("thực đơn xin mời");
    expect(tokenize(normalizeText("thực đơn"))).toEqual(["thực", "đơn"]);
  });

  it("keeps digits and removes ASCII punctuation as before", () => {
    expect(normalizeText("Gate 12B, please!")).toBe("gate 12b please");
    expect(normalizeText("well-known")).toBe("well known");
  });

  it("lowercases with the English locale", () => {
    expect(normalizeText("I")).toBe("i");
    expect(normalizeText("HELLO World")).toBe("hello world");
  });
});
