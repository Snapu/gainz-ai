import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";

export class AiEdgeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AiEdgeHttpError";
    this.status = status;
  }
}

export async function postAiEdgeFunction<T>(options: {
  accessToken: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiEdgeHttpError(response.status, `AI Edge Function returned ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
