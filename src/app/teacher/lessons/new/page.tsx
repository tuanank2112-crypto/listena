"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewLessonPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // AI generation form
  const [aiTopic, setAiTopic] = useState("");
  const [aiLevel, setAiLevel] = useState("A2");
  const [aiObjectives, setAiObjectives] = useState("");

  // Manual form
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("A2");
  const [transcript, setTranscript] = useState("");
  const [courseId, setCourseId] = useState("");

  const handleAIGenerate = async () => {
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/teacher/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          cefrLevel: aiLevel,
          learningObjectives: aiObjectives.split("\n").filter(Boolean),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Tạo bài học thất bại");
      }

      const data = await res.json();

      // Navigate to the lesson editor
      router.push(`/teacher/lessons/${data.lesson.id}`);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setGenerating(false);
    }
  };

  const handleManualCreate = async () => {
    setPublishing(true);
    setError("");

    try {
      const res = await fetch("/api/teacher/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          title,
          topic,
          cefrLevel: level,
          learningObjectives: [],
          transcript,
          segments: [
            { position: 1, text: transcript, difficulty: 1.0 },
          ],
          vocabulary: [
            {
              lemma: "example",
              displayText: "example",
              meaningVi: "ví dụ",
              cefrLevel: "A2",
            },
          ],
          exercises: [
            {
              type: "FULL_DICTATION",
              prompt: "Hãy chép lại đoạn văn bạn nghe được",
              correctAnswer: transcript,
              position: 1,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Tạo bài học thất bại");
      }

      const data = await res.json();
      setSuccess("Bài học đã được tạo thành công!");
      setTimeout(() => router.push(`/teacher/lessons/${data.lesson.id}`), 1500);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <Link
        href="/teacher/lessons"
        className="mb-6 inline-block text-sm text-gray-500 hover:text-gray-700"
      >
        ← Quay lại danh sách bài học
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-gray-900">Tạo bài học mới</h1>
      <p className="mb-8 text-sm text-gray-500">
        Tạo bài học thủ công hoặc dùng AI hỗ trợ
      </p>

      {/* Mode selector */}
      <div className="mb-8 flex gap-3">
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
            mode === "manual"
              ? "border-indigo-600 bg-indigo-50 text-indigo-700"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          ✏️ Tạo thủ công
        </button>
        <button
          onClick={() => setMode("ai")}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
            mode === "ai"
              ? "border-indigo-600 bg-indigo-50 text-indigo-700"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          🤖 AI hỗ trợ
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {mode === "ai" ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div>
            <label htmlFor="ai-topic" className="block text-sm font-medium text-gray-700">
              Chủ đề
            </label>
            <input
              id="ai-topic"
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ví dụ: Ordering food at a restaurant"
            />
          </div>
          <div>
            <label htmlFor="ai-level" className="block text-sm font-medium text-gray-700">
              Trình độ
            </label>
            <select
              id="ai-level"
              value={aiLevel}
              onChange={(e) => setAiLevel(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </div>
          <div>
            <label htmlFor="ai-objectives" className="block text-sm font-medium text-gray-700">
              Mục tiêu học tập (mỗi dòng một mục tiêu)
            </label>
            <textarea
              id="ai-objectives"
              value={aiObjectives}
              onChange={(e) => setAiObjectives(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Luyện nghe từ vựng về nhà hàng&#10;Nhận biết câu hỏi về giá cả"
            />
          </div>
          <button
            onClick={handleAIGenerate}
            disabled={generating || !aiTopic}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating
              ? "🤖 AI đang tạo bài học..."
              : "🤖 Tạo bài học với AI"}
          </button>
          <p className="text-xs text-gray-400">
            Nội dung do AI tạo chỉ là bản nháp. Giáo viên cần duyệt trước khi xuất bản.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div>
            <label htmlFor="course-id" className="block text-sm font-medium text-gray-700">
              Course ID
            </label>
            <input
              id="course-id"
              type="text"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nhập Course ID (xem trong danh sách khóa học)"
            />
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Tiêu đề
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ví dụ: Ordering Food at a Restaurant"
            />
          </div>
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
              Chủ đề
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="restaurant, food, ordering"
            />
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700">
              Trình độ
            </label>
            <select
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </div>
          <div>
            <label htmlFor="transcript" className="block text-sm font-medium text-gray-700">
              Transcript (80-120 từ)
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nhập nội dung bài nghe..."
            />
          </div>
          <button
            onClick={handleManualCreate}
            disabled={publishing || !title || !transcript || !courseId}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {publishing ? "Đang tạo..." : "Tạo bài học"}
          </button>
        </div>
      )}
    </div>
  );
}
