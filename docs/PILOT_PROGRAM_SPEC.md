# ListenAI — Consented Learner Pilot Program Specification (P116/P125)

## 1. Overview & Learning Hypothesis

This specification governs the formative, consented pilot study for ListenAI 1.0.0. The objective is to evaluate whether the AI-native learning loop (Mission, Lesson Coach, Daily Quest, and Causal Next Action) effectively supports adult Vietnamese learners (CEFR A1–A2) in self-correcting communicative errors and transferring skills to unassisted contextual tasks.

> [!IMPORTANT]
> **Governance Invariant:** Agents are strictly forbidden from contacting real individuals, sending recruitment emails, or enrolling participants without explicit, recorded human authorization. Real participant data must remain pseudonymous and never be committed to git repositories or agent memory.

---

## 2. Participant Profile & Cohort Size

- **Target Segment:** 5–8 consenting adult learners.
- **Language Profile:** Native Vietnamese speakers with beginner to elementary English proficiency (CEFR A1–A2 self-reported or diagnostic-calibrated).
- **Session Duration:** 10–15 minutes per session.
- **Identifiers:** Pseudonymized as `learner-p01` through `learner-p08`. Real names, emails, and phone numbers are stored outside the code repository.

---

## 3. Protocol Timeline (14-Day Cycle)

```text
Day 0: Intake, Informed Consent & Unassisted Baseline Task
  │
Day 1–6: Learning Loop Phase (≥3 active sessions with Socratic Coach)
  │
Day 7: Unassisted Transfer Task (Parallel Scenario)
  │
Day 8–13: Rest Period (No structured app intervention)
  │
Day 14: Delayed Retention Task (Follow-up Retention Probe)
```

1. **Day 0 (Baseline):**
   - Participant signs informed consent outlining data usage, AI provider sharing, and withdrawal policy.
   - Completes unassisted baseline scenario (e.g. "Reporting a missing item at airport" with no AI hints or comeback drills enabled).
2. **Days 1–6 (Formative Learning):**
   - Minimum 3 completed sessions driven by the causal next action planner (`p11-v1`).
   - Socratic hints, comeback turns, and spaced review flashcards are active.
3. **Day 7 (Immediate Transfer):**
   - Completes a parallel, unassisted task in a novel context (e.g. "Hotel check-in or ordering at a train station").
   - Assesses whether error corrections transfer outside the trained scenario.
4. **Day 14 (Delayed Retention):**
   - Completes an unassisted follow-up task 7 days after the transfer test to measure retention degradation vs permanence.

---

## 4. Assessment Rubric & Quantitative Metrics

Each unassisted task (Baseline, Transfer, Delayed) is scored by independent human reviewers across 5 metrics:

1. **Contextual Task Completion (`0 | 1 | 2`):**
   - `0`: Failed to achieve goal.
   - `1`: Partially achieved with significant ambiguity.
   - `2`: Fully completed communicative objective.
2. **Comprehensibility (`0 | 1 | 2`):**
   - `0`: Incomprehensible or requires Vietnamese translation.
   - `1`: Understandable with effort despite lexical/grammatical errors.
   - `2`: Fluent and easily understood.
3. **Target Error Count:** Number of recurring grammar/vocabulary errors observed during the session.
4. **Assistance Dependency:** Count of hint requests and recovery turns during formative sessions.
5. **Completion Time:** Total minutes from task start to completion.

---

## 5. Data Privacy & Ethical Safeguards

- **Informed Consent:** Explicit consent must be obtained before any session recording begins.
- **Data Deletion & Retention:** Raw interaction logs from pilot participants are retained for maximum 30 days and deleted upon participant request.
- **No Marketing Claims:** Results from 5–8 participants are formative feasibility signals. They do NOT constitute statistical proof of causal efficacy, CEFR certification, or general product claims.
