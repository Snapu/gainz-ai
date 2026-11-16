const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const COACHING_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"] as const;

export const CLASSIFICATION_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiThinkingConfig {
  level: GeminiThinkingLevel;
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

function extractTextAndFinishReason(
  payload: unknown,
  trimText = true,
): {
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

  const rawText = textParts.join("");
  return {
    text: trimText ? rawText.trim() : rawText,
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

const LEGACY_THINKING_BUDGETS: Record<GeminiThinkingLevel, number> = {
  minimal: 0,
  low: 256,
  medium: 1024,
  high: 4096,
};

function resolveModelThinkingConfig(
  model: string,
  thinking: GeminiThinkingConfig,
): Record<string, unknown> {
  if (model.startsWith("gemini-2.5")) {
    return {
      thinkingBudget: LEGACY_THINKING_BUDGETS[thinking.level],
      includeThoughts: thinking.includeThoughts,
    };
  }
  const supportedLevel =
    thinking.level === "minimal" && !model.includes("lite") ? "low" : thinking.level;
  return {
    thinkingLevel: supportedLevel.toUpperCase(),
    includeThoughts: thinking.includeThoughts,
  };
}

function extractSafeUpstreamErrorCode(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { status?: unknown } };
    const status = parsed?.error?.status;
    if (typeof status === "string" && /^[A-Z0-9_]{1,40}$/.test(status)) {
      return status;
    }
  } catch {
    // Non-JSON upstream error body; omit body details to avoid leaking sensitive context
  }
  return "";
}

export function buildGeminiRequestBody(
  options: {
    contents: GeminiContent[];
    systemInstruction?: string;
    responseJsonSchema: Record<string, unknown>;
    temperature: number;
    topP?: number;
    thinkingConfig?: GeminiThinkingConfig;
  },
  model = "gemini-3.8-flash",
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: options.responseJsonSchema,
    temperature: options.temperature,
  };
  if (options.topP !== undefined) {
    generationConfig.topP = options.topP;
  }
  if (options.thinkingConfig) {
    generationConfig.thinkingConfig = resolveModelThinkingConfig(model, options.thinkingConfig);
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

function parseCompletedJson<T>(rawText: string, parseResponse: (parsedJson: unknown) => T): T {
  const cleanJsonText = stripMarkdownCodeFences(rawText);
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
}

async function fetchGeminiResponse(
  url: string,
  geminiApiKey: string,
  requestBody: Record<string, unknown>,
  signal: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
      ...extraHeaders,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    const safeCode = extractSafeUpstreamErrorCode(errorBody);
    const modelTag = /\/models\/([^/:]+)/.exec(url)?.[1] ?? "unknown";
    console.warn(
      `[gemini] model=${modelTag} status=${res.status}${safeCode ? ` code=${safeCode}` : ""}`,
    );
    if (isRetryableStatus(res.status)) {
      throw new RetryableModelError(`upstream-http-${res.status}`);
    }
    throw new NonRetryableModelError(res.status);
  }

  return res;
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
    const res = await fetchGeminiResponse(
      `${GEMINI_BASE_URL}/${model}:generateContent`,
      geminiApiKey,
      requestBody,
      controller.signal,
    );

    const payload = await res.json();
    const { text, finishReason } = extractTextAndFinishReason(payload);
    if (!text) {
      throw new RetryableModelError("empty-response");
    }
    if (finishReason && finishReason !== "STOP") {
      throw new RetryableModelError(`finish-${finishReason}`);
    }

    return parseCompletedJson(text, parseResponse);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseGeminiSseChunk(rawPayload: string): {
  text: string;
  finishReason?: string;
} {
  let chunkJson: unknown;
  try {
    chunkJson = JSON.parse(rawPayload);
  } catch {
    throw new RetryableModelError("invalid-sse-payload");
  }

  const parsed = extractTextAndFinishReason(chunkJson, false);
  if (parsed.finishReason && parsed.finishReason !== "STOP") {
    throw new RetryableModelError(`finish-${parsed.finishReason}`);
  }
  return parsed;
}

function createAttemptTimer(
  controller: AbortController,
  attemptTimeoutMs: number,
  deadlineMs: number,
) {
  let finished = false;
  let committed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(),
    attemptTimeoutMs,
  );

  return {
    extendToDeadline() {
      if (committed || finished || controller.signal.aborted) return;
      committed = true;
      clearTimeout(timeoutId);
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        timeoutId = undefined;
        controller.abort();
        return;
      }
      timeoutId = setTimeout(() => controller.abort(), remainingMs);
    },
    clear() {
      finished = true;
      clearTimeout(timeoutId);
      timeoutId = undefined;
    },
  };
}

