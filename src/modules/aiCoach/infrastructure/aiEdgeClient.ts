import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";

export class AiEdgeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AiEdgeHttpError";
    this.status = status;
  }
}

async function fetchAiEdgeResponse(options: {
  accessToken: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${options.accessToken}`,
    },
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new AiEdgeHttpError(response.status, `AI Edge Function returned ${response.status}`);
  }

  return response;
}

export async function postAiEdgeFunction<T>(options: {
  accessToken: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetchAiEdgeResponse({
      accessToken: options.accessToken,
      body: options.body,
      signal: controller.signal,
    });
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readCoachSseStream<T>(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onPreview?: (text: string) => void,
): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  let sseBuffer = "";
  let currentEvent = "message";
  let dataLines: string[] = [];
  let completedPayload: T | undefined;
  let hasCompleted = false;

  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      currentEvent = "message";
      return;
    }
    const rawData = dataLines.join("\n").trim();
    const eventName = currentEvent;
    dataLines = [];
    currentEvent = "message";
    if (!rawData) return;

    const parsed = JSON.parse(rawData) as Record<string, unknown>;
    if (eventName === "preview") {
      if (typeof parsed.text === "string") onPreview?.(parsed.text);
      return;
    }
    if (eventName === "error") {
      throw new AiEdgeHttpError(502, "coaching-request-server-error");
    }
    if (eventName === "complete") {
      completedPayload = parsed as T;
      hasCompleted = true;
    }
  };

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      dispatchEvent();
      return;
    }
    if (line.startsWith(":")) return;
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.startsWith("data: ") ? line.slice(6) : line.slice(5));
    }
  };

  try {
    while (!hasCompleted) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      let newlineIdx = sseBuffer.indexOf("\n");
      while (newlineIdx !== -1) {
        consumeLine(sseBuffer.slice(0, newlineIdx));
        sseBuffer = sseBuffer.slice(newlineIdx + 1);
        if (hasCompleted) break;
        newlineIdx = sseBuffer.indexOf("\n");
      }
    }
    if (!hasCompleted) {
      sseBuffer += decoder.decode();
      if (sseBuffer.length > 0) consumeLine(sseBuffer);
      dispatchEvent();
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (signal.aborted && !hasCompleted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  if (!hasCompleted) {
    throw new Error("coaching-stream-incomplete");
  }
  return completedPayload as T;
}

export async function postAiCoachStream<T>(options: {
  accessToken: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  onPreview?: (text: string) => void;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetchAiEdgeResponse({
      accessToken: options.accessToken,
      body: options.body,
      signal: controller.signal,
    });

    const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/event-stream")) {
      return (await response.json()) as T;
    }
    if (!response.body) {
      throw new Error("coaching-stream-missing-body");
    }

    return await readCoachSseStream<T>(response.body, controller.signal, options.onPreview);
  } finally {
    clearTimeout(timeoutId);
  }
}
