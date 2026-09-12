import { describe, expect, it } from "vitest";
import { resolveLogLevel } from "./logger";

describe("resolveLogLevel", () => {
  it.each([
    [undefined, "info"],
    ["", "info"],
    ["   ", "info"],
    ["unexpected", "info"],
    ["DEBUG", "debug"],
    [" warn ", "warn"],
    ["silent", "silent"],
  ] as const)("normalizes %j to %s", (value, expected) => {
    expect(resolveLogLevel(value)).toBe(expected);
  });
});
