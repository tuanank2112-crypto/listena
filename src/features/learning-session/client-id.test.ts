import { describe, expect, it } from "vitest";
import { makeClientId } from "./client-id";

describe("makeClientId", () => {
  it("uses getRandomValues when randomUUID is unavailable on insecure HTTP", () => {
    let seed = 0;
    const cryptoWithoutRandomUuid = {
      getRandomValues(values: Uint8Array) {
        values.forEach((_, index) => {
          values[index] = seed + index;
        });
        seed += values.length;
        return values;
      },
    };

    const first = makeClientId("turn", cryptoWithoutRandomUuid);
    const second = makeClientId("turn", cryptoWithoutRandomUuid);

    expect(first).toMatch(/^turn-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
