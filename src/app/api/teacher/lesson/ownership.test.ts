import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  course: vi.fn(),
  findLesson: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  vocab: vi.fn(),
  link: vi.fn(),
  findCreationRequest: vi.fn(),
  createCreationRequest: vi.fn(),
  atomicBatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: { findUnique: mocks.course, findFirst: vi.fn() },
    lesson: {
      findUnique: mocks.findLesson,
      findFirst: mocks.findLesson,
      create: mocks.createLesson,
      update: mocks.updateLesson,
    },
    lessonCreationRequest: {
      findUnique: mocks.findCreationRequest,
      create: mocks.createCreationRequest,
      update: vi.fn(),
    },
    vocabularyItem: { upsert: mocks.vocab },
    lessonVocabulary: { create: mocks.link },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: mocks.atomicBatch,
  withLibSqlWriteTransaction: vi.fn(async (run) => {
    mocks.atomicBatch();
    const mockTx = {
      execute: vi.fn(async () => ({ rows: [], rowsAffected: 1 })),
    };
    return await run(mockTx);
  }),
  libSqlTimestamp: (d: Date) => d.toISOString(),
}));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { GET } from "./[lessonId]/route";
import { POST, PUT } from "./route";

const body = {
  courseId: "00000000-0000-4000-8000-000000000001",
  title: "Test",
  topic: "Travel",
  cefrLevel: "A2",
  transcript: "A suitcase",
  clientRequestId: "00000000-0000-4000-8000-000000000005",
  segments: [{ position: 1, text: "A suitcase" }],
  vocabulary: [{ lemma: "suitcase", displayText: "suitcase", meaningVi: "va li", cefrLevel: "A2" }],
  exercises: [{ type: "GIST", prompt: "What?", correctAnswer: "suitcase", position: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "teacher", role: "TEACHER" } });
  mocks.createLesson.mockResolvedValue({ id: "new" });
  mocks.findLesson.mockResolvedValue({ id: "new", createdById: "teacher" });
  mocks.vocab.mockResolvedValue({ id: "word" });
  mocks.findCreationRequest.mockResolvedValue(null);
  mocks.createCreationRequest.mockResolvedValue({ id: "req-1" });
  mocks.atomicBatch.mockResolvedValue([{ changes: 1 }]);
});

describe("teacher content ownership", () => {
  it.each([
    ["other", "TEACHER", 403],
    ["teacher", "TEACHER", 200],
    ["other", "ADMIN", 200],
  ])("GET owner %s role %s -> %i", async (owner, role, status) => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher", role } });
    mocks.findLesson.mockResolvedValue({ id: "lesson", createdById: owner });
    const response = await GET(
      new Request("http://localhost/api/teacher/lesson/lesson"),
      { params: Promise.resolve({ lessonId: "lesson" }) }
    );
    expect(response.status).toBe(status);
    if (status === 403) expect(await response.json()).toMatchObject({ error: "Forbidden" });
  });

  it.each([
    ["other", "TEACHER", 403],
    ["teacher", "TEACHER", 201],
    ["other", "ADMIN", 201],
    [null, "TEACHER", 404],
  ])("POST course owner %s role %s -> %i", async (owner, role, status) => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher", role } });
    mocks.course.mockResolvedValue(owner ? { id: body.courseId, createdById: owner } : null);
    const response = await POST(
      new Request("http://localhost/api/teacher/lesson", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(response.status).toBe(status);
    if (status !== 201) {
      expect(mocks.atomicBatch).not.toHaveBeenCalled();
    } else {
      expect(mocks.atomicBatch).toHaveBeenCalled();
    }
  });

  it("returns an opaque 503 for unavailable lesson persistence", async () => {
    mocks.course.mockRejectedValue(new DatabaseUnavailableError());
    const response = await POST(
      new Request("http://localhost/api/teacher/lesson", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("returns an opaque 503 for unavailable lesson reads", async () => {
    mocks.findLesson.mockRejectedValue(new DatabaseUnavailableError());
    const response = await GET(
      new Request("http://localhost/api/teacher/lesson/lesson"),
      { params: Promise.resolve({ lessonId: "lesson" }) }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("PUT publish rejects incomplete graph with 409 LESSON_GRAPH_INCOMPLETE", async () => {
    mocks.findLesson.mockResolvedValue({
      id: "incomplete-lesson",
      createdById: "teacher",
      segments: [{ id: "seg-1" }],
      exercises: [], // no exercises!
      vocabulary: [{ vocabularyItemId: "vocab-1" }],
    });

    const response = await PUT(
      new Request("http://localhost/api/teacher/lesson", {
        method: "PUT",
        body: JSON.stringify({ id: "incomplete-lesson", action: "publish" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "LESSON_GRAPH_INCOMPLETE" });
  });

  it("PUT publish succeeds when graph meets preconditions", async () => {
    mocks.findLesson.mockResolvedValue({
      id: "complete-lesson",
      createdById: "teacher",
      segments: [{ id: "seg-1" }],
      exercises: [{ id: "ex-1" }],
      vocabulary: [{ vocabularyItemId: "vocab-1", isTarget: true }],
    });
    mocks.updateLesson.mockResolvedValue({ id: "complete-lesson", status: "PUBLISHED" });

    const response = await PUT(
      new Request("http://localhost/api/teacher/lesson", {
        method: "PUT",
        body: JSON.stringify({ id: "complete-lesson", action: "publish" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "PUBLISHED" });
  });

  it("PUT publish rejects graph with only non-target vocabulary with 409 LESSON_GRAPH_INCOMPLETE", async () => {
    mocks.findLesson.mockResolvedValue({
      id: "non-target-lesson",
      createdById: "teacher",
      segments: [{ id: "seg-1" }],
      exercises: [{ id: "ex-1" }],
      vocabulary: [{ vocabularyItemId: "vocab-1", isTarget: false }],
    });

    const response = await PUT(
      new Request("http://localhost/api/teacher/lesson", {
        method: "PUT",
        body: JSON.stringify({ id: "non-target-lesson", action: "publish" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "LESSON_GRAPH_INCOMPLETE" });
  });
});