async function streamSingleGeminiModel<T>(
  model: string,
  geminiApiKey: string,
  requestBody: Record<string, unknown>,
  attemptTimeoutMs: number,
  deadlineMs: number,
  parseResponse: (parsedJson: unknown) => T,
  onAccumulatedText: ((accumulatedText: string) => boolean | undefined) | undefined,
  markCommitted: () => void,
): Promise<T> {
  const controller = new AbortController();
  const timer = createAttemptTimer(controller, attemptTimeoutMs, deadlineMs);

  try {
    const res = await fetchGeminiResponse(
      `${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse`,
      geminiApiKey,
      requestBody,
      controller.signal,
      { Accept: "text/event-stream" },
    );

    if (!res.body) {
      throw new RetryableModelError("empty-response");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const onAbort = () => {
      void reader.cancel(controller.signal.reason).catch(() => {});
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });

    let sseBuffer = "";
    let dataLines: string[] = [];
    let accumulatedText = "";
    let lastFinishReason: string | undefined;

    const flushEvent = () => {
      if (dataLines.length === 0) return;
      const rawPayload = dataLines.join("\n").trim();
      dataLines = [];
      if (!rawPayload || rawPayload === "[DONE]") return;

      const { text, finishReason } = parseGeminiSseChunk(rawPayload);
      if (finishReason) lastFinishReason = finishReason;
      if (!text) return;

      accumulatedText += text;
      if (accumulatedText.trim().length > 0) {
        timer.extendToDeadline();
      }
      if (onAccumulatedText?.(accumulatedText) === true) {
        markCommitted();
      }
    };

    const consumeLine = (rawLine: string) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line === "") {
        flushEvent();
        return;
      }
      if (line.startsWith(":")) return;
      if (line.startsWith("data:")) {
        dataLines.push(line.startsWith("data: ") ? line.slice(6) : line.slice(5));
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        let newlineIdx = sseBuffer.indexOf("\n");
        while (newlineIdx !== -1) {
          consumeLine(sseBuffer.slice(0, newlineIdx));
          sseBuffer = sseBuffer.slice(newlineIdx + 1);
          newlineIdx = sseBuffer.indexOf("\n");
        }
      }
      sseBuffer += decoder.decode();
      if (sseBuffer.length > 0) {
        consumeLine(sseBuffer);
      }
      flushEvent();
    } finally {
      controller.signal.removeEventListener("abort", onAbort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (controller.signal.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    if (!accumulatedText.trim()) {
      throw new RetryableModelError("empty-response");
    }
    if (lastFinishReason && lastFinishReason !== "STOP") {
      throw new RetryableModelError(`finish-${lastFinishReason}`);
    }

    return parseCompletedJson(accumulatedText, parseResponse);
  } finally {
    timer.clear();
  }
}

function isRetryableFailure(err: unknown): boolean {
  if (err instanceof RetryableModelError) return true;
  if (!err || typeof err !== "object" || !("name" in err)) return false;
  const name = (err as { name: unknown }).name;
  return name === "AbortError" || name === "TimeoutError" || name === "TypeError";
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

export interface StreamWithFallbackOptions<T> extends GenerateWithFallbackOptions<T> {
  /** Return true once irreversible client output was emitted to halt further model fallback. */
  onAccumulatedText?: (accumulatedText: string) => boolean | undefined;
}

async function runModelsWithFallback<T>(
  options: GenerateWithFallbackOptions<T>,
  executeAttempt: (
    model: string,
    requestBody: Record<string, unknown>,
    attemptTimeoutMs: number,
    deadlineMs: number,
    markCommitted: () => void,
  ) => Promise<T>,
): Promise<{ data: T; model: string }> {
  const { models, timeoutMs } = options;
  const deadlineMs = Date.now() + timeoutMs;
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!model) break;

    const attemptTimeoutMs = computeAttemptTimeoutMs(deadlineMs, timeoutMs, i, models.length - i);
    if (attemptTimeoutMs <= 0) break;

    const requestBody = buildGeminiRequestBody(options, model);
    let committed = false;
    try {
      const data = await executeAttempt(model, requestBody, attemptTimeoutMs, deadlineMs, () => {
        committed = true;
      });
      return { data, model };
    } catch (err) {
      lastError = err;
      const hasMoreModels = i + 1 < models.length;
      if (!committed && hasMoreModels && isRetryableFailure(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new RetryableModelError("all-models-failed");
}

export async function generateWithFallback<T>(
  options: GenerateWithFallbackOptions<T>,
): Promise<{ data: T; model: string }> {
  return runModelsWithFallback(options, (model, requestBody, attemptTimeoutMs) =>
    callSingleGeminiModel(
      model,
      options.geminiApiKey,
      requestBody,
      attemptTimeoutMs,
      options.parseResponse,
    ),
  );
}

export async function streamWithFallback<T>(
  options: StreamWithFallbackOptions<T>,
): Promise<{ data: T; model: string }> {
  return runModelsWithFallback(
    options,
    (model, requestBody, attemptTimeoutMs, deadlineMs, markCommitted) =>
      streamSingleGeminiModel(
        model,
        options.geminiApiKey,
        requestBody,
        attemptTimeoutMs,
        deadlineMs,
        options.parseResponse,
        options.onAccumulatedText,
        markCommitted,
      ),
  );
}
