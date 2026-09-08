import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), course: vi.fn(), findLesson: vi.fn(), createLesson: vi.fn(), vocab: vi.fn(), link: vi.fn(),
}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  course: { findUnique: mocks.course },
  lesson: { findUnique: mocks.findLesson, create: mocks.createLesson },
  vocabularyItem: { upsert: mocks.vocab }, lessonVocabulary: { create: mocks.link },
} }));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), error: vi.fn() } }));
import { GET } from "./[lessonId]/route";
import { POST } from "./route";

const body = {
  courseId: "00000000-0000-4000-8000-000000000001", title: "Test", topic: "Travel", cefrLevel: "A2",
  transcript: "A suitcase", segments: [{ position: 1, text: "A suitcase" }],
  vocabulary: [{ lemma: "suitcase", displayText: "suitcase", meaningVi: "va li", cefrLevel: "A2" }],
  exercises: [{ type: "GIST", prompt: "What?", correctAnswer: "suitcase", position: 1 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "teacher", role: "TEACHER" } });
  mocks.createLesson.mockResolvedValue({ id: "new" });
  mocks.vocab.mockResolvedValue({ id: "word" });
});

describe("teacher content ownership", () => {
  it.each([
    ["other", "TEACHER", 403], ["teacher", "TEACHER", 200], ["other", "ADMIN", 200],
  ])("GET owner %s role %s -> %i", async (owner, role, status) => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher", role } });
    mocks.findLesson.mockResolvedValue({ id: "lesson", createdById: owner });
    const response = await GET(new Request("http://localhost/api/teacher/lesson/lesson"), { params: Promise.resolve({ lessonId: "lesson" }) });
    expect(response.status).toBe(status);
    if (status === 403) expect(await response.json()).toEqual({ error: "Forbidden" });
  });

  it.each([
    ["other", "TEACHER", 403], ["teacher", "TEACHER", 201], ["other", "ADMIN", 201], [null, "TEACHER", 404],
  ])("POST course owner %s role %s -> %i", async (owner, role, status) => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher", role } });
    mocks.course.mockResolvedValue(owner ? { createdById: owner } : null);
    const response = await POST(new Request("http://localhost/api/teacher/lesson", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }));
    expect(response.status).toBe(status);
    if (status !== 201) {
      expect(mocks.createLesson).not.toHaveBeenCalled();
      expect(mocks.vocab).not.toHaveBeenCalled();
    }
  });
});
