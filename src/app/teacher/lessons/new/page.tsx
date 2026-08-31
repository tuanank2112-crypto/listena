"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, Sparkles, FileText, Send, Loader2 } from "lucide-react";

export default function NewLessonPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [aiTopic, setAiTopic] = useState("");
  const [aiLevel, setAiLevel] = useState("A2");
  const [aiObjectives, setAiObjectives] = useState("");

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
      router.push(`/teacher/lessons/${data.lesson.id}`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Có lỗi xảy ra");
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
          courseId, title, topic, cefrLevel: level, learningObjectives: [], transcript,
          segments: [{ position: 1, text: transcript, difficulty: 1.0 }],
          vocabulary: [{ lemma: "example", displayText: "example", meaningVi: "ví dụ", cefrLevel: "A2" }],
          exercises: [{ type: "FULL_DICTATION", prompt: "Hãy chép lại đoạn văn bạn nghe được", correctAnswer: transcript, position: 1 }],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Tạo bài học thất bại");
      }
      const data = await res.json();
      setSuccess("Bài học đã được tạo thành công!");
      setTimeout(() => router.push(`/teacher/lessons/${data.lesson.id}`), 1500);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Có lỗi xảy ra");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/teacher/lessons" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      <h1 className="text-3xl font-bold text-white">Tạo bài học mới</h1>
      <p className="mt-2 text-slate-400">Tạo bài học thủ công hoặc dùng AI hỗ trợ</p>

      {/* Mode selector */}
      <div className="mt-8 mb-8 flex gap-3">
        {[
          { key: "manual" as const, icon: FileText, label: "Tạo thủ công" },
          { key: "ai" as const, icon: Sparkles, label: "AI hỗ trợ" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
              mode === m.key
                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            }`}
          >
            <m.icon className="h-5 w-5" />
            {m.label}
          </button>
        ))}
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400" role="alert">
          {error}
        </motion.div>
      )}
      {success && (
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-4 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
          {success}
        </motion.div>
      )}

      {mode === "ai" ? (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div>
            <label htmlFor="ai-topic" className="block text-sm font-medium text-slate-300">Chủ đề</label>
            <input id="ai-topic" type="text" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="Ví dụ: Travel, Food, Technology..." />
          </div>
          <div>
            <label htmlFor="ai-level" className="block text-sm font-medium text-slate-300">Trình độ</label>
            <select id="ai-level" value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30">
              <option value="A1">A1 - Beginner</option>
              <option value="A2">A2 - Elementary</option>
              <option value="B1">B1 - Intermediate</option>
              <option value="B2">B2 - Upper Intermediate</option>
            </select>
          </div>
          <div>
            <label htmlFor="ai-objectives" className="block text-sm font-medium text-slate-300">Mục tiêu học tập (mỗi dòng một mục tiêu)</label>
            <textarea id="ai-objectives" value={aiObjectives} onChange={(e) => setAiObjectives(e.target.value)} rows={3}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="Luyện nghe từ vựng về nhà hàng&#10;Nhận biết câu hỏi về giá cả" />
          </div>
          <button onClick={handleAIGenerate} disabled={generating || !aiTopic}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> AI đang tạo bài học...</> : <><Sparkles className="h-4 w-4" /> Tạo bài học với AI</>}
          </button>
          <p className="text-xs text-slate-500">Nội dung do AI tạo chỉ là bản nháp. Giáo viên cần duyệt trước khi xuất bản.</p>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div>
            <label htmlFor="course-id" className="block text-sm font-medium text-slate-300">Course ID</label>
            <input id="course-id" type="text" value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="Nhập Course ID (xem trong danh sách khóa học)" />
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-300">Tiêu đề</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="Ví dụ: Ordering Food at a Restaurant" />
          </div>
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-slate-300">Chủ đề</label>
            <input id="topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="restaurant, food, ordering" />
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-slate-300">Trình độ</label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30">
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </div>
          <div>
            <label htmlFor="transcript" className="block text-sm font-medium text-slate-300">Transcript (80-120 từ)</label>
            <textarea id="transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="Nhập nội dung bài nghe..." />
          </div>
          <button onClick={handleManualCreate} disabled={publishing || !title || !transcript || !courseId}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50">
            {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</> : <><Send className="h-4 w-4" /> Tạo bài học</>}
          </button>
        </div>
      )}
    </div>
  );
}
