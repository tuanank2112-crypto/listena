"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, CheckCircle, Send, Loader2, FileText, BookOpen, ListChecks, Languages, MessageSquareText } from "lucide-react";

interface LessonData {
  id: string;
  title: string;
  topic: string;
  cefrLevel: string;
  transcript: string;
  status: string;
  course: { title: string };
  segments: Array<{ id: string; position: number; text: string; difficulty: number }>;
  vocabulary: Array<{ id: string; isTarget: boolean; vocabularyItem: { id: string; displayText: string; meaningVi: string; ipa: string | null } }>;
  exercises: Array<{ id: string; type: string; prompt: string; correctAnswer: string; difficulty: number; position: number }>;
}

export default function LessonEditPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchLesson() {
      try {
        const { lessonId } = await params;
        const res = await fetch(`/api/teacher/lesson/${lessonId}`);
        if (res.ok) setLesson(await res.json());
      } catch (err) {
        console.error("Failed to fetch lesson", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLesson();
  }, [params]);

  const handleAction = async (action: string) => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/teacher/lesson", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lesson?.id, action }),
      });
      if (res.ok) {
        const data = await res.json();
        setLesson(prev => prev ? { ...prev, status: data.status } : prev);
        setMessage(action === "publish" ? "✅ Bài học đã được xuất bản!" : action === "review" ? "✅ Bài học đã được duyệt!" : "✅ Đã cập nhật!");
      } else {
        const err = await res.json();
        setMessage(`❌ ${err.error || "Thất bại"}`);
      }
    } catch (err) {
      setMessage("❌ Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="h-8 w-48 skeleton mb-2" />
        <div className="h-4 w-64 skeleton mb-8" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Không tìm thấy bài học</h1>
        <Link href="/teacher/lessons" className="mt-4 inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; classes: string }> = {
    DRAFT: { label: "Nháp", classes: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    REVIEWED: { label: "Đã duyệt", classes: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    PUBLISHED: { label: "Đã xuất bản", classes: "bg-green-500/20 text-green-400 border-green-500/30" },
  };
  const status = statusConfig[lesson.status] || { label: "Nháp", classes: "bg-amber-500/20 text-amber-400 border-amber-500/30" };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/teacher/lessons" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {message && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 text-sm text-indigo-300">
          {message}
        </motion.div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{lesson.title}</h1>
          <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${status.classes}`}>{status.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{lesson.course.title} • {lesson.cefrLevel} • {lesson.topic}</p>
      </div>

      {/* Actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        {lesson.status === "DRAFT" && (
          <button onClick={() => handleAction("review")} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-300 transition-all hover:bg-blue-500/20 disabled:opacity-50">
            <CheckCircle className="h-4 w-4" /> {saving ? "Đang xử lý..." : "Duyệt bài"}
          </button>
        )}
        {(lesson.status === "DRAFT" || lesson.status === "REVIEWED") && (
          <button onClick={() => handleAction("publish")} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50">
            <Send className="h-4 w-4" /> {saving ? "Đang xử lý..." : "Xuất bản"}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Transcript */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquareText className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Transcript</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{lesson.transcript}</p>
        </div>

        {/* Segments */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Đoạn ({lesson.segments.length})</h2>
          </div>
          <div className="space-y-3">
            {lesson.segments.map(seg => (
              <div key={seg.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-300">#{seg.position}</span>
                  <span className="text-xs text-slate-500">Độ khó: {seg.difficulty}</span>
                </div>
                <p className="text-sm text-slate-300">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Exercises */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Bài tập ({lesson.exercises.length})</h2>
          </div>
          <div className="space-y-4">
            {lesson.exercises.map(ex => (
              <div key={ex.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-300">#{ex.position}</span>
                  <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-300">
                    {ex.type === "GIST" ? "Ý chính" : ex.type === "PARTIAL_DICTATION" ? "Điền từ" : ex.type === "FULL_DICTATION" ? "Chép chính tả" : "Từ vựng"}
                  </span>
                </div>
                <p className="mb-1 text-sm font-medium text-white">{ex.prompt}</p>
                <p className="text-sm text-slate-400">Đáp án: <span className="text-slate-300">{ex.correctAnswer}</span></p>
              </div>
            ))}
          </div>
        </div>

        {/* Vocabulary */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <Languages className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Từ vựng ({lesson.vocabulary.length} từ)</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {lesson.vocabulary.map(v => (
              <div key={v.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="font-medium text-white">{v.vocabularyItem.displayText}</p>
                {v.vocabularyItem.ipa && <p className="text-sm text-slate-500">{v.vocabularyItem.ipa}</p>}
                <p className="text-sm text-slate-400">{v.vocabularyItem.meaningVi}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
