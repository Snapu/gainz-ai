const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const COACHING_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
] as const;

export const CLASSIFICATION_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite"] as const;

export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiThinkingConfig {
  thinkingBudget: number;
  includeThoughts: boolean;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

export class RetryableModelError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "RetryableModelError";
    this.code = code;
  }
}

export class NonRetryableModelError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`upstream-http-${status}`);
    this.name = "NonRetryableModelError";
    this.status = status;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

function extractTextAndFinishReason(payload: unknown): {
  text: string;
  finishReason?: string;
} {
  if (!payload || typeof payload !== "object") return { text: "" };
  const candidates = (
    payload as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    }
  ).candidates;
  const candidate = candidates?.[0];
  const parts = candidate?.content?.parts;
  const finishReason = candidate?.finishReason;
  if (!Array.isArray(parts)) return { text: "", finishReason };

  const textParts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part.text !== "string") continue;
    if (part.thought !== true) {
      textParts.push(part.text);
    }
  }

  return {
    text: textParts.join("").trim(),
    finishReason,
  };
}

export function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\r?\n?/, "")
      .replace(/\r?\n?```$/, "")
      .trim();
  }
  return trimmed;
}

function computeAttemptTimeoutMs(
  deadlineMs: number,
  totalTimeoutMs: number,
  attemptIndex: number,
  remainingModels: number,
): number {
  const remainingBudgetMs = deadlineMs - Date.now();
  if (remainingBudgetMs <= 1000) return 0;
  if (remainingModels <= 1) return remainingBudgetMs;
  if (attemptIndex === 0) {
    return Math.min(remainingBudgetMs, Math.ceil(totalTimeoutMs * 0.55));
  }
  return Math.max(3000, Math.floor(remainingBudgetMs / remainingModels));
}

export function buildGeminiRequestBody(options: {
  contents: GeminiContent[];
  systemInstruction?: string;
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
  topP?: number;
  thinkingConfig?: GeminiThinkingConfig;
}): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: options.responseJsonSchema,
    temperature: options.temperature,
  };
  if (options.topP !== undefined) {
    generationConfig.topP = options.topP;
  }
  if (options.thinkingConfig) {
    generationConfig.thinkingConfig = options.thinkingConfig;
  }

  const requestBody: Record<string, unknown> = {
    contents: options.contents,
    generationConfig,
  };

  if (options.systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  return requestBody;
}

async function callSingleGeminiModel<T>(
  model: string,
  geminiApiKey: string,
  requestBody: Record<string, unknown>,
  attemptTimeoutMs: number,
  parseResponse: (parsedJson: unknown) => T,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);

  try {
    const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      await res.text().catch(() => "");
      if (isRetryableStatus(res.status)) {
        throw new RetryableModelError(`upstream-http-${res.status}`);
      }
      throw new NonRetryableModelError(res.status);
    }

    const payload = await res.json();
    const { text, finishReason } = extractTextAndFinishReason(payload);
    if (!text) {
      throw new RetryableModelError("empty-response");
    }
    if (finishReason && finishReason !== "STOP") {
      throw new RetryableModelError(`finish-${finishReason}`);
    }

    const cleanJsonText = stripMarkdownCodeFences(text);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanJsonText);
    } catch {
      throw new RetryableModelError("invalid-json");
    }

    try {
      return parseResponse(parsedJson);
    } catch {
      throw new RetryableModelError("schema-validation-failed");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableFailure(err: unknown): boolean {
  if (err instanceof RetryableModelError) return true;
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError" || err.name === "TypeError")
  );
}

export interface GenerateWithFallbackOptions<T> {
  geminiApiKey: string;
  models: readonly string[];
  contents: GeminiContent[];
  systemInstruction?: string;
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
  topP?: number;
  thinkingConfig?: GeminiThinkingConfig;
  timeoutMs: number;
  parseResponse: (parsedJson: unknown) => T;
}

export async function generateWithFallback<T>(
  options: GenerateWithFallbackOptions<T>,
): Promise<{ data: T; model: string }> {
  const { geminiApiKey, models, timeoutMs, parseResponse } = options;
  const deadlineMs = Date.now() + timeoutMs;
  const requestBody = buildGeminiRequestBody(options);
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!model) break;

    const attemptTimeoutMs = computeAttemptTimeoutMs(deadlineMs, timeoutMs, i, models.length - i);
    if (attemptTimeoutMs <= 0) break;

    try {
      const data = await callSingleGeminiModel(
        model,
        geminiApiKey,
        requestBody,
        attemptTimeoutMs,
        parseResponse,
      );
      return { data, model };
    } catch (err) {
      lastError = err;
      const hasMoreModels = i + 1 < models.length;
      if (hasMoreModels && isRetryableFailure(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new RetryableModelError("all-models-failed");
}
