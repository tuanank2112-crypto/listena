import {
  LESSON_COACH_SCENARIO_KEY,
  type MissionTemplate,
} from "@/server/ai/mission-templates";
import type {
  MissionState,
  TutorTurnOutput,
} from "@/server/validation/learning-session";

export function createStartMissionFallback(
  template: MissionTemplate,
): TutorTurnOutput {
  return {
    npcReply: `${template.openingLine} ${template.firstPrompt}`,
    coachMessage:
      "Hãy trả lời bằng 1-2 câu tiếng Anh ngắn. Bạn có thể hỏi lại nếu chưa hiểu.",
    pedagogicalAct: "ASK_GUIDING",
    targetSkill: "communication",
    score: 0,
    confidence: 1,
    detectedError: null,
    statePatch: {
      phase: "ENCOUNTER",
      trustDelta: 0,
      evidenceDelta: 0,
      successfulTurn: false,
      recovered: false,
    },
    intervention: null,
    shouldComplete: false,
  };
}

export function createEvaluateTurnFallback(input: {
  state: MissionState;
  learnerMessage: string;
  template: MissionTemplate;
}): TutorTurnOutput {
  const message = normalize(input.learnerMessage);
  const wordCount = message ? message.split(" ").length : 0;
  const hasTargetWord = input.state.targetVocabulary.some((word) =>
    includesPhrase(message, normalize(word)),
  );
  const hasBasicVerb =
    /\b(am|is|are|was|were|have|has|had|want|would|like|lost|need|saw|see|think|order|take|found|find)\b/.test(
      message,
    );
  const question =
    /\?|\b(what|where|when|who|why|how|which|can|could|do|did|is|are)\b/.test(
      message,
    );
  const successful =
    wordCount >= 4 && (hasBasicVerb || hasTargetWord || question);
  const turnAfterThis = input.state.turnCount + 1;
  const atBoss = input.state.phase === "BOSS";
  const shouldComplete = atBoss && successful;
  const nextPhase = shouldComplete
    ? "DEBRIEF"
    : turnAfterThis >= input.state.maxTurns - 1
      ? "BOSS"
      : successful
        ? "CONSEQUENCE"
        : "COMEBACK";

  if (successful) {
    return {
      npcReply: successfulNpcReply(
        input.template,
        message,
        nextPhase,
        matchedTargetWord(input.state.targetVocabulary, message),
      ),
      coachMessage: hasTargetWord
        ? "Bạn đã dùng đúng từ khóa của nhiệm vụ. Tiếp tục nhé!"
        : "Ý đã rõ. Thử dùng thêm một từ khóa của nhiệm vụ ở lượt sau.",
      pedagogicalAct: shouldComplete
        ? "REFLECT"
        : input.template.key === LESSON_COACH_SCENARIO_KEY
          ? "ASK_GUIDING"
          : "CONFIRM",
      targetSkill: "communication",
      score: hasTargetWord ? 0.88 : 0.72,
      confidence: 0.82,
      detectedError: null,
      statePatch: {
        phase: nextPhase,
        trustDelta: hasTargetWord ? 8 : 5,
        evidenceDelta: hasTargetWord ? 10 : 6,
        successfulTurn: true,
        recovered: input.state.phase === "COMEBACK",
      },
      intervention: null,
      shouldComplete,
    };
  }

  const missingVerb = wordCount >= 2 && !hasBasicVerb;
  const target = selectPracticeTarget(input.state.targetVocabulary, message);
  if (input.template.key === LESSON_COACH_SCENARIO_KEY) {
    return {
      npcReply: lessonCoachRepairQuestion(input.template, message),
      coachMessage: missingVerb
        ? "Ý của bạn đã có hướng đúng. Động từ nào sẽ biến ý đó thành một câu đầy đủ?"
        : "Hãy nhìn lại chủ đề bài học và thêm một ý cụ thể bằng câu tiếng Anh đầy đủ.",
      pedagogicalAct: "ASK_GUIDING",
      targetSkill: missingVerb ? "grammar" : "communication",
      score: wordCount >= 2 ? 0.38 : 0.2,
      confidence: 0.78,
      detectedError: {
        type: missingVerb ? "missing_verb" : "insufficient_detail",
        expected: missingVerb
          ? "a verb in a complete sentence"
          : "one complete A2 sentence about the lesson",
        actual: input.learnerMessage.trim().slice(0, 300),
        explanationVi: missingVerb
          ? "Câu tiếng Anh thường cần một động từ để diễn đạt hành động hoặc trạng thái."
          : "Câu trả lời chưa đủ thông tin để kết nối với nội dung bài học.",
      },
      statePatch: {
        phase: "COMEBACK",
        trustDelta: 0,
        evidenceDelta: 1,
        successfulTurn: false,
        recovered: false,
      },
      intervention: {
        type: "FILL_BLANK",
        prompt:
          "Chọn một từ vựng mục tiêu của bài để hoàn thành: This lesson is about ___.",
        spec: { placeholder: "One lesson word" },
        validator: { acceptedAnswers: [target] },
      },
      shouldComplete: false,
    };
  }
  return {
    npcReply: "I understand a little. Can you give me one more detail?",
    coachMessage: missingVerb
      ? "Câu cần một động từ. Hãy thử lại với mẫu: chủ ngữ + động từ + thông tin."
      : "Hãy trả lời bằng một câu đầy đủ gồm ít nhất bốn từ.",
    pedagogicalAct: "INTERVENTION",
    targetSkill: missingVerb ? "grammar" : "communication",
    score: wordCount >= 2 ? 0.38 : 0.2,
    confidence: 0.78,
    detectedError: {
      type: missingVerb ? "missing_verb" : "insufficient_detail",
      expected: missingVerb
        ? "a verb in a complete sentence"
        : "one complete A2 sentence",
      actual: input.learnerMessage.trim().slice(0, 300),
      explanationVi: missingVerb
        ? "Câu tiếng Anh thường cần một động từ để diễn đạt hành động hoặc trạng thái."
        : "Thông tin hiện tại chưa đủ để nhân vật tiếp tục nhiệm vụ.",
    },
    statePatch: {
      phase: "COMEBACK",
      trustDelta: 0,
      evidenceDelta: 1,
      successfulTurn: false,
      recovered: false,
    },
    intervention: {
      type: "USE_IN_SENTENCE",
      prompt: `Hãy viết một câu mới có từ “${target}” để cung cấp thêm thông tin.`,
      spec: { placeholder: "Write one complete sentence..." },
      validator: {
        acceptedAnswers: sentenceStarters(input.template.key, target),
      },
    },
    shouldComplete: false,
  };
}

