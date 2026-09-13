"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  DAILY_MINUTE_OPTIONS,
  normalizeTopic,
  parseLearnerIntentPayload,
  toLearnerIntentDraft,
  validateLearnerIntentDraft,
  type LearnerIntentDraft,
  type LearnerIntentPayload,
} from "./types";

const DEFAULT_DRAFT: LearnerIntentDraft = {
  goal: "",
  dailyMinutes: 10,
  preferredTopics: [],
  revision: null,
};

export function LearnerIntentCard({
  className = "",
  initialIntent,
}: {
  className?: string;
  /** Optional server-fetched snapshot; the client still refreshes it through the typed API. */
  initialIntent?: LearnerIntentPayload;
}) {
  const [intent, setIntent] = useState<LearnerIntentPayload | null>(initialIntent ?? null);
  const [draft, setDraft] = useState<LearnerIntentDraft>(
    initialIntent ? toLearnerIntentDraft(initialIntent) : DEFAULT_DRAFT,
  );
  const [topicInput, setTopicInput] = useState("");
  const [loading, setLoading] = useState(!initialIntent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [fieldError, setFieldError] = useState<{ field: "goal" | "preferredTopics"; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState("");

  const loadIntent = useCallback(async (preserveDraft: boolean, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setErrorCode("");

    try {
      const response = await fetch("/api/learner/intent", { cache: "no-store", signal });
      const payload = await readJson(response);
      const parsed = parseLearnerIntentPayload(payload);

      if (!response.ok || !parsed) {
        const apiError = readIntentError(payload);
        throw new IntentRequestError(
          apiError.message || "Không thể tải mục tiêu học lúc này.",
          apiError.code,
          response.status,
        );
      }

      setIntent(parsed);
      if (!preserveDraft) {
        setDraft(toLearnerIntentDraft(parsed));
        setTopicInput("");
        setFieldError(null);
        setConflict("");
      } else {
        // Keep the learner's typed values, but advance only the opaque snapshot token.
        // A second explicit save is therefore deliberate instead of a blind overwrite.
        setDraft((current) => ({ ...current, revision: parsed.revision }));
        setNotice("Bản đã lưu mới đã được tải lại. Nội dung bạn đang nhập được giữ nguyên để bạn xem và quyết định lưu lại.");
      }
    } catch (caught) {
      if (signal?.aborted) return;
      const requestError = toIntentRequestError(caught, "Không thể tải mục tiêu học lúc này.");
      setError(requestError.message);
      setErrorCode(requestError.code);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadIntent(false, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadIntent]);

  function updateDraft(patch: Partial<LearnerIntentDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setErrorCode("");
    setNotice("");
  }

  function addTopic() {
    const topic = normalizeTopic(topicInput);
    if (!topic) return;

    const nextDraft = { ...draft, preferredTopics: [...draft.preferredTopics, topic] };
    const validation = validateLearnerIntentDraft(nextDraft);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      return;
    }

    setDraft(nextDraft);
    setTopicInput("");
    setFieldError(null);
  }

  function removeTopic(topic: string) {
    updateDraft({ preferredTopics: draft.preferredTopics.filter((item) => item !== topic) });
    setFieldError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || !intent) return;

    const pendingTopic = normalizeTopic(topicInput);
    const nextDraft = pendingTopic
      ? { ...draft, preferredTopics: [...draft.preferredTopics, pendingTopic] }
      : draft;
    const validation = validateLearnerIntentDraft(nextDraft);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      return;
    }

    setSaving(true);
    setError("");
    setErrorCode("");
    setNotice("");
    setConflict("");
    setFieldError(null);

    try {
      const response = await fetch("/api/learner/intent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.value),
      });
      const payload = await readJson(response);
      const parsed = parseLearnerIntentPayload(payload);

      if (!response.ok || !parsed) {
        const apiError = readIntentError(payload);
        if (response.status === 409 && (apiError.code === "INTENT_CONFLICT" || apiError.code === "INTENT_CAPACITY")) {
          setConflict(apiError.code === "INTENT_CAPACITY"
            ? "Không thể lưu vì bộ nhớ mục tiêu đã đầy. Hãy tải lại trạng thái đã lưu trước khi thử lại."
            : "Mục tiêu học đã được thay đổi ở nơi khác. Bản đã lưu mới sẽ được tải lại; nội dung bạn đang nhập không bị ghi đè.");
          void loadIntent(true);
          return;
        }
        throw new IntentRequestError(
          apiError.message || "Không thể lưu mục tiêu học lúc này.",
          apiError.code,
          response.status,
        );
      }

      setIntent(parsed);
      setDraft(toLearnerIntentDraft(parsed));
      setTopicInput("");
      setNotice("Đã lưu mục tiêu học. Lựa chọn này sẽ định hướng nhiệm vụ tiếp theo của bạn.");
    } catch (caught) {
      const requestError = toIntentRequestError(caught, "Không thể lưu mục tiêu học lúc này.");
      setError(requestError.message);
      setErrorCode(requestError.code);
    } finally {
      setSaving(false);
    }
  }

  if (!intent && loading) {
    return (
      <section className={`paper-card rounded-[28px] p-5 sm:p-6 ${className}`} aria-busy="true" aria-labelledby="learner-intent-title">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#176b55]">Mục tiêu tự học</p>
        <h2 id="learner-intent-title" className="mt-1 text-xl font-black tracking-[-.03em]">Đang tải nhịp học của bạn…</h2>
        <p className="mt-2 text-sm font-bold text-[#748079]" role="status">Bạn vẫn có thể tiếp tục bài học trong khi phần này tải.</p>
      </section>
    );
  }

  if (!intent) {
    return (
      <section className={`paper-card rounded-[28px] p-5 sm:p-6 ${className}`} aria-labelledby="learner-intent-title">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#176b55]">Mục tiêu tự học</p>
        <h2 id="learner-intent-title" className="mt-1 text-xl font-black tracking-[-.03em]">Chưa tải được mục tiêu học</h2>
        <p className="mt-2 text-sm font-bold text-[#c74f47]" role="alert">{error || "Thử tải lại để chỉnh nhịp học của bạn."}</p>
        {errorCode === "UNAUTHORIZED" ? <LoginAgainLink /> : (
          <button type="button" onClick={() => void loadIntent(false)} className="mt-4 min-h-11 rounded-xl bg-[#176b55] px-4 text-sm font-black text-white">
            Tải lại
          </button>
        )}
      </section>
    );
  }

  const goalError = fieldError?.field === "goal" ? fieldError.message : undefined;
  const topicsError = fieldError?.field === "preferredTopics" ? fieldError.message : undefined;
  const busy = loading || saving;

  return (
    <section className={`paper-card rounded-[28px] p-5 sm:p-6 ${className}`} aria-busy={busy} aria-labelledby="learner-intent-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#176b55]">Mục tiêu tự học</p>
          <h2 id="learner-intent-title" className="mt-1 text-xl font-black tracking-[-.03em]">Đặt nhịp học phù hợp với bạn.</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-[#748079]">AI dùng mục tiêu, thời lượng và chủ đề bạn chọn để ưu tiên nhiệm vụ kế tiếp. Bạn có thể bỏ trống mục tiêu và đổi lại bất cứ lúc nào.</p>
        </div>
        {loading && <p className="text-xs font-black text-[#748079]" role="status">Đang đồng bộ…</p>}
      </div>

      <form className="mt-5 space-y-5" onSubmit={(event) => void save(event)} noValidate>
        <div>
          <label htmlFor="learner-intent-goal" className="block text-sm font-black text-[#18332d]">Bạn muốn tự tin hơn về điều gì?</label>
          <textarea
            id="learner-intent-goal"
            value={draft.goal}
            onChange={(event) => updateDraft({ goal: event.target.value })}
            disabled={busy}
            maxLength={240}
            rows={3}
            aria-invalid={Boolean(goalError)}
            aria-describedby={goalError ? "learner-intent-goal-error" : "learner-intent-goal-help"}
            placeholder="Ví dụ: Tự tin gọi món và trò chuyện khi đi du lịch."
            className="mt-2 block w-full resize-y rounded-2xl border border-[#ded8cc] bg-[#fffdf8] px-4 py-3 text-sm font-bold text-[#18332d] outline-none transition placeholder:text-[#9aa19d] focus:border-[#176b55] focus:ring-2 focus:ring-[#dff2e8] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p id="learner-intent-goal-help" className="mt-1.5 text-xs font-bold text-[#748079]">Không bắt buộc · 3–240 ký tự nếu có.</p>
          {goalError && <p id="learner-intent-goal-error" role="alert" className="mt-1.5 text-xs font-bold text-[#c74f47]">{goalError}</p>}
        </div>

        <fieldset>
          <legend className="text-sm font-black text-[#18332d]">Thời lượng học mỗi ngày</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAILY_MINUTE_OPTIONS.map((minutes) => (
              <label key={minutes} className="cursor-pointer">
                <input
                  type="radio"
                  name="learner-daily-minutes"
                  value={minutes}
                  checked={draft.dailyMinutes === minutes}
                  onChange={() => updateDraft({ dailyMinutes: minutes })}
                  disabled={busy}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 items-center justify-center rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3 text-sm font-black text-[#52605a] transition peer-checked:border-[#176b55] peer-checked:bg-[#dff2e8] peer-checked:text-[#176b55] peer-focus-visible:ring-2 peer-focus-visible:ring-[#176b55] peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                  {minutes} phút
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="learner-intent-topic" className="block text-sm font-black text-[#18332d]">Chủ đề bạn hứng thú</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="learner-intent-topic"
              value={topicInput}
              onChange={(event) => {
                setTopicInput(event.target.value);
                setFieldError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTopic();
                }
              }}
              disabled={busy || draft.preferredTopics.length >= 8}
              maxLength={40}
              aria-invalid={Boolean(topicsError)}
              aria-describedby={topicsError ? "learner-intent-topics-error" : "learner-intent-topics-help"}
              placeholder="Du lịch, công việc, phim ảnh…"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-4 text-sm font-bold text-[#18332d] outline-none transition placeholder:text-[#9aa19d] focus:border-[#176b55] focus:ring-2 focus:ring-[#dff2e8] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button type="button" onClick={addTopic} disabled={busy || !topicInput.trim() || draft.preferredTopics.length >= 8} className="min-h-11 rounded-xl border border-[#176b55] px-4 text-sm font-black text-[#176b55] transition hover:bg-[#dff2e8] disabled:cursor-not-allowed disabled:opacity-55">
              Thêm chủ đề
            </button>
          </div>
          <p id="learner-intent-topics-help" className="mt-1.5 text-xs font-bold text-[#748079]">Tối đa 8 chủ đề. Bạn có thể để trống để AI dùng ngữ cảnh bài học hiện có.</p>
          {topicsError && <p id="learner-intent-topics-error" role="alert" className="mt-1.5 text-xs font-bold text-[#c74f47]">{topicsError}</p>}
          {draft.preferredTopics.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Chủ đề đã chọn">
              {draft.preferredTopics.map((topic) => (
                <li key={topic} className="inline-flex items-center gap-1 rounded-full bg-[#eee7da] py-1 pl-3 pr-1 text-xs font-black text-[#52605a]">
                  {topic}
                  <button type="button" onClick={() => removeTopic(topic)} disabled={busy} className="flex h-6 w-6 items-center justify-center rounded-full text-base leading-none hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#176b55] disabled:cursor-not-allowed" aria-label={`Bỏ chủ đề ${topic}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(error || conflict || notice) && (
          <div className="space-y-2" aria-live="polite">
            {error && <p role="alert" className="rounded-xl bg-[#ffe5dc] px-3 py-2 text-sm font-bold text-[#a74640]">{error}{errorCode === "UNAUTHORIZED" && <> <LoginAgainLink /></>}</p>}
            {conflict && <p role="alert" className="rounded-xl bg-[#fff1bd] px-3 py-2 text-sm font-bold text-[#776b48]">{conflict}</p>}
            {notice && <p role="status" className="rounded-xl bg-[#dff2e8] px-3 py-2 text-sm font-bold text-[#176b55]">{notice}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="min-h-12 rounded-2xl bg-[#176b55] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(23,107,85,.18)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Đang lưu…" : "Lưu mục tiêu học"}
          </button>
          <button type="button" onClick={() => void loadIntent(false)} disabled={busy} className="min-h-11 px-2 text-sm font-black text-[#176b55] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60">
            Khôi phục bản đã lưu
          </button>
        </div>
      </form>
    </section>
  );
}

function LoginAgainLink() {
  return <Link href="/login" className="font-black underline underline-offset-2">Đăng nhập lại</Link>;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readIntentError(payload: unknown): { message: string; code: string } {
  if (!isRecord(payload)) return { message: "", code: "" };
  return {
    message: typeof payload.error === "string" ? payload.error : "",
    code: typeof payload.code === "string" ? payload.code : "",
  };
}

function toIntentRequestError(caught: unknown, fallback: string): IntentRequestError {
  if (caught instanceof IntentRequestError) return caught;
  return new IntentRequestError(fallback, "");
}

class IntentRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message);
    this.name = "IntentRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
