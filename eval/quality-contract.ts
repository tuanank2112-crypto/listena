export const QUALITY_DATASET_VERSION = "quality-cases-v1";
export const QUALITY_RUBRIC_VERSION = "quality-rubric-v1";
export const QUALITY_PROMPT_VERSION = "quality-offline-contract-v1";

export const QUALITY_LEVELS = ["A1", "A2", "B1"] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const QUALITY_TURNS = [
  "opening",
  "repair",
  "follow-up",
  "unavailable",
] as const;
export type QualityTurn = (typeof QUALITY_TURNS)[number];

export const QUALITY_TAGS = [
  "vi-transfer",
  "grammar",
  "vocabulary",
  "alternative-answer",
  "hint",
  "answer-leakage",
  "irrelevant",
  "adversarial",
  "comeback",
  "provider-unavailable",
  "pragmatics",
  "server-score",
  "safety",
] as const;
export type QualityTag = (typeof QUALITY_TAGS)[number];

export const QUALITY_EVIDENCE_POLICIES = [
  "RECORD_ONLY_AFTER_SERVER_SCORE",
  "NO_EVIDENCE_UNTIL_REPAIR",
  "NO_EVIDENCE_FOR_UNGROUNDED_OR_ADVERSARIAL",
  "NO_EVIDENCE_PROVIDER_UNAVAILABLE",
] as const;
export type QualityEvidencePolicy =
  (typeof QUALITY_EVIDENCE_POLICIES)[number];

export type QualityCaseContext = {
  scenario: string;
  turn: QualityTurn;
  tags: QualityTag[];
};

export type QualityCase = {
  id: string;
  level: QualityLevel;
  context: QualityCaseContext;
  learnerInput: string;
  acceptableFeedback: string[];
  forbiddenFeedback: string[];
  expectedEvidencePolicy: QualityEvidencePolicy;
  rubricVersion: typeof QUALITY_RUBRIC_VERSION;
};

export type ValidationCheck = {
  id: string;
  passed: boolean;
  message: string;
};

export type ValidatedQualityCase = {
  caseId: string;
  checks: ValidationCheck[];
  value?: QualityCase;
};

export type DatasetValidation = {
  cases: ValidatedQualityCase[];
  checks: ValidationCheck[];
  valid: boolean;
};

const CASE_FIELDS = [
  "id",
  "level",
  "context",
  "learnerInput",
  "acceptableFeedback",
  "forbiddenFeedback",
  "expectedEvidencePolicy",
  "rubricVersion",
] as const;

const REQUIRED_COVERAGE_TAGS: QualityTag[] = [
  "vi-transfer",
  "alternative-answer",
  "answer-leakage",
  "irrelevant",
  "adversarial",
  "comeback",
  "provider-unavailable",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addCheck(
  checks: ValidationCheck[],
  id: string,
  passed: boolean,
  message: string,
) {
  checks.push({ id, passed, message });
}

function readBoundedString(
  value: unknown,
  field: string,
  checks: ValidationCheck[],
  minLength: number,
  maxLength: number,
): string | undefined {
  const passed =
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength;
  addCheck(
    checks,
    `${field}.shape`,
    passed,
    passed
      ? `${field} is a bounded, non-empty string.`
      : `${field} must be a string between ${minLength} and ${maxLength} characters.`,
  );
  return passed ? value.trim() : undefined;
}

function readStringList(
  value: unknown,
  field: string,
  checks: ValidationCheck[],
): string[] | undefined {
  const passed =
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length >= 3 &&
        item.trim().length <= 300,
    );
  addCheck(
    checks,
    `${field}.shape`,
    passed,
    passed
      ? `${field} contains one to five bounded review criteria.`
      : `${field} must contain one to five strings, each 3–300 characters.`,
  );

  if (!passed) {
    return undefined;
  }

  const items = value.map((item) => (item as string).trim());
  const unique = new Set(items.map((item) => item.toLocaleLowerCase("en")));
  addCheck(
    checks,
    `${field}.unique`,
    unique.size === items.length,
    unique.size === items.length
      ? `${field} does not repeat a criterion.`
      : `${field} must not repeat a criterion.`,
  );
  return items;
}