function successfulNpcReply(
  template: MissionTemplate,
  message: string,
  phase: string,
  targetWord?: string,
) {
  if (template.key === LESSON_COACH_SCENARIO_KEY) {
    const lessonTitle = template.title.replace(/^Lesson Coach: /, "");
    if (phase === "DEBRIEF")
      return `Lesson complete. What idea from "${lessonTitle}" will you use again?`;
    if (phase === "BOSS")
      return `One final question about "${lessonTitle}": how would you use this lesson in real life?`;
    const learnerIdea = quoteLearnerIdea(message);
    if (targetWord)
      return `Good use of "${targetWord}". Why is it important in "${lessonTitle}"?`;
    return `You mentioned "${learnerIdea}". Which detail from the lesson supports that idea?`;
  }
  if (phase === "DEBRIEF")
    return "Mission complete! You gave me the key information. What phrase will you remember?";
  if (phase === "BOSS")
    return "Good. One final question: what is the most important detail?";
  if (template.key === "cafe-order")
    return /bill|pay/.test(message)
      ? "Of course. Would you like to pay by cash or card?"
      : "Great choice. Would you like anything else?";
  if (template.key === "mystery-clue")
    return /where|which|clue|footprint/.test(message)
      ? "Interesting. The footprint goes toward the gym. What do you think happened?"
      : "That may help. Which clue should we check next?";
  return /black|blue|red|small|large|big|colour|color|size/.test(message)
    ? "Thank you. When did you last see it?"
    : "Thank you. What colour and size is the suitcase?";
}

function lessonCoachRepairQuestion(template: MissionTemplate, message: string) {
  const learnerIdea = quoteLearnerIdea(message);
  const lessonTitle = template.title.replace(/^Lesson Coach: /, "");
  return learnerIdea
    ? `You wrote "${learnerIdea}". What verb can connect that idea to "${lessonTitle}"?`
    : `What is one idea you remember from "${lessonTitle}"?`;
}

function matchedTargetWord(targetVocabulary: string[], message: string) {
  return targetVocabulary.find((word) =>
    includesPhrase(message, normalize(word)),
  );
}

function selectPracticeTarget(targetVocabulary: string[], message: string) {
  return (
    targetVocabulary.find(
      (word) => !includesPhrase(message, normalize(word)),
    ) ??
    targetVocabulary[0] ??
    "lesson"
  );
}

function quoteLearnerIdea(message: string) {
  return message.split(" ").filter(Boolean).slice(0, 6).join(" ");
}

function sentenceStarters(scenarioKey: string, target: string) {
  if (scenarioKey === "cafe-order")
    return [`I would like ${target}.`, `Can I have ${target}?`];
  if (scenarioKey === "mystery-clue")
    return [`I found a ${target}.`, `The ${target} is important.`];
  return [`I lost my ${target}.`, `My ${target} is black.`];
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9?'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(value: string, phrase: string) {
  return phrase.length > 1 && ` ${value} `.includes(` ${phrase} `);
}
