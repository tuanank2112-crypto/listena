"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles, Trash2, Wand2 } from "lucide-react";
import { StartSessionButton } from "@/features/learning-session/start-session-button";

interface ScenarioView {
  id: string;
  key: string;
  title: string;
  npcName: string;
  npcRole: string;
  summaryVi: string;
  learnerGoal: string;
  targetVocabulary: string[];
  createdAt: string;
}

const MAX_PROMPT = 240;

/**
 * Plan23 SPEC-P234 — "Chủ đề của bạn".
 *
 * The product shipped with three situations fixed in code while the learner had
 * already told it what they cared about and was ignored. Here they say what they
 * want to practise and the AI writes the situation for them, at their level and
 * around the words they keep missing.
 *
 * Nothing here grades anything. A scenario is a setting for a Mission; the
 * Mission is still started, scoped and marked by the server.
 */
export function MyScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioView[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learner/mission-scenarios")
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((body) => { if (!cancelled) setScenarios(body.scenarios ?? []); })
      // A learner can still play the built-in situations; an empty list is a
      // better failure here than an error nobody can act on.
      .catch(() => { if (!cancelled) setScenarios([]); });
    return () => { cancelled = true; };
  }, []);

  async function create() {
    const text = prompt.trim();
    if (creating || text.length < 6) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/learner/mission-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Chưa tạo được chủ đề.");
      setScenarios((current) => [body.scenario, ...(current ?? [])]);
      setPrompt("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa tạo được chủ đề.");
    } finally {
      setCreating(false);
    }
  }

  async function archive(id: string) {
    const response = await fetch(`/api/learner/mission-scenarios/${id}`, { method: "DELETE" });
    if (response.ok) setScenarios((current) => (current ?? []).filter((item) => item.id !== id));
  }

  return (
    <section className="mt-10 border-t border-[#ded8cc] pt-8" aria-labelledby="my-scenarios-heading">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#5c6fb3]">Your own story</p>
        <h2 id="my-scenarios-heading" className="mt-1 text-2xl font-black tracking-[-.04em]">Chủ đề của bạn</h2>
        <p className="mt-1 text-sm font-bold text-[#7b857f]">
          Nói bạn muốn tập tình huống nào, AI viết ra một cuộc hội thoại vừa sức bạn — dùng cả những từ bạn hay sai.
        </p>
      </div>

      <div className="paper-card rounded-[28px] p-5">
        <label htmlFor="scenario-prompt" className="text-sm font-black">Bạn muốn tập tình huống gì?</label>
        <textarea
          id="scenario-prompt"
          value={prompt}
          maxLength={MAX_PROMPT}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          placeholder="Ví dụ: gọi món ở tiệm bánh mì, hỏi đường tới bến xe, phỏng vấn xin việc part-time…"
          className="mt-2 w-full resize-none rounded-2xl border-2 border-[#ded8cc] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#176b55]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-[#9aa19d]">{prompt.trim().length}/{MAX_PROMPT} · tiếng Việt cũng được</span>
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating || prompt.trim().length < 6}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#5c6fb3] px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {creating ? "AI đang viết…" : "Tạo chủ đề"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-bold text-[#d6534d]">{error}</p>}
      </div>

      {scenarios === null && <div className="mt-4 h-28 animate-pulse rounded-[28px] bg-[#eee7da]" aria-hidden />}

      {scenarios !== null && scenarios.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <article key={scenario.id} data-scenario={scenario.key} className="paper-card flex min-h-[260px] flex-col rounded-[28px] p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e4e8f7] text-[#5c6fb3]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <button
                  type="button"
                  onClick={() => void archive(scenario.id)}
                  className="shrink-0 rounded-lg p-2 text-[#9aa19d] transition hover:bg-[#ffe1de] hover:text-[#d6534d]"
                  aria-label={`Xoá chủ đề ${scenario.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-4 break-words text-xl font-black tracking-[-.03em]">{scenario.title}</h3>
              <p className="mt-1 text-[11px] font-black uppercase tracking-[.1em] text-[#5c6fb3]">
                {scenario.npcName} · {scenario.npcRole}
              </p>
              <p className="mt-2 flex-1 break-words text-sm font-bold leading-6 text-[#7b857f]">{scenario.summaryVi}</p>
              <StartSessionButton
                mode="MISSION"
                scenarioKey={scenario.key}
                goal={scenario.learnerGoal}
                label="Vào vai"
                className="mt-4 [&_button]:w-full"
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
