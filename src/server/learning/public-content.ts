import "server-only";

import type { TutorTurnOutput } from "@/server/validation/learning-session";
import { splitIntervention } from "@/server/learning/intervention";

export function toPublicTutorContent(output: TutorTurnOutput) {
  return {
    npcReply: output.npcReply,
    coachMessage: output.coachMessage,
    pedagogicalAct: output.pedagogicalAct,
    targetSkill: output.targetSkill,
    score: output.score,
    confidence: output.confidence,
    detectedError: output.detectedError
      ? {
          type: output.detectedError.type,
          actual: output.detectedError.actual,
          explanationVi: output.detectedError.explanationVi,
        }
      : null,
    intervention: output.intervention
      ? splitIntervention(output.intervention).public
      : null,
    shouldComplete: output.shouldComplete,
  };
}