function validateContext(
  value: unknown,
  checks: ValidationCheck[],
): QualityCaseContext | undefined {
  const contextIsRecord = isRecord(value);
  addCheck(
    checks,
    "context.object",
    contextIsRecord,
    contextIsRecord
      ? "context is a structured scenario descriptor."
      : "context must be an object with scenario, turn, and tags.",
  );
  if (!contextIsRecord) {
    return undefined;
  }

  const scenario = readBoundedString(
    value.scenario,
    "context.scenario",
    checks,
    3,
    240,
  );
  const turn = value.turn;
  const validTurn =
    typeof turn === "string" &&
    (QUALITY_TURNS as readonly string[]).includes(turn);
  addCheck(
    checks,
    "context.turn",
    validTurn,
    validTurn
      ? "context.turn is a supported learning-turn state."
      : `context.turn must be one of: ${QUALITY_TURNS.join(", ")}.`,
  );

  const tagsValue = value.tags;
  const tagsAreStrings =
    Array.isArray(tagsValue) &&
    tagsValue.length >= 1 &&
    tagsValue.every(
      (tag) =>
        typeof tag === "string" &&
        (QUALITY_TAGS as readonly string[]).includes(tag),
    );
  addCheck(
    checks,
    "context.tags",
    tagsAreStrings,
    tagsAreStrings
      ? "context.tags use the versioned taxonomy."
      : `context.tags must contain supported tags: ${QUALITY_TAGS.join(", ")}.`,
  );
  if (!scenario || !validTurn || !tagsAreStrings) {
    return undefined;
  }

  const tags = tagsValue as QualityTag[];
  const uniqueTags = new Set(tags);
  addCheck(
    checks,
    "context.tags.unique",
    uniqueTags.size === tags.length,
    uniqueTags.size === tags.length
      ? "context.tags contains no duplicate category."
      : "context.tags must not repeat a category.",
  );

  return {
    scenario,
    turn: turn as QualityTurn,
    tags,
  };
}

function validatePolicyForTags(
  qualityCase: QualityCase,
  checks: ValidationCheck[],
) {
  const tags = new Set(qualityCase.context.tags);
  const expectedPolicy = qualityCase.expectedEvidencePolicy;
  // Some cases deliberately combine a coaching tag (for example `comeback`)
  // with a stricter safety/evidence tag. The most restrictive policy wins.
  const policyRequirement = tags.has("provider-unavailable")
    ? {
        id: "provider-unavailable",
        policy: "NO_EVIDENCE_PROVIDER_UNAVAILABLE" as const,
        message: "A provider-unavailable case cannot claim learning evidence.",
      }
    : tags.has("adversarial") || tags.has("irrelevant")
      ? {
          id: "ungrounded-or-adversarial",
          policy: "NO_EVIDENCE_FOR_UNGROUNDED_OR_ADVERSARIAL" as const,
          message:
            "An irrelevant or adversarial input cannot claim grounded learning evidence.",
        }
      : tags.has("alternative-answer")
        ? {
            id: "alternative-answer",
            policy: "RECORD_ONLY_AFTER_SERVER_SCORE" as const,
            message:
              "An alternative answer needs server scoring before evidence is recorded.",
          }
        : tags.has("comeback") || tags.has("answer-leakage")
          ? {
              id: "repair-boundary",
              policy: "NO_EVIDENCE_UNTIL_REPAIR" as const,
              message:
                "A comeback or hint/leakage boundary waits for a learner repair before evidence.",
            }
          : undefined;

  if (policyRequirement) {
    addCheck(
      checks,
      `evidence-policy.${policyRequirement.id}`,
      expectedPolicy === policyRequirement.policy,
      expectedPolicy === policyRequirement.policy
        ? policyRequirement.message
        : `${policyRequirement.message} Expected ${policyRequirement.policy}, received ${expectedPolicy}.`,
    );
  }
}

