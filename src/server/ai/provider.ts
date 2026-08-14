/**
 * AI Provider interface and implementations.
 * Supports mock mode (no API key needed) and OpenAI-compatible API.
 */

import type { AIFeedbackResponse, AILessonDraft } from "../validation/schemas";
import { AIFeedbackResponseSchema, AILessonDraftSchema } from "../validation/schemas";
import logger from "@/lib/logger";

// ── Types ────────────────────────────────────────────

export interface AIProviderConfig {
  provider: "mock" | "openai";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AIErrorAnalysisParams {
  transcript: string;
  submittedAnswer: string;
  wordDiffs: Array<{ type: string; expected: string | null; actual: string | null }>;
  cefrLevel: string;
  errorTypes: string[];
}

export interface AILessonGenerationParams {
  topic: string;
  cefrLevel: string;
  learningObjectives: string[];
  targetVocabulary?: string[];
  targetGrammar?: string[];
  audioDuration?: number;
  accent?: string;
  difficulty?: number;
}

export interface AIProvider {
  analyzeErrors(params: AIErrorAnalysisParams): Promise<AIFeedbackResponse>;
  generateLesson(params: AILessonGenerationParams): Promise<AILessonDraft>;
  generateTutoringFeedback(
    transcript: string,
    answer: string,
    score: number
  ): Promise<{ tip: string }>;
}

// ── Mock AI Provider ─────────────────────────────────

const MOCK_FEEDBACK: AIFeedbackResponse = {
  summaryVi: "Bạn đã nghe được phần lớn nội dung. Có một vài từ cần chú ý thêm về phát âm và chính tả.",
  errors: [
    {
      errorType: "SPELLING",
      expected: "beautiful",
      actual: "beatiful",
      probableCauseVi: "Có thể bạn chưa quen với cách viết của từ 'beautiful'.",
      explanationVi: "Từ 'beautiful' có chứa 'eau' nhưng đọc là /ˈbjuːtɪfəl/. Lỗi chính tả phổ biến.",
      microExercise: {
        type: "FLASHCARD",
        instructionVi: "Ôn lại từ 'beautiful' với flashcard.",
        items: ["beautiful", "beautiful /ˈbjuːtɪfəl/", "xinh đẹp"],
      },
      confidence: 0.85,
    },
    {
      errorType: "UNKNOWN",
      expected: "the",
      actual: null,
      probableCauseVi: "Bạn có thể đã bỏ qua từ 'the' vì nó ngắn và không được nhấn mạnh.",
      explanationVi: "Từ 'the' là mạo từ xác định, thường không được nhấn mạnh trong câu nói, dễ bị bỏ qua khi nghe.",
      microExercise: {
        type: "RELISTEN",
        instructionVi: "Nghe lại đoạn này và chú ý đến từ 'the'.",
        items: ["the"],
      },
      confidence: 0.9,
    },
  ],
  recommendedActions: [
    "Ôn lại từ vựng trong bài",
    "Luyện nghe các câu có chứa mạo từ 'the'",
    "Tập viết chính tả các từ có chứa 'eau'",
  ],
};

const MOCK_LESSON_DRAFT: AILessonDraft = {
  title: "A Day at the Beach",
  transcript: "Last weekend, my family went to the beach. The weather was beautiful. We swam in the sea and built sandcastles. My little sister found some shells. We had lunch at a small restaurant near the beach. Everyone was happy.",
  segments: [
    { position: 1, text: "Last weekend, my family went to the beach.", difficulty: 1.0 },
    { position: 2, text: "The weather was beautiful.", difficulty: 1.0 },
    { position: 3, text: "We swam in the sea and built sandcastles.", difficulty: 1.2 },
    { position: 4, text: "My little sister found some shells.", difficulty: 1.0 },
    { position: 5, text: "We had lunch at a small restaurant near the beach.", difficulty: 1.3 },
    { position: 6, text: "Everyone was happy.", difficulty: 0.8 },
  ],
  vocabulary: [
    {
      lemma: "beach",
      displayText: "beach",
      ipa: "/biːtʃ/",
      meaningVi: "bãi biển",
      meaningEn: "a shore of a body of water",
      partOfSpeech: "noun",
      cefrLevel: "A1",
      exampleSentence: "We went to the beach.",
    },
    {
      lemma: "sandcastle",
      displayText: "sandcastle",
      ipa: "/ˈsændkæsl/",
      meaningVi: "lâu đài cát",
      meaningEn: "a model of a castle built in sand",
      partOfSpeech: "noun",
      cefrLevel: "A2",
      exampleSentence: "The children built sandcastles.",
    },
  ],
  exercises: [
    {
      type: "GIST",
      prompt: "What did the family do last weekend?",
      correctAnswer: "They went to the beach.",
      difficulty: 1.0,
      position: 1,
    },
    {
      type: "PARTIAL_DICTATION",
      prompt: "The weather was ______.",
      correctAnswer: "beautiful",
      difficulty: 1.0,
      position: 2,
    },
    {
      type: "FULL_DICTATION",
      prompt: "Write the full sentence you hear.",
      correctAnswer: "We swam in the sea and built sandcastles.",
      difficulty: 1.2,
      position: 3,
    },
  ],
};

export class MockAIProvider implements AIProvider {
  async analyzeErrors(_params: AIErrorAnalysisParams): Promise<AIFeedbackResponse> {
    // Simulate processing delay
    await new Promise((r) => setTimeout(r, 300));
    logger.info({ purpose: "mock_ai_error_analysis" }, "Mock AI error analysis");
    return MOCK_FEEDBACK;
  }

