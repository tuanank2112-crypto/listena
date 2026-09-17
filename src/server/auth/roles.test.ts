import { describe, expect, it } from "vitest";
import {
  canUseLearnerApi,
  isLearnerApiPath,
  LEARNER_API_PREFIXES,
  requireLearnerRole,
} from "./roles";

describe("requireLearnerRole", () => {
  it("returns a 403 ROLE_FORBIDDEN response for a TEACHER session", async () => {
    const response = requireLearnerRole({ user: { role: "TEACHER" } });

    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toMatchObject({ code: "ROLE_FORBIDDEN" });
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets LEARNER and ADMIN sessions through", () => {
    expect(requireLearnerRole({ user: { role: "LEARNER" } })).toBeNull();
    expect(requireLearnerRole({ user: { role: "ADMIN" } })).toBeNull();
    expect(canUseLearnerApi("TEACHER")).toBe(false);
  });

  it("leaves the unauthenticated case to the route's own 401", () => {
    expect(requireLearnerRole(null)).toBeNull();
    expect(requireLearnerRole({ user: null })).toBeNull();
    expect(requireLearnerRole({ user: {} })).toBeNull();
  });
});

describe("isLearnerApiPath", () => {
  it("matches the learner prefixes exactly or as a segment boundary", () => {
    for (const prefix of LEARNER_API_PREFIXES) {
      expect(isLearnerApiPath(prefix)).toBe(true);
      expect(isLearnerApiPath(`${prefix}/abc`)).toBe(true);
    }
    expect(isLearnerApiPath("/api/attempts")).toBe(false);
    expect(isLearnerApiPath("/api/teacher/lesson")).toBe(false);
    expect(isLearnerApiPath("/api/auth/session")).toBe(false);
    expect(isLearnerApiPath("/api/feedback")).toBe(false);
  });
});