export function parseQualityDataset(source: string): unknown[] {
  const lines = source.trim().split(/\r?\n/);
  if (lines.length === 1 && lines[0] === "") {
    throw new Error("Quality dataset is empty.");
  }

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Invalid JSON in quality dataset at line ${index + 1}.`);
    }
  });
}

export function validateQualityCase(
  value: unknown,
  lineNumber: number,
): ValidatedQualityCase {
  const checks: ValidationCheck[] = [];
  const record = isRecord(value) ? value : undefined;
  addCheck(
    checks,
    "record.object",
    Boolean(record),
    record ? "Case is an object." : "Each JSONL line must be an object.",
  );
  if (!record) {
    return { caseId: `line-${lineNumber}`, checks };
  }

  const unexpectedFields = Object.keys(record).filter(
    (field) => !(CASE_FIELDS as readonly string[]).includes(field),
  );
  addCheck(
    checks,
    "record.exact-fields",
    unexpectedFields.length === 0,
    unexpectedFields.length === 0
      ? "Case has only the versioned contract fields."
      : `Unexpected fields: ${unexpectedFields.join(", ")}.`,
  );

  const id = readBoundedString(record.id, "id", checks, 6, 80);
  const validId = Boolean(id && /^qv1-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
  addCheck(
    checks,
    "id.format",
    validId,
    validId
      ? "id uses the qv1 stable identifier format."
      : "id must match qv1-[a-z0-9-]+.",
  );

  const level = record.level;
  const validLevel =
    typeof level === "string" &&
    (QUALITY_LEVELS as readonly string[]).includes(level);
  addCheck(
    checks,
    "level.enum",
    validLevel,
    validLevel
      ? "level is represented in the supported range."
      : `level must be one of: ${QUALITY_LEVELS.join(", ")}.`,
  );

  const context = validateContext(record.context, checks);
  const learnerInput = readBoundedString(
    record.learnerInput,
    "learnerInput",
    checks,
    1,
    800,
  );
  const acceptableFeedback = readStringList(
    record.acceptableFeedback,
    "acceptableFeedback",
    checks,
  );
  const forbiddenFeedback = readStringList(
    record.forbiddenFeedback,
    "forbiddenFeedback",
    checks,
  );

  const expectedEvidencePolicy = record.expectedEvidencePolicy;
  const validEvidencePolicy =
    typeof expectedEvidencePolicy === "string" &&
    (QUALITY_EVIDENCE_POLICIES as readonly string[]).includes(
      expectedEvidencePolicy,
    );
  addCheck(
    checks,
    "expectedEvidencePolicy.enum",
    validEvidencePolicy,
    validEvidencePolicy
      ? "expectedEvidencePolicy uses a supported server-evidence contract."
      : `expectedEvidencePolicy must be one of: ${QUALITY_EVIDENCE_POLICIES.join(", ")}.`,
  );

  const validRubricVersion = record.rubricVersion === QUALITY_RUBRIC_VERSION;
  addCheck(
    checks,
    "rubricVersion.exact",
    validRubricVersion,
    validRubricVersion
      ? "Case uses the current human-review rubric."
      : `rubricVersion must be ${QUALITY_RUBRIC_VERSION}.`,
  );

  if (acceptableFeedback && forbiddenFeedback) {
    const accepted = new Set(
      acceptableFeedback.map((item) => item.toLocaleLowerCase("en")),
    );
    const overlap = forbiddenFeedback.filter((item) =>
      accepted.has(item.toLocaleLowerCase("en")),
    );
    addCheck(
      checks,
      "feedback.no-overlap",
      overlap.length === 0,
      overlap.length === 0
        ? "Acceptable and forbidden feedback criteria are disjoint."
        : "Acceptable and forbidden feedback criteria must be disjoint.",
    );
  }

  if (
    !id ||
    !validId ||
    !validLevel ||
    !context ||
    !learnerInput ||
    !acceptableFeedback ||
    !forbiddenFeedback ||
    !validEvidencePolicy ||
    !validRubricVersion
  ) {
    return { caseId: id ?? `line-${lineNumber}`, checks };
  }

  const qualityCase: QualityCase = {
    id,
    level: level as QualityLevel,
    context,
    learnerInput,
    acceptableFeedback,
    forbiddenFeedback,
    expectedEvidencePolicy: expectedEvidencePolicy as QualityEvidencePolicy,
    rubricVersion: QUALITY_RUBRIC_VERSION,
  };
  validatePolicyForTags(qualityCase, checks);

  return { caseId: qualityCase.id, checks, value: qualityCase };
}

export function validateQualityDataset(records: unknown[]): DatasetValidation {
  const cases = records.map((record, index) =>
    validateQualityCase(record, index + 1),
  );
  const checks: ValidationCheck[] = [];

  addCheck(
    checks,
    "dataset.minimum-case-count",
    cases.length >= 30,
    cases.length >= 30
      ? "Dataset has at least 30 review cases."
      : `Dataset needs at least 30 cases; found ${cases.length}.`,
  );

  const validCases = cases.flatMap((entry) => (entry.value ? [entry.value] : []));
  const duplicateIds = validCases.filter(
    (qualityCase, index) =>
      validCases.findIndex((candidate) => candidate.id === qualityCase.id) !== index,
  );
  addCheck(
    checks,
    "dataset.unique-ids",
    duplicateIds.length === 0,
    duplicateIds.length === 0
      ? "All valid case ids are unique."
      : `Duplicate ids: ${[...new Set(duplicateIds.map((item) => item.id))].join(", ")}.`,
  );

  for (const level of QUALITY_LEVELS) {
    const count = validCases.filter((qualityCase) => qualityCase.level === level)
      .length;
    addCheck(
      checks,
      `dataset.level.${level}`,
      count > 0,
      count > 0
        ? `Dataset covers ${level}.`
        : `Dataset must contain at least one ${level} case.`,
    );
  }

  const tagSet = new Set(validCases.flatMap((qualityCase) => qualityCase.context.tags));
  for (const tag of REQUIRED_COVERAGE_TAGS) {
    addCheck(
      checks,
      `dataset.coverage.${tag}`,
      tagSet.has(tag),
      tagSet.has(tag)
        ? `Dataset includes required ${tag} coverage.`
        : `Dataset must include a ${tag} case.`,
    );
  }

  const valid =
    checks.every((check) => check.passed) &&
    cases.every((entry) => entry.checks.every((check) => check.passed));
  return { cases, checks, valid };
}
