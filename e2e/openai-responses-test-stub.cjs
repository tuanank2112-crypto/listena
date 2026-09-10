"use strict";

/**
 * Test-process-only Responses API double. Playwright preloads this file into
 * the Next dev server; production application modules never import it and
 * never select a deterministic provider from their environment.
 */
const nativeFetch = globalThis.fetch;
const RESPONSES_URL = "https://api.openai.com/v1/responses";
let responseSequence = 0;

if (typeof nativeFetch !== "function") {
  throw new Error("E2E Responses stub requires the Node fetch implementation.");
}

globalThis.fetch = async function e2eResponsesFetch(input, init) {
  const url = requestUrl(input);
  if (url !== RESPONSES_URL) return nativeFetch(input, init);

  if (init?.method !== "POST") {
    throw new Error("Unexpected non-POST request to the E2E Responses stub.");
  }

  const payload = parseJson(init.body);
  if (payload?.text?.format?.name !== "tutor_turn") {
    throw new Error("Unexpected non-tutor Responses request in the E2E stub.");
  }

  const tutorInput = parseJson(payload.input);
  const output = makeTutorOutput(tutorInput);
  responseSequence += 1;
  return new Response(
    JSON.stringify({
      id: `resp_e2e_${responseSequence}`,
      status: "completed",
      output_text: JSON.stringify(output),
    }),
    {
      status: 200,
      headers: { "x-request-id": `req_e2e_${responseSequence}` },
    },
  );
};

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input && typeof input.url === "string" ? input.url : "";
}

function parseJson(value) {
  if (typeof value !== "string") {
    throw new Error("Unexpected non-string JSON body in the E2E Responses stub.");
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON body in the E2E Responses stub.");
  }
}

function makeTutorOutput(input) {
  if (input?.operation === "START_MISSION") {
    return {
      npcReply: "Hello! Tell me what you need today.",
      coachMessage: "",
      pedagogicalAct: "ASK_GUIDING",
      targetSkill: "communication",
      score: 0,
      confidence: 0.9,
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

  const missionState = asObject(input?.missionState);
  const learnerMessage = typeof input?.learnerMessage === "string"
    ? input.learnerMessage.trim()
    : "";
  const targetVocabulary = Array.isArray(missionState.targetVocabulary)
    ? missionState.targetVocabulary.filter((word) => typeof word === "string")
    : [];
  const hasTargetWord = targetVocabulary.some((word) =>
    learnerMessage.toLowerCase().includes(word.toLowerCase()),
  );
  const successful = hasTargetWord && learnerMessage.split(/\s+/).length >= 4;
  const isBoss = missionState.phase === "BOSS";

  return {
    npcReply: successful
      ? "Thanks. That helps me understand. What happened next?"
      : "I need one more detail. Can you use a full sentence?",
    coachMessage: successful
      ? "Tốt lắm, hãy tiếp tục bằng một câu ngắn."
      : "Hãy thêm chủ ngữ và động từ.",
    pedagogicalAct: successful ? "CONFIRM" : "ASK_GUIDING",
    targetSkill: "communication",
    score: successful ? 0.82 : 0.35,
    confidence: 0.9,
    detectedError: null,
    statePatch: {
      phase: successful && isBoss ? "DEBRIEF" : successful ? "CONSEQUENCE" : "COMEBACK",
      trustDelta: successful ? 6 : 0,
      evidenceDelta: successful ? 7 : 1,
      successfulTurn: successful,
      recovered: false,
    },
    intervention: null,
    shouldComplete: successful && isBoss,
  };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
