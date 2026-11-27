import { formatEntitlementPayload } from "../_shared/entitlement.ts";
import {
  CLASSIFICATION_MODELS,
  type GenerateWithFallbackOptions,
  generateWithFallback,
} from "../_shared/gemini.ts";
import { jsonResponse } from "../_shared/http.ts";
import { type AuthorizeAiRequestRow, formatQuotaPayload } from "../_shared/quota.ts";
import { sanitizePromptText } from "./prompt.ts";
import {
  type ClassifyActionRequestDto,
  createExerciseCleanupJsonSchema,
  type ExerciseCleanupResult,
  parseClassifyResponse,
} from "./schemas.ts";

export function buildClassifyPrompt(
  exerciseNames: readonly string[],
  muscleGroupsList: readonly string[],
): string {
  const muscleGroupsPromptList = muscleGroupsList
    .map((m) => sanitizePromptText(m).slice(0, 60))
    .filter(Boolean)
    .join(", ");
  return `You are a fitness data expert. For each exercise name in the list below, classify it:

Assign the primary muscle group and any significant secondary muscles. Use only: ${muscleGroupsPromptList}.

Exercise names to process:
${exerciseNames.map((n, i) => `${i + 1}. ${sanitizePromptText(n).slice(0, 120)}`).join("\n")}

Important rules:
- Classify ALL exercises in the list, including locale variants (e.g. "Bankdrücken", "RDL") — assign their muscles directly, do not redirect to a canonical name.
- Never output duplicate entries.
- Muscle group values must exactly match the allowed list.
- Set confidence < 0.8 only when genuinely ambiguous (e.g. "Press" with no context).`;
}

export async function executeClassifyAction(
  dto: ClassifyActionRequestDto,
  geminiApiKey: string,
  authRow: AuthorizeAiRequestRow,
  generateFn: <T>(
    options: GenerateWithFallbackOptions<T>,
  ) => Promise<{ data: T; model: string }> = generateWithFallback,
): Promise<Response> {
  const classifyPrompt = buildClassifyPrompt(dto.exerciseNames, dto.muscleGroups);
  const result = await generateFn<ExerciseCleanupResult>({
    geminiApiKey,
    models: CLASSIFICATION_MODELS,
    contents: [{ role: "user", parts: [{ text: classifyPrompt }] }],
    responseJsonSchema: createExerciseCleanupJsonSchema(dto.muscleGroups),
    temperature: 0.1,
    thinkingConfig: { level: "minimal", includeThoughts: false },
    timeoutMs: 30_000,
    parseResponse: parseClassifyResponse,
  });

  return jsonResponse({
    text: JSON.stringify(result.data),
    quota: formatQuotaPayload(authRow),
    entitlement: formatEntitlementPayload(authRow),
  });
}