  async generateLesson(_params: AILessonGenerationParams): Promise<AILessonDraft> {
    await new Promise((r) => setTimeout(r, 500));
    logger.info({ purpose: "mock_ai_lesson_generation" }, "Mock AI lesson generation");
    return MOCK_LESSON_DRAFT;
  }

  async generateTutoringFeedback(
    _transcript: string,
    _answer: string,
    score: number
  ): Promise<{ tip: string }> {
    await new Promise((r) => setTimeout(r, 200));
    const tip =
      score >= 80
        ? "Excellent work! You're making great progress."
        : score >= 60
          ? "Good effort! Focus on the words you missed."
          : "Keep practicing! Try listening again at a slower speed.";
    return { tip };
  }
}

// ── OpenAI-Compatible AI Provider ────────────────────

export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async analyzeErrors(params: AIErrorAnalysisParams): Promise<AIFeedbackResponse> {
    const prompt = this.buildErrorAnalysisPrompt(params);
    const result = await this.callAI(prompt, AIFeedbackResponseSchema);
    return result;
  }

  async generateLesson(params: AILessonGenerationParams): Promise<AILessonDraft> {
    const prompt = this.buildLessonGenerationPrompt(params);
    const result = await this.callAI(prompt, AILessonDraftSchema);
    return result;
  }

  async generateTutoringFeedback(
    _transcript: string,
    _answer: string,
    _score: number
  ): Promise<{ tip: string }> {
    return { tip: "Keep up the good work!" };
  }

  private async callAI<T>(
    messages: Array<{ role: string; content: string }>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(
        { status: response.status, error, latencyMs: Date.now() - startTime },
        "OpenAI API call failed"
      );
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in AI response");
    }

    const parsed = schema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      logger.warn(
        { validationError: parsed.error.format(), content },
        "AI response validation failed, retrying"
      );
      // Retry once
      const retryResponse = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      const retryData = await retryResponse.json();
      const retryContent = retryData.choices?.[0]?.message?.content;
      if (retryContent) {
        const retryParsed = schema.safeParse(JSON.parse(retryContent));
        if (retryParsed.success) {
          logger.info(
            { latencyMs: Date.now() - startTime, model: this.model },
            "AI call successful (retry)"
          );
          return retryParsed.data;
        }
      }
      throw new Error("AI response validation failed after retry");
    }

    logger.info(
      { latencyMs: Date.now() - startTime, model: this.model },
      "AI call successful"
    );
    return parsed.data;
  }

  private buildErrorAnalysisPrompt(params: AIErrorAnalysisParams): Array<{ role: string; content: string }> {
    return [
      {
        role: "system",
        content: `You are an English listening tutor for Vietnamese learners. Analyze the dictation errors and provide feedback in Vietnamese.

Return a JSON object with this exact structure:
{
  "summaryVi": "string - brief summary of overall performance",
  "errors": [
    {
      "errorType": "PHONOLOGICAL | SEGMENTATION | GRAMMAR | VOCABULARY | SPELLING | UNKNOWN",
      "expected": "string - the correct word",
      "actual": "string | null - what the learner wrote",
      "probableCauseVi": "string - probable cause in Vietnamese",
      "explanationVi": "string - explanation in Vietnamese",
      "microExercise": {
        "type": "RELISTEN | MINIMAL_PAIR | FILL_BLANK | REPEAT | FLASHCARD",
        "instructionVi": "string",
        "items": ["string"]
      } | null,
      "confidence": 0.0-1.0
    }
  ],
  "recommendedActions": ["string"]
}

Rules:
- Be concise and level-appropriate
- Don't invent pronunciation rules
- Distinguish spelling errors from listening errors
- Always include actionable micro-exercises
- If confidence is low, say so
- Use Vietnamese for all explanations`,
      },
      {
        role: "user",
        content: JSON.stringify({
          transcript: params.transcript,
          submittedAnswer: params.submittedAnswer,
          wordDiffs: params.wordDiffs,
          cefrLevel: params.cefrLevel,
          errorTypes: params.errorTypes,
        }),
      },
    ];
  }

  private buildLessonGenerationPrompt(params: AILessonGenerationParams): Array<{ role: string; content: string }> {
    return [
      {
        role: "system",
        content: `You are an English lesson content creator for Vietnamese learners. Generate a listening lesson draft based on the given parameters.

Return a JSON object with this exact structure:
{
  "title": "string",
  "transcript": "string - 80-120 words",
  "segments": [
    { "position": 1, "text": "string", "difficulty": 1.0 }
  ],
  "vocabulary": [
    {
      "lemma": "string",
      "displayText": "string",
      "ipa": "string",
      "meaningVi": "string",
      "meaningEn": "string",
      "partOfSpeech": "string",
      "cefrLevel": "A1|A2|B1|B2|C1|C2",
      "exampleSentence": "string"
    }
  ],
  "exercises": [
    {
      "type": "GIST|PARTIAL_DICTATION|FULL_DICTATION|VOCABULARY",
      "prompt": "string",
      "correctAnswer": "string",
      "difficulty": 1.0,
      "position": 1
    }
  ]
}`,
      },
      {
        role: "user",
        content: JSON.stringify(params),
      },
    ];
  }
}

// ── Factory ──────────────────────────────────────────

export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.provider === "openai" && config.apiKey) {
    logger.info({ provider: "openai", model: config.model }, "Using OpenAI AI provider");
    return new OpenAIProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }
  logger.info({ provider: "mock" }, "Using Mock AI provider");
  return new MockAIProvider();
}
